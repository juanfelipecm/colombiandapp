import type { SupabaseClient } from "@supabase/supabase-js";
import { parseBloques, type ReadBloque } from "@/lib/clase-viva/bloques";
import { isEtapa, type Etapa, type ProjectStatus } from "@/lib/clase-viva/etapas";

/**
 * One loader for everything that renders a Clase Viva project: the project
 * page (RLS client) and the share image/PDF (admin client, caller already
 * auth-checked). Same queries, same normalization.
 *
 *   projects ─┬─ project_grados / project_materias(→materias) / project_students(count)
 *             ├─ project_dba_targets(→dba, →evidencia)  → targetsByMateria (materia.orden, grado)
 *             ├─ project_phases (bloques jsonb → parseBloques)  — only rows with bloques
 *             └─ project_materiales
 *
 * Legacy pbl-v1 phases have no bloques; they are dropped, so a legacy project
 * loads with phases: [] and the view shows its "Volver a generar" state.
 */

export type LoadedMateria = { id: string; slug: string; nombre: string; orden: number };

export type LoadedTargetRow = {
  grado: number;
  dba_numero: number;
  enunciado: string;
  evidencia: string | null;
};

export type TargetsByMateria = Array<{
  materia_id: string;
  materia_nombre: string;
  materia_slug: string;
  rows: LoadedTargetRow[];
}>;

export type LoadedPhase = {
  id: string;
  orden: number;
  etapa: Etapa;
  nombre: string;
  gran_pregunta: string | null;
  bloques: ReadBloque[];
  completed_at: string | null;
};

export type LoadedProject = {
  id: string;
  teacher_id: string;
  titulo: string;
  pregunta_guia: string;
  tarea_previa: string | null;
  tema_contexto: string | null;
  prompt_version: string;
  status: ProjectStatus;
  se_enseno_bien: boolean | null;
  created_at: string;
  updated_at: string;
};

export type ProjectPlan = {
  project: LoadedProject;
  grados: number[];
  materias: LoadedMateria[];
  studentCount: number;
  targetsByMateria: TargetsByMateria;
  phases: LoadedPhase[];
  materiales: string[];
  /** Number of bloques that failed to parse (rendered as placeholders). */
  invalidoCount: number;
};

type One<T> = T | T[] | null;
const one = <T,>(v: One<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

export async function loadProjectPlan(
  client: SupabaseClient,
  projectId: string,
): Promise<ProjectPlan | null> {
  const { data: project } = await client
    .from("projects")
    .select(
      "id, teacher_id, titulo, pregunta_guia, tarea_previa, tema_contexto, prompt_version, status, se_enseno_bien, created_at, updated_at",
    )
    .eq("id", projectId)
    .maybeSingle();

  if (!project) return null;

  const [
    { data: grados },
    { data: materiasRows },
    { count: studentCount },
    { data: dbaTargets },
    { data: phases },
    { data: materiales },
  ] = await Promise.all([
    client.from("project_grados").select("grado").eq("project_id", projectId).order("grado"),
    client
      .from("project_materias")
      .select("materia_id, materias!inner(slug, nombre, orden)")
      .eq("project_id", projectId),
    client.from("project_students").select("*", { head: true, count: "exact" }).eq("project_id", projectId),
    client
      .from("project_dba_targets")
      .select(
        "grado, materia_id, orden, derechos_basicos_aprendizaje!inner(numero, enunciado), evidencias_aprendizaje(descripcion)",
      )
      .eq("project_id", projectId)
      .order("grado")
      .order("orden"),
    client
      .from("project_phases")
      .select("id, orden, etapa, nombre, gran_pregunta, bloques, completed_at")
      .eq("project_id", projectId)
      .order("orden"),
    client.from("project_materiales").select("nombre, orden").eq("project_id", projectId).order("orden"),
  ]);

  type MateriaRel = { slug: string; nombre: string; orden: number };
  const materias: LoadedMateria[] = (materiasRows ?? [])
    .map((m) => {
      const rel = one((m as { materias: One<MateriaRel> }).materias);
      return rel ? { id: m.materia_id as string, ...rel } : null;
    })
    .filter((m): m is LoadedMateria => m !== null)
    .sort((a, b) => a.orden - b.orden);
  const materiaById = new Map(materias.map((m) => [m.id, m]));

  type DbaRel = { numero: number; enunciado: string };
  type EvRel = { descripcion: string };
  const byMateria = new Map<string, LoadedTargetRow[]>();
  for (const t of dbaTargets ?? []) {
    const dba = one((t as { derechos_basicos_aprendizaje: One<DbaRel> }).derechos_basicos_aprendizaje);
    if (!dba) continue;
    const ev = one((t as { evidencias_aprendizaje: One<EvRel> }).evidencias_aprendizaje);
    const list = byMateria.get(t.materia_id as string) ?? [];
    list.push({ grado: t.grado as number, dba_numero: dba.numero, enunciado: dba.enunciado, evidencia: ev?.descripcion ?? null });
    byMateria.set(t.materia_id as string, list);
  }
  const targetsByMateria: TargetsByMateria = materias
    .filter((m) => byMateria.has(m.id))
    .map((m) => ({
      materia_id: m.id,
      materia_nombre: m.nombre,
      materia_slug: m.slug,
      rows: [...(byMateria.get(m.id) ?? [])].sort((a, b) => a.grado - b.grado),
    }));
  // Targets whose materia is missing from project_materias still show, at the end.
  for (const [id, rows] of byMateria) {
    if (!materiaById.has(id)) targetsByMateria.push({ materia_id: id, materia_nombre: "", materia_slug: "", rows });
  }

  let invalidoCount = 0;
  const loadedPhases: LoadedPhase[] = (phases ?? [])
    .filter((ph) => ph.bloques !== null && isEtapa(ph.etapa))
    .map((ph) => {
      const bloques = parseBloques(ph.bloques, { projectId });
      invalidoCount += bloques.filter((b) => b.tipo === "invalido").length;
      return {
        id: ph.id as string,
        orden: ph.orden as number,
        etapa: ph.etapa as Etapa,
        nombre: ph.nombre as string,
        gran_pregunta: (ph.gran_pregunta as string | null) ?? null,
        bloques,
        completed_at: (ph.completed_at as string | null) ?? null,
      };
    });

  return {
    project: {
      id: project.id,
      teacher_id: project.teacher_id,
      titulo: project.titulo,
      pregunta_guia: project.pregunta_guia,
      tarea_previa: project.tarea_previa ?? null,
      tema_contexto: project.tema_contexto ?? null,
      prompt_version: project.prompt_version,
      status: project.status as ProjectStatus,
      se_enseno_bien: project.se_enseno_bien ?? null,
      created_at: project.created_at,
      updated_at: project.updated_at ?? project.created_at,
    },
    grados: (grados ?? []).map((g) => g.grado as number),
    materias,
    studentCount: studentCount ?? 0,
    targetsByMateria,
    phases: loadedPhases,
    materiales: (materiales ?? []).map((m) => m.nombre as string),
    invalidoCount,
  };
}
