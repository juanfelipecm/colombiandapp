import { after, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { PROMPT_MODEL, PROMPT_VERSION } from "@/lib/ai/plan-schema";
import {
  assertInputs,
  checkDailyCap,
  checkKillSwitch,
  checkMonthlyBudget,
  resolveSchoolId,
  verifyStudentsOwnedByTeacher,
} from "@/lib/api/pbl-gate";
import { runProjectGeneration } from "@/lib/api/project-generation-runner";

export const runtime = "nodejs";
// Gives the after() callback room to call Anthropic (up to ~180s) + run the
// RPC + update the log row. Vercel Hobby caps at 60s regardless; Pro = 300s;
// Pro+ = 800s. Local dev (`npm run dev`) ignores this value.
export const maxDuration = 300;

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
    duracion_semanas: validated.duracion_semanas,
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
  after(async () => {
    await runProjectGeneration({
      admin,
      teacherId,
      schoolId,
      generationId,
      idempotencyKey,
      inputs: {
        grados: validated.grados,
        materia_ids: validated.materia_ids,
        studentCountsByGrade: studentCheck.studentCountsByGrade,
        duracion_semanas: validated.duracion_semanas,
        tema_contexto: validated.tema_contexto,
      },
      studentIds: validated.student_ids,
    });
  });

  return json({ generation_id: generationId, status: "pending" }, { status: 202 });
}
