import { createAdminClient } from "@/lib/supabase/admin";
import { loadProjectPlan, type LoadedPhase, type TargetsByMateria } from "@/lib/projects/load-project";

export type ShareProject = {
  id: string;
  titulo: string;
  pregunta_guia: string;
  tarea_previa: string | null;
  updated_at: string;
};

export type ShareTargetsByMateria = TargetsByMateria;
export type SharePhase = Omit<LoadedPhase, "id" | "completed_at">;

export type ShareData = {
  project: ShareProject;
  grados: number[];
  materias: Array<{ nombre: string; slug: string }>;
  studentCount: number;
  targetsByMateria: ShareTargetsByMateria;
  phases: SharePhase[];
  materiales: string[];
  invalidoCount: number;
};

export type LoadResult =
  | { ok: true; data: ShareData; teacherId: string }
  | { ok: false; error: "not_found" | "no_phases" };

// Thin adapter over the shared loader. Uses the admin client because the
// upstream API route already auth-checked the caller.
export async function loadShareData(projectId: string): Promise<LoadResult> {
  const plan = await loadProjectPlan(createAdminClient(), projectId);
  if (!plan) return { ok: false, error: "not_found" };
  if (plan.phases.length === 0) return { ok: false, error: "no_phases" };

  return {
    ok: true,
    teacherId: plan.project.teacher_id,
    data: {
      project: {
        id: plan.project.id,
        titulo: plan.project.titulo,
        pregunta_guia: plan.project.pregunta_guia,
        tarea_previa: plan.project.tarea_previa,
        updated_at: plan.project.updated_at,
      },
      grados: plan.grados,
      materias: plan.materias.map((m) => ({ nombre: m.nombre, slug: m.slug })),
      studentCount: plan.studentCount,
      targetsByMateria: plan.targetsByMateria,
      phases: plan.phases.map((p) => ({
        orden: p.orden,
        etapa: p.etapa,
        nombre: p.nombre,
        gran_pregunta: p.gran_pregunta,
        bloques: p.bloques,
      })),
      materiales: plan.materiales,
      invalidoCount: plan.invalidoCount,
    },
  };
}
