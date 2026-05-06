import type { SupabaseClient } from "@supabase/supabase-js";
import { generateProject, type GenerateAttempt } from "@/lib/ai/generate-project";
import { AnthropicError, PlanValidationError } from "@/lib/ai/errors";
import type { WizardInputs } from "@/lib/ai/prompt-template";
import { PROMPT_MODEL, PROMPT_VERSION, type GeneratedPlan } from "@/lib/ai/plan-schema";

export type RunProjectGenerationInputs = {
  admin: SupabaseClient;
  teacherId: string;
  schoolId: string;
  generationId: string;
  idempotencyKey: string;
  inputs: WizardInputs;
  studentIds: string[];
};

export type RunProjectGenerationResult =
  | { status: "success"; projectId: string }
  | { status: "validation_failed" | "api_error" | "timeout" | "db_error"; error: string };

export async function runProjectGeneration(
  ctx: RunProjectGenerationInputs,
): Promise<RunProjectGenerationResult> {
  const { admin, teacherId, schoolId, generationId, idempotencyKey, inputs, studentIds } = ctx;

  try {
    const result = await generateProject(inputs, { supabase: admin });
    const primaryAttempt = result.attempts[result.attempts.length - 1];

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
      duracionSemanas: inputs.duracion_semanas,
    });

    const { data: newProjectId, error: rpcErr } = await admin.rpc("create_project_from_plan", {
      plan: payload,
    });

    if (rpcErr || typeof newProjectId !== "string") {
      const error = rpcErr?.message ?? "RPC returned no project_id";
      await admin
        .from("project_generation_logs")
        .update({
          status: "db_error",
          error_message: error,
          raw_output_jsonb: primaryAttempt.raw_output ? { raw: primaryAttempt.raw_output } : null,
          tokens_input: primaryAttempt.tokens_input,
          tokens_output: primaryAttempt.tokens_output,
          latency_ms: primaryAttempt.latency_ms,
          attempt_number: result.attempts.length === 2 ? 2 : 1,
          parent_attempt_id: null,
        })
        .eq("id", generationId);
      return { status: "db_error", error };
    }

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

    return { status: "success", projectId: newProjectId };
  } catch (err) {
    const status: "validation_failed" | "api_error" | "timeout" =
      err instanceof PlanValidationError
        ? "validation_failed"
        : err instanceof AnthropicError && /timeout/i.test(err.message)
          ? "timeout"
          : "api_error";

    const attempts = extractAttempts(err);
    const finalAttempt = attempts.length > 0 ? attempts[attempts.length - 1] : null;
    const errorMessage =
      err instanceof PlanValidationError
        ? `${err.message}: ${err.issues.map((i) => JSON.stringify(i)).join("; ")}`
        : err instanceof Error
          ? err.message
          : String(err);
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

    return { status, error: errorMessage };
  }
}

function extractAttempts(err: unknown): GenerateAttempt[] {
  if (!(err instanceof Error)) return [];
  const cause = (err as Error & { cause?: unknown }).cause;
  return Array.isArray(cause) ? (cause as GenerateAttempt[]) : [];
}

type BuildRpcArgs = {
  plan: GeneratedPlan;
  ctx: import("@/lib/ai/dba-context").DbaContext;
  teacherId: string;
  schoolId: string;
  idempotencyKey: string;
  studentIds: string[];
  promptVersion: string;
  model: string;
  temaContexto: string | null;
  duracionSemanas: 1 | 2;
};

function buildRpcPayload(args: BuildRpcArgs) {
  const {
    plan,
    ctx,
    teacherId,
    schoolId,
    idempotencyKey,
    studentIds,
    promptVersion,
    model,
    temaContexto,
    duracionSemanas,
  } = args;

  const dba_targets = plan.dba_targets.flatMap((target) =>
    target.dbas.map((ref, orden_idx) => {
      const entry = ctx.tokenToEntry.get(ref.dba_token);
      if (!entry) throw new Error(`token ${ref.dba_token} missing from ctx (should have been validated)`);
      const evidenciaId =
        ref.evidencia_index !== null && entry.evidencias[ref.evidencia_index]
          ? entry.evidencias[ref.evidencia_index].id
          : null;
      return {
        grado: target.grado,
        materia_id: target.materia_id,
        dba_id: entry.id,
        evidencia_id: evidenciaId,
        orden: orden_idx + 1,
      };
    }),
  );

  const grados = [...new Set(plan.dba_targets.map((t) => t.grado))].sort((a, b) => a - b);
  const materia_ids = [...new Set(plan.dba_targets.map((t) => t.materia_id))];

  const fases = plan.fases.map((phase) => ({
    orden: phase.orden,
    nombre: phase.nombre,
    dias_label: phase.dias_label,
    descripcion: phase.descripcion,
    activities: Object.entries(phase.actividades).flatMap(([gradoStr, perMateria]) =>
      Object.entries(perMateria).map(([materiaId, activity]) => ({
        grado: Number(gradoStr),
        materia_id: materiaId,
        tarea: activity.tarea,
        evidencia_observable: activity.evidencia_observable,
        dba_ids: activity.dba_tokens.map((tok) => {
          const entry = ctx.tokenToEntry.get(tok);
          if (!entry) throw new Error(`token ${tok} missing from ctx`);
          return entry.id;
        }),
      })),
    ),
  }));

  return {
    teacher_id: teacherId,
    school_id: schoolId,
    idempotency_key: idempotencyKey,
    header: {
      titulo: plan.titulo,
      pregunta_guia: plan.pregunta_guia,
      tema_contexto: temaContexto ?? "",
      duracion_semanas: duracionSemanas,
      producto_final: plan.producto_final,
      cierre_actividad: plan.cierre_actividad,
      cierre_evaluacion: plan.cierre_evaluacion,
      prompt_version: promptVersion,
      model,
    },
    grados,
    materia_ids,
    student_ids: studentIds,
    dba_targets,
    materiales: plan.materiales,
    fases,
  };
}
