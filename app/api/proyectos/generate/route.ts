import { after, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { generateProject, type GenerateAttempt } from "@/lib/ai/generate-project";
import { PlanValidationError } from "@/lib/ai/errors";
import type { WizardInputs } from "@/lib/ai/prompt-template";
import { PROMPT_MODEL, PROMPT_VERSION } from "@/lib/ai/plan-schema";
import { buildRpcPayload } from "@/lib/api/build-rpc-payload";
import {
  assertInputs,
  checkDailyCap,
  checkKillSwitch,
  checkMonthlyBudget,
  resolveSchoolId,
  verifyStudentsOwnedByTeacher,
} from "@/lib/api/pbl-gate";

export const runtime = "nodejs";
// Gives the after() callback room to call Anthropic (up to 200s per attempt) +
// run the RPC + update the log row. Production runs on Vercel Pro (300s).
// Local dev (`npm run dev`) ignores this value.
export const maxDuration = 300;
/** Generation deadline inside maxDuration; the orchestrator clamps/skips its retry to fit. */
const GENERATION_BUDGET_MS = 280_000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, init?: ResponseInit): NextResponse {
  return NextResponse.json(body, init);
}

export async function POST(request: Request): Promise<NextResponse> {
  // [A] Kill switch
  const ks = checkKillSwitch();
  if (!ks.ok) return json({ error: ks.code, message: ks.message }, { status: ks.status });

  // [B] Auth
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json({ error: "unauthorized" }, { status: 401 });
  const teacherId = user.id;

  // [C] Idempotency key
  const idempotencyKey = request.headers.get("Idempotency-Key");
  if (!idempotencyKey || !UUID_RE.test(idempotencyKey)) {
    return json(
      { error: "invalid_idempotency_key", message: "Idempotency-Key header must be a UUID v4" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // [D] Check monthly token budget
  const budget = await checkMonthlyBudget(admin);
  if (!budget.ok) return json({ error: budget.code, message: budget.message }, { status: budget.status });

  // [E] Idempotency: if this key already has a log row, return its current state.
  const { data: existingByKey } = await admin
    .from("project_generation_logs")
    .select("id, status, project_id, error_message")
    .eq("idempotency_key", idempotencyKey)
    .eq("teacher_id", teacherId)
    .is("parent_attempt_id", null)
    .maybeSingle();

  if (existingByKey) {
    return json(
      {
        generation_id: existingByKey.id,
        status: existingByKey.status,
        project_id: existingByKey.project_id,
      },
      { status: 200 },
    );
  }

  // [F] Daily cap
  const cap = await checkDailyCap(admin, teacherId);
  if (!cap.ok) return json({ error: cap.code, message: cap.message }, { status: cap.status });

  // [G] Body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, { status: 400 });
  }

  const validated = assertInputs(body);
  if ("error" in validated) {
    return json({ error: "invalid_inputs", message: validated.error }, { status: 400 });
  }

  // [H] Verify students belong to teacher + grades match
  const studentCheck = await verifyStudentsOwnedByTeacher(
    admin,
    teacherId,
    validated.student_ids,
    validated.grados,
  );
  if (!studentCheck.ok) {
    return json({ error: studentCheck.code, message: studentCheck.message }, { status: studentCheck.status });
  }

  const schoolId = await resolveSchoolId(admin, teacherId);
  if (!schoolId) {
    return json({ error: "no_school", message: "Agrega tu escuela primero." }, { status: 404 });
  }

  // [I] Insert pending log row — this is the generation_id the client will poll.
  const pendingInputs = {
    grados: validated.grados,
    materia_ids: validated.materia_ids,
    student_ids: validated.student_ids,
    studentCountsByGrade: studentCheck.studentCountsByGrade,
    tema_contexto: validated.tema_contexto,
  };

  const { data: pending, error: pendingErr } = await admin
    .from("project_generation_logs")
    .insert({
      teacher_id: teacherId,
      idempotency_key: idempotencyKey,
      attempt_number: 1,
      parent_attempt_id: null,
      status: "pending",
      prompt_version: PROMPT_VERSION,
      model: PROMPT_MODEL,
      inputs_jsonb: pendingInputs,
    })
    .select("id")
    .single();

  if (pendingErr || !pending) {
    return json(
      { error: "pending_log_failed", message: pendingErr?.message ?? "unknown" },
      { status: 500 },
    );
  }

  const generationId = pending.id;

  // [J] Fire-and-forget: `after` runs the actual work post-response.
  const deadlineAt = Date.now() + GENERATION_BUDGET_MS;
  after(async () => {
    await runGeneration({
      admin,
      teacherId,
      schoolId,
      generationId,
      idempotencyKey,
      inputs: {
        grados: validated.grados,
        materia_ids: validated.materia_ids,
        studentCountsByGrade: studentCheck.studentCountsByGrade,
        tema_contexto: validated.tema_contexto,
      },
      studentIds: validated.student_ids,
      deadlineAt,
    });
  });

  return json({ generation_id: generationId, status: "pending" }, { status: 202 });
}

type RunInputs = {
  admin: ReturnType<typeof createAdminClient>;
  teacherId: string;
  schoolId: string;
  generationId: string;
  idempotencyKey: string;
  inputs: WizardInputs;
  studentIds: string[];
  deadlineAt: number;
};

async function runGeneration(ctx: RunInputs): Promise<void> {
  const { admin, teacherId, schoolId, generationId, idempotencyKey, inputs, studentIds, deadlineAt } = ctx;

  try {
    const result = await generateProject(inputs, { supabase: admin, deadlineAt });
    const primaryAttempt = result.attempts[result.attempts.length - 1];

    // If the orchestrator retried, record the retry as a separate log row for observability.
    if (result.attempts.length > 1) {
      const firstAttempt = result.attempts[0];
      await admin
        .from("project_generation_logs")
        .insert({
          project_id: null,
          teacher_id: teacherId,
          idempotency_key: idempotencyKey,
          attempt_number: 1,
          parent_attempt_id: null,
          status: firstAttempt.status,
          prompt_version: result.prompt_version,
          model: result.model,
          inputs_jsonb: inputs,
          raw_output_jsonb: firstAttempt.raw_output
            ? { raw: firstAttempt.raw_output }
            : null,
          tokens_input: firstAttempt.tokens_input,
          tokens_output: firstAttempt.tokens_output,
          latency_ms: firstAttempt.latency_ms,
          error_message: firstAttempt.error_message,
        });
    }

    // Resolve tokens → UUIDs and call the atomic RPC.
    const payload = buildRpcPayload({
      plan: result.plan,
      ctx: result.ctx,
      teacherId,
      schoolId,
      idempotencyKey,
      studentIds,
      promptVersion: result.prompt_version,
      model: result.model,
      temaContexto: inputs.tema_contexto,
    });

    const { data: newProjectId, error: rpcErr } = await admin.rpc("create_project_from_plan", {
      plan: payload,
    });

    if (rpcErr || typeof newProjectId !== "string") {
      await admin
        .from("project_generation_logs")
        .update({
          status: "db_error",
          error_message: rpcErr?.message ?? "RPC returned no project_id",
          raw_output_jsonb: primaryAttempt.raw_output ? { raw: primaryAttempt.raw_output } : null,
          tokens_input: primaryAttempt.tokens_input,
          tokens_output: primaryAttempt.tokens_output,
          latency_ms: primaryAttempt.latency_ms,
          attempt_number: result.attempts.length === 2 ? 2 : 1,
          parent_attempt_id: null,
        })
        .eq("id", generationId);
      return;
    }

    // Final success.
    await admin
      .from("project_generation_logs")
      .update({
        status: "success",
        project_id: newProjectId,
        raw_output_jsonb: primaryAttempt.raw_output ? { raw: primaryAttempt.raw_output } : null,
        tokens_input: primaryAttempt.tokens_input,
        tokens_output: primaryAttempt.tokens_output,
        latency_ms: primaryAttempt.latency_ms,
        attempt_number: result.attempts.length === 2 ? 2 : 1,
      })
      .eq("id", generationId);
  } catch (err) {
    // Extract per-attempt data (attached as .cause by the orchestrator) so we
    // can persist tokens/latency + raw output for debugging.
    const attempts = extractAttempts(err);
    const finalAttempt = attempts.length > 0 ? attempts[attempts.length - 1] : null;

    // Classify from the attempt's own status: the timeout message
    // ("Anthropic call exceeded Nms") never contains the word "timeout".
    const status: "validation_failed" | "api_error" | "timeout" =
      err instanceof PlanValidationError
        ? "validation_failed"
        : finalAttempt?.status === "timeout"
          ? "timeout"
          : "api_error";

    // Build a rich error message: include structured issues when present,
    // otherwise fall back to the Error.message.
    const errorMessage =
      err instanceof PlanValidationError
        ? `${err.message}: ${err.issues.map((i) => JSON.stringify(i)).join("; ")}`
        : err instanceof Error
          ? err.message
          : String(err);

    // Persist the raw model output so we can see what Claude emitted.
    const rawOutput =
      err instanceof PlanValidationError && err.rawOutput
        ? { raw: err.rawOutput }
        : finalAttempt?.raw_output
          ? { raw: finalAttempt.raw_output }
          : null;

    await admin
      .from("project_generation_logs")
      .update({
        status,
        error_message: errorMessage,
        raw_output_jsonb: rawOutput,
        tokens_input: finalAttempt?.tokens_input ?? null,
        tokens_output: finalAttempt?.tokens_output ?? null,
        latency_ms: finalAttempt?.latency_ms ?? null,
        attempt_number: attempts.length === 2 ? 2 : 1,
      })
      .eq("id", generationId);

    // If the orchestrator retried, also record attempt 1 as its own log row.
    if (attempts.length > 1) {
      const firstAttempt = attempts[0];
      await admin.from("project_generation_logs").insert({
        project_id: null,
        teacher_id: teacherId,
        idempotency_key: idempotencyKey,
        attempt_number: 1,
        parent_attempt_id: null,
        status: firstAttempt.status,
        prompt_version: PROMPT_VERSION,
        model: PROMPT_MODEL,
        inputs_jsonb: inputs,
        raw_output_jsonb: firstAttempt.raw_output ? { raw: firstAttempt.raw_output } : null,
        tokens_input: firstAttempt.tokens_input,
        tokens_output: firstAttempt.tokens_output,
        latency_ms: firstAttempt.latency_ms,
        error_message: firstAttempt.error_message,
      });
    }
  }
}

function extractAttempts(err: unknown): GenerateAttempt[] {
  if (!(err instanceof Error)) return [];
  const cause = (err as Error & { cause?: unknown }).cause;
  return Array.isArray(cause) ? (cause as GenerateAttempt[]) : [];
}

