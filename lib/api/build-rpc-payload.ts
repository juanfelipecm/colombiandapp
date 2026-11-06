import type { DbaContext } from "@/lib/ai/dba-context";
import type { GeneratedPlan } from "@/lib/ai/plan-schema";
import { ETAPA_META } from "@/lib/clase-viva/etapas";

export type BuildRpcArgs = {
  plan: GeneratedPlan;
  ctx: DbaContext;
  teacherId: string;
  schoolId: string;
  idempotencyKey: string;
  studentIds: string[];
  promptVersion: string;
  model: string;
  temaContexto: string | null;
};

/**
 * Turn a validated plan into the jsonb payload for create_project_from_plan
 * (supabase/migrations/008_clase_viva.sql). DBA tokens resolve to UUIDs here;
 * fase `nombre` comes from ETAPA_META so TypeScript owns the copy.
 */
export function buildRpcPayload(args: BuildRpcArgs) {
  const { plan, ctx, teacherId, schoolId, idempotencyKey, studentIds, promptVersion, model, temaContexto } = args;

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

  const fases = plan.fases.map((fase) => ({
    orden: fase.orden,
    etapa: fase.etapa,
    nombre: ETAPA_META[fase.etapa].nombre,
    gran_pregunta: fase.gran_pregunta,
    bloques: fase.bloques,
  }));

  return {
    teacher_id: teacherId,
    school_id: schoolId,
    idempotency_key: idempotencyKey,
    header: {
      titulo: plan.titulo,
      pregunta_guia: plan.pregunta_guia,
      tema_contexto: temaContexto ?? "",
      tarea_previa: plan.tarea_previa ?? "",
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
