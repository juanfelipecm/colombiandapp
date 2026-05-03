import { createAdminClient } from "@/lib/supabase/admin";

export type ShareProject = {
  id: string;
  titulo: string;
  pregunta_guia: string;
  duracion_semanas: number;
  producto_final: string;
  cierre_actividad: string;
  cierre_evaluacion: string;
  updated_at: string;
};

export type ShareTargetsByGrade = Array<{
  grado: number;
  items: Array<{
    materia_nombre: string;
    materia_slug: string;
    dba_numero: number;
    enunciado: string;
    evidencia: string | null;
  }>;
}>;

export type SharePhase = {
  orden: number;
  nombre: string;
  dias_label: string;
  descripcion: string;
  byGrade: Array<{
    grado: number;
    byMateria: Array<{
      materia_nombre: string;
      materia_slug: string;
      tarea: string;
      evidencia_observable: string;
    }>;
  }>;
};

export type ShareData = {
  project: ShareProject;
  grados: number[];
  studentCount: number;
  targetsByGrade: ShareTargetsByGrade;
  phases: SharePhase[];
  materiales: string[];
};

export type LoadResult =
  | { ok: true; data: ShareData; teacherId: string }
  | { ok: false; error: "not_found" | "no_phases" };

// Loads everything the share infographic needs in one batched read. Uses the
// admin client because the upstream API route already auth-checked the caller.
export async function loadShareData(projectId: string): Promise<LoadResult> {
  const admin = createAdminClient();

  const { data: project } = await admin
    .from("projects")
    .select(
      "id, teacher_id, titulo, pregunta_guia, duracion_semanas, producto_final, cierre_actividad, cierre_evaluacion, updated_at, created_at",
    )
    .eq("id", projectId)
    .maybeSingle();

  if (!project) return { ok: false, error: "not_found" };

  const teacherId = project.teacher_id as string;
  const updatedAt = (project.updated_at ?? project.created_at) as string;

  const [
    { data: grados },
    { data: materiasRows },
    { count: studentCount },
    { data: dbaTargets },
    { data: phases },
    { data: materiales },
  ] = await Promise.all([
    admin.from("project_grados").select("grado").eq("project_id", projectId).order("grado"),
    admin
      .from("project_materias")
      .select("materia_id, materias!inner(slug, nombre)")
      .eq("project_id", projectId),
    admin
      .from("project_students")
      .select("*", { head: true, count: "exact" })
      .eq("project_id", projectId),
    admin
      .from("project_dba_targets")
      .select(
        "id, grado, materia_id, orden, derechos_basicos_aprendizaje!inner(numero, enunciado), evidencias_aprendizaje(descripcion)",
      )
      .eq("project_id", projectId)
      .order("grado")
      .order("orden"),
    admin
      .from("project_phases")
      .select("id, orden, nombre, dias_label, descripcion")
      .eq("project_id", projectId)
      .order("orden"),
    admin
      .from("project_materiales")
      .select("nombre, orden")
      .eq("project_id", projectId)
      .order("orden"),
  ]);

  if (!phases || phases.length === 0) return { ok: false, error: "no_phases" };

  const phaseIds = phases.map((p) => p.id);
  const { data: activities } = await admin
    .from("project_activities")
    .select("phase_id, grado, materia_id, tarea, evidencia_observable")
    .in("phase_id", phaseIds);

  type MateriasRow = { slug: string; nombre: string } | { slug: string; nombre: string }[];
  const materiaById = new Map<string, { slug: string; nombre: string }>();
  for (const m of materiasRows ?? []) {
    const rel = (m as { materias: MateriasRow }).materias;
    const row = Array.isArray(rel) ? rel[0] : rel;
    materiaById.set(m.materia_id, row);
  }

  type DbaRel = { numero: number; enunciado: string } | { numero: number; enunciado: string }[];
  type EvRel = { descripcion: string } | { descripcion: string }[] | null;

  const targets = (dbaTargets ?? []).map((t) => {
    const dbaRel = (t as { derechos_basicos_aprendizaje: DbaRel }).derechos_basicos_aprendizaje;
    const dba = Array.isArray(dbaRel) ? dbaRel[0] : dbaRel;
    const evRel = (t as { evidencias_aprendizaje: EvRel }).evidencias_aprendizaje;
    const ev = evRel ? (Array.isArray(evRel) ? evRel[0] : evRel) : null;
    const m = materiaById.get(t.materia_id);
    return {
      grado: t.grado as number,
      materia_nombre: m?.nombre ?? "",
      materia_slug: m?.slug ?? "",
      dba_numero: dba.numero,
      enunciado: dba.enunciado,
      evidencia: ev?.descripcion ?? null,
    };
  });

  const targetsByGrade: ShareTargetsByGrade = (() => {
    const byGrade = new Map<number, ShareTargetsByGrade[number]["items"]>();
    for (const t of targets) {
      const list = byGrade.get(t.grado) ?? [];
      list.push({
        materia_nombre: t.materia_nombre,
        materia_slug: t.materia_slug,
        dba_numero: t.dba_numero,
        enunciado: t.enunciado,
        evidencia: t.evidencia,
      });
      byGrade.set(t.grado, list);
    }
    return [...byGrade.entries()].sort(([a], [b]) => a - b).map(([grado, items]) => ({ grado, items }));
  })();

  const phasesNormalized: SharePhase[] = phases.map((ph) => {
    const acts = (activities ?? []).filter((a) => a.phase_id === ph.id);
    const groupedByGrade = new Map<number, Map<string, { tarea: string; evidencia_observable: string }>>();
    for (const a of acts) {
      const gradeMap = groupedByGrade.get(a.grado) ?? new Map();
      gradeMap.set(a.materia_id, { tarea: a.tarea, evidencia_observable: a.evidencia_observable });
      groupedByGrade.set(a.grado, gradeMap);
    }
    return {
      orden: ph.orden,
      nombre: ph.nombre,
      dias_label: ph.dias_label,
      descripcion: ph.descripcion,
      byGrade: [...groupedByGrade.entries()]
        .sort(([a], [b]) => a - b)
        .map(([grado, matMap]) => ({
          grado,
          byMateria: [...matMap.entries()].map(([materia_id, v]) => {
            const m = materiaById.get(materia_id);
            return {
              materia_nombre: m?.nombre ?? "",
              materia_slug: m?.slug ?? "",
              ...v,
            };
          }),
        })),
    };
  });

  return {
    ok: true,
    teacherId,
    data: {
      project: {
        id: project.id,
        titulo: project.titulo,
        pregunta_guia: project.pregunta_guia,
        duracion_semanas: project.duracion_semanas,
        producto_final: project.producto_final,
        cierre_actividad: project.cierre_actividad,
        cierre_evaluacion: project.cierre_evaluacion,
        updated_at: updatedAt,
      },
      grados: (grados ?? []).map((g) => g.grado as number),
      studentCount: studentCount ?? 0,
      targetsByGrade,
      phases: phasesNormalized,
      materiales: (materiales ?? []).map((m) => m.nombre as string),
    },
  };
}
