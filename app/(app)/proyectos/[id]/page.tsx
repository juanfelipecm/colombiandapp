import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProjectView } from "./project-view";

type PageProps = {
  params: Promise<{ id: string }>;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ProjectPage({ params }: PageProps) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // RLS gates this to the owning teacher. Cross-teacher lookup returns no rows.
  const { data: project } = await supabase
    .from("projects")
    .select(
      "id, titulo, pregunta_guia, tema_contexto, duracion_semanas, producto_final, cierre_actividad, cierre_evaluacion, status, se_enseno_bien, created_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (!project) notFound();

  // Teacher selections
  const { data: grados } = await supabase
    .from("project_grados")
    .select("grado")
    .eq("project_id", id)
    .order("grado", { ascending: true });

  const { data: materiasRows } = await supabase
    .from("project_materias")
    .select("materia_id, materias!inner(slug, nombre)")
    .eq("project_id", id);

  const { count: studentCount } = await supabase
    .from("project_students")
    .select("*", { head: true, count: "exact" })
    .eq("project_id", id);

  // DBA targets with joined DBA + evidencia data
  const { data: dbaTargets } = await supabase
    .from("project_dba_targets")
    .select(
      "id, grado, materia_id, orden, dba_id, evidencia_id, derechos_basicos_aprendizaje!inner(numero, enunciado), evidencias_aprendizaje(descripcion)",
    )
    .eq("project_id", id)
    .order("grado", { ascending: true })
    .order("orden", { ascending: true });

  // Phases
  const { data: phases } = await supabase
    .from("project_phases")
    .select("id, orden, nombre, dias_label, descripcion, completed_at")
    .eq("project_id", id)
    .order("orden", { ascending: true });

  const phaseIds = (phases ?? []).map((p) => p.id);

  // Activities + refs
  const { data: activities } = phaseIds.length
    ? await supabase
        .from("project_activities")
        .select(
          "id, phase_id, grado, materia_id, tarea, evidencia_observable, project_activity_dba_refs(dba_target_id)",
        )
        .in("phase_id", phaseIds)
    : { data: [] };

  // Materiales
  const { data: materiales } = await supabase
    .from("project_materiales")
    .select("nombre, orden")
    .eq("project_id", id)
    .order("orden", { ascending: true });

  // Normalize nested shape
  type MateriasRow =
    | { slug: string; nombre: string }
    | { slug: string; nombre: string }[];
  const materiaById = new Map<string, { slug: string; nombre: string }>();
  for (const m of materiasRows ?? []) {
    const rel = (m as { materias: MateriasRow }).materias;
    const row = Array.isArray(rel) ? rel[0] : rel;
    materiaById.set(m.materia_id, row);
  }

  type DbaRel =
    | { numero: number; enunciado: string }
    | { numero: number; enunciado: string }[];
  type EvRel =
    | { descripcion: string }
    | { descripcion: string }[]
    | null;

  const targets = (dbaTargets ?? []).map((t) => {
    const dbaRel = (t as { derechos_basicos_aprendizaje: DbaRel }).derechos_basicos_aprendizaje;
    const dba = Array.isArray(dbaRel) ? dbaRel[0] : dbaRel;
    const evRel = (t as { evidencias_aprendizaje: EvRel }).evidencias_aprendizaje;
    const ev = evRel ? (Array.isArray(evRel) ? evRel[0] : evRel) : null;
    return {
      id: t.id,
      grado: t.grado,
      materia_id: t.materia_id,
      dba_numero: dba.numero,
      enunciado: dba.enunciado,
      evidencia: ev?.descripcion ?? null,
    };
  });

  const targetById = new Map(targets.map((t) => [t.id, t]));

  const phasesNormalized = (phases ?? []).map((ph) => {
    const phaseActs = (activities ?? []).filter((a) => a.phase_id === ph.id);
    const groupedByGrade = new Map<
      number,
      Map<
        string,
        {
          tarea: string;
          evidencia_observable: string;
          targetIds: string[];
        }
      >
    >();

    for (const act of phaseActs) {
      const refs = (act as { project_activity_dba_refs: { dba_target_id: string }[] | null })
        .project_activity_dba_refs ?? [];
      const targetIds = refs.map((r) => r.dba_target_id);
      const gradeMap = groupedByGrade.get(act.grado) ?? new Map();
      gradeMap.set(act.materia_id, {
        tarea: act.tarea,
        evidencia_observable: act.evidencia_observable,
        targetIds,
      });
      groupedByGrade.set(act.grado, gradeMap);
    }

    return {
      id: ph.id,
      orden: ph.orden,
      nombre: ph.nombre,
      dias_label: ph.dias_label,
      descripcion: ph.descripcion,
      completed_at: ph.completed_at,
      byGrade: [...groupedByGrade.entries()]
        .sort(([a], [b]) => a - b)
        .map(([grado, matMap]) => ({
          grado,
          byMateria: [...matMap.entries()].map(([materia_id, v]) => ({
            materia_id,
            materia_nombre: materiaById.get(materia_id)?.nombre ?? "",
            materia_slug: materiaById.get(materia_id)?.slug ?? "",
            ...v,
          })),
        })),
    };
  });

  return (
    <ProjectView
      project={{
        id: project.id,
        titulo: project.titulo,
        pregunta_guia: project.pregunta_guia,
        tema_contexto: project.tema_contexto,
        duracion_semanas: project.duracion_semanas,
        producto_final: project.producto_final,
        cierre_actividad: project.cierre_actividad,
        cierre_evaluacion: project.cierre_evaluacion,
        status: project.status as
          | "generado"
          | "en_ensenanza"
          | "completado"
          | "archivado",
        se_enseno_bien: project.se_enseno_bien,
        created_at: project.created_at,
      }}
      meta={{
        grados: (grados ?? []).map((g) => g.grado),
        materias: [...materiaById.entries()].map(([id, m]) => ({ id, ...m })),
        studentCount: studentCount ?? 0,
      }}
      targetsByGrade={groupTargetsByGrade(targets, materiaById)}
      phases={phasesNormalized}
      targetById={Object.fromEntries(targetById)}
      materiales={(materiales ?? []).map((m) => m.nombre)}
    />
  );
}

function groupTargetsByGrade(
  targets: Array<{
    id: string;
    grado: number;
    materia_id: string;
    dba_numero: number;
    enunciado: string;
    evidencia: string | null;
  }>,
  materiaById: Map<string, { slug: string; nombre: string }>,
) {
  const byGrade = new Map<
    number,
    Array<{
      materia_id: string;
      materia_nombre: string;
      materia_slug: string;
      dba_numero: number;
      enunciado: string;
      evidencia: string | null;
    }>
  >();
  for (const t of targets) {
    const list = byGrade.get(t.grado) ?? [];
    list.push({
      materia_id: t.materia_id,
      materia_nombre: materiaById.get(t.materia_id)?.nombre ?? "",
      materia_slug: materiaById.get(t.materia_id)?.slug ?? "",
      dba_numero: t.dba_numero,
      enunciado: t.enunciado,
      evidencia: t.evidencia,
    });
    byGrade.set(t.grado, list);
  }
  return [...byGrade.entries()]
    .sort(([a], [b]) => a - b)
    .map(([grado, items]) => ({ grado, items }));
}
