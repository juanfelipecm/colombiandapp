import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

type RelationOne<T> = T | T[];

type ProjectRow = {
  id: string;
  titulo: string;
  pregunta_guia: string;
  tema_contexto: string | null;
  duracion_semanas: number;
  producto_final: string;
  cierre_actividad: string;
  cierre_evaluacion: string;
};

type Materia = {
  id: string;
  slug: string;
  nombre: string;
};

type Target = {
  id: string;
  grado: number;
  materia_id: string;
  dba_numero: number;
  enunciado: string;
  evidencia: string | null;
};

type Phase = {
  id: string;
  orden: number;
  nombre: string;
  dias_label: string;
  descripcion: string;
  byGrade: Array<{
    grado: number;
    byMateria: Array<{
      materia_id: string;
      materia_nombre: string;
      materia_slug: string;
      tarea: string;
      evidencia_observable: string;
      targetIds: string[];
    }>;
  }>;
};

type ProjectDocument = {
  project: ProjectRow;
  meta: {
    grados: number[];
    materias: Materia[];
    studentCount: number;
  };
  targetsByGrade: Array<{
    grado: number;
    items: Array<Target & { materia_nombre: string; materia_slug: string }>;
  }>;
  targetById: Map<string, Target>;
  phases: Phase[];
  materiales: string[];
};

export async function renderProjectHtmlFile(projectId: string): Promise<{
  fileName: string;
  fileBuffer: Buffer;
} | null> {
  const doc = await loadProjectDocument(projectId);
  if (!doc) return null;

  return {
    fileName: `${slugify(doc.project.titulo) || "proyecto-colombiando"}.html`,
    fileBuffer: Buffer.from(buildHtml(doc), "utf-8"),
  };
}

async function loadProjectDocument(projectId: string): Promise<ProjectDocument | null> {
  const supabase = createAdminClient();

  const { data: project } = await supabase
    .from("projects")
    .select(
      "id, titulo, pregunta_guia, tema_contexto, duracion_semanas, producto_final, cierre_actividad, cierre_evaluacion",
    )
    .eq("id", projectId)
    .maybeSingle();

  if (!project) return null;

  const [
    { data: grados },
    { data: materiasRows },
    { count: studentCount },
    { data: dbaTargets },
    { data: phaseRows },
    { data: materiales },
  ] = await Promise.all([
    supabase
      .from("project_grados")
      .select("grado")
      .eq("project_id", projectId)
      .order("grado", { ascending: true }),
    supabase
      .from("project_materias")
      .select("materia_id, materias!inner(slug, nombre)")
      .eq("project_id", projectId),
    supabase
      .from("project_students")
      .select("*", { head: true, count: "exact" })
      .eq("project_id", projectId),
    supabase
      .from("project_dba_targets")
      .select(
        "id, grado, materia_id, orden, dba_id, evidencia_id, derechos_basicos_aprendizaje!inner(numero, enunciado), evidencias_aprendizaje(descripcion)",
      )
      .eq("project_id", projectId)
      .order("grado", { ascending: true })
      .order("orden", { ascending: true }),
    supabase
      .from("project_phases")
      .select("id, orden, nombre, dias_label, descripcion")
      .eq("project_id", projectId)
      .order("orden", { ascending: true }),
    supabase
      .from("project_materiales")
      .select("nombre, orden")
      .eq("project_id", projectId)
      .order("orden", { ascending: true }),
  ]);

  const materiaById = normalizeMaterias(materiasRows ?? []);
  const targets = normalizeTargets(dbaTargets ?? []);
  const targetById = new Map(targets.map((target) => [target.id, target]));
  const phases = await loadPhasesWithActivities(
    supabase,
    projectId,
    phaseRows ?? [],
    materiaById,
  );

  return {
    project: project as ProjectRow,
    meta: {
      grados: (grados ?? []).map((row: { grado: number }) => row.grado),
      materias: [...materiaById.entries()].map(([id, materia]) => ({
        id,
        ...materia,
      })),
      studentCount: studentCount ?? 0,
    },
    targetsByGrade: groupTargetsByGrade(targets, materiaById),
    targetById,
    phases,
    materiales: (materiales ?? []).map((row: { nombre: string }) => row.nombre),
  };
}

function normalizeMaterias(rows: unknown[]): Map<string, { slug: string; nombre: string }> {
  const materiaById = new Map<string, { slug: string; nombre: string }>();
  for (const row of rows) {
    const typed = row as {
      materia_id: string;
      materias: RelationOne<{ slug: string; nombre: string }>;
    };
    const materia = firstRelation(typed.materias);
    if (materia) materiaById.set(typed.materia_id, materia);
  }
  return materiaById;
}

function normalizeTargets(rows: unknown[]): Target[] {
  return rows.map((row) => {
    const typed = row as {
      id: string;
      grado: number;
      materia_id: string;
      derechos_basicos_aprendizaje: RelationOne<{
        numero: number;
        enunciado: string;
      }>;
      evidencias_aprendizaje:
        | RelationOne<{ descripcion: string }>
        | null;
    };
    const dba = firstRelation(typed.derechos_basicos_aprendizaje);
    const evidencia = typed.evidencias_aprendizaje
      ? firstRelation(typed.evidencias_aprendizaje)
      : null;
    return {
      id: typed.id,
      grado: typed.grado,
      materia_id: typed.materia_id,
      dba_numero: dba?.numero ?? 0,
      enunciado: dba?.enunciado ?? "",
      evidencia: evidencia?.descripcion ?? null,
    };
  });
}

async function loadPhasesWithActivities(
  supabase: SupabaseClient,
  projectId: string,
  phaseRows: unknown[],
  materiaById: Map<string, { slug: string; nombre: string }>,
): Promise<Phase[]> {
  const phases = phaseRows as Array<{
    id: string;
    orden: number;
    nombre: string;
    dias_label: string;
    descripcion: string;
  }>;
  const phaseIds = phases.map((phase) => phase.id);
  if (phaseIds.length === 0) return [];

  const { data: activities } = await supabase
    .from("project_activities")
    .select(
      "id, phase_id, grado, materia_id, tarea, evidencia_observable, project_activity_dba_refs(dba_target_id)",
    )
    .in("phase_id", phaseIds);

  return phases.map((phase) => {
    const phaseActivities = (activities ?? []).filter(
      (activity: { phase_id: string }) => activity.phase_id === phase.id,
    );
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

    for (const activity of phaseActivities) {
      const typed = activity as {
        grado: number;
        materia_id: string;
        tarea: string;
        evidencia_observable: string;
        project_activity_dba_refs:
          | Array<{ dba_target_id: string }>
          | null;
      };
      const refs = typed.project_activity_dba_refs ?? [];
      const gradeMap = groupedByGrade.get(typed.grado) ?? new Map();
      gradeMap.set(typed.materia_id, {
        tarea: typed.tarea,
        evidencia_observable: typed.evidencia_observable,
        targetIds: refs.map((ref) => ref.dba_target_id),
      });
      groupedByGrade.set(typed.grado, gradeMap);
    }

    return {
      ...phase,
      byGrade: [...groupedByGrade.entries()]
        .sort(([a], [b]) => a - b)
        .map(([grado, matMap]) => ({
          grado,
          byMateria: [...matMap.entries()].map(([materia_id, value]) => ({
            materia_id,
            materia_nombre: materiaById.get(materia_id)?.nombre ?? "",
            materia_slug: materiaById.get(materia_id)?.slug ?? "",
            ...value,
          })),
        })),
    };
  });
}

function groupTargetsByGrade(
  targets: Target[],
  materiaById: Map<string, { slug: string; nombre: string }>,
): ProjectDocument["targetsByGrade"] {
  const byGrade = new Map<
    number,
    Array<Target & { materia_nombre: string; materia_slug: string }>
  >();

  for (const target of targets) {
    const list = byGrade.get(target.grado) ?? [];
    list.push({
      ...target,
      materia_nombre: materiaById.get(target.materia_id)?.nombre ?? "",
      materia_slug: materiaById.get(target.materia_id)?.slug ?? "",
    });
    byGrade.set(target.grado, list);
  }

  return [...byGrade.entries()]
    .sort(([a], [b]) => a - b)
    .map(([grado, items]) => ({ grado, items }));
}

function buildHtml(doc: ProjectDocument): string {
  const { project, meta, phases, materiales, targetsByGrade, targetById } = doc;
  const body = [
    `<header class="hero">
      <p class="brand">ColombiAndo</p>
      <h1>${escapeHtml(project.titulo)}</h1>
      <p class="question">${escapeHtml(project.pregunta_guia)}</p>
      ${project.tema_contexto ? `<p class="context">${escapeHtml(project.tema_contexto)}</p>` : ""}
      <div class="meta">
        <span>${project.duracion_semanas} ${project.duracion_semanas === 1 ? "semana" : "semanas"}</span>
        <span>${meta.studentCount} ${meta.studentCount === 1 ? "estudiante" : "estudiantes"}</span>
        <span>Grados: ${escapeHtml(formatGrades(meta.grados))}</span>
        <span>Materias: ${escapeHtml(meta.materias.map((m) => m.nombre).join(" · "))}</span>
      </div>
    </header>`,
    section("Producto final", `<p>${escapeHtml(project.producto_final)}</p>`),
    section(
      "Plan por fases",
      phases.length > 0
        ? phases.map((phase) => renderPhase(phase, targetById)).join("\n")
        : `<p class="muted">(sin fases generadas)</p>`,
    ),
    section(
      "DBAs y evidencias",
      targetsByGrade.length > 0
        ? targetsByGrade.map(renderTargetsForGrade).join("\n")
        : `<p class="muted">(sin elementos)</p>`,
    ),
    section(
      "Materiales",
      materiales.length > 0
        ? `<ul>${materiales.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
        : `<p class="muted">(sin elementos)</p>`,
    ),
    section(
      "Cierre del proyecto",
      `<h3>Actividad</h3><p>${escapeHtml(project.cierre_actividad)}</p>
       <h3>Como evaluar</h3><p>${escapeHtml(project.cierre_evaluacion)}</p>`,
    ),
  ].join("\n");

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(project.titulo)} - ColombiAndo</title>
  <style>
    :root{color-scheme:light;--blue:#0060bb;--yellow:#ffd33d;--red:#d00000;--ink:#151515;--muted:#5f6368;--border:#e5e7eb;--paper:#fffdf7;--soft:#f7f8fa}
    *{box-sizing:border-box}
    body{margin:0;background:#fff;color:var(--ink);font-family:Arial,Helvetica,sans-serif;line-height:1.55}
    main{max-width:860px;margin:0 auto;padding:28px 18px 48px}
    .hero{border-bottom:4px solid var(--ink);padding-bottom:20px;margin-bottom:26px}
    .brand{display:inline-block;margin:0 0 12px;padding:5px 10px;background:var(--yellow);border:2px solid var(--ink);font-weight:700}
    h1{font-size:32px;line-height:1.1;margin:0 0 12px;color:var(--blue)}
    h2{font-size:22px;margin:30px 0 12px;padding-bottom:6px;border-bottom:2px solid var(--border);color:var(--blue)}
    h3{font-size:16px;margin:16px 0 6px}
    p{margin:0 0 10px}
    ul{margin:8px 0 0;padding-left:22px}
    li{margin:5px 0}
    .question{font-size:18px;color:var(--muted);margin-bottom:12px}
    .context{background:var(--paper);border-left:4px solid var(--yellow);padding:10px 12px}
    .meta{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
    .meta span,.pill{display:inline-block;border:1px solid var(--border);border-radius:999px;padding:4px 9px;font-size:12px;background:var(--soft)}
    section{break-inside:avoid}
    .phase{border:1px solid var(--border);border-radius:8px;margin:14px 0;padding:14px;background:#fff}
    .phase-head{display:flex;gap:10px;align-items:baseline;margin-bottom:6px}
    .phase-num{font-weight:700;color:var(--blue)}
    .days{font-size:12px;color:var(--muted)}
    .grade{background:var(--paper);border-radius:8px;padding:12px;margin:12px 0}
    .grade-title{font-weight:700;margin-bottom:8px}
    .activity{border-left:4px solid var(--blue);padding-left:10px;margin:10px 0}
    .subject{font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase}
    .observation{font-size:13px;color:var(--muted)}
    .dba-list{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
    .dba-detail{font-size:13px;color:var(--muted);margin:6px 0 0 8px}
    .muted{color:var(--muted)}
    @media print{main{max-width:none;padding:0}.hero{margin-top:0}.phase{break-inside:avoid}}
  </style>
</head>
<body><main>${body}</main></body>
</html>`;
}

function renderPhase(phase: Phase, targetById: Map<string, Target>): string {
  const gradeBlocks = phase.byGrade.length
    ? phase.byGrade
        .map(
          (grade) => `<div class="grade">
            <p class="grade-title">Grado ${grade.grado}</p>
            ${grade.byMateria.map((activity) => renderActivity(activity, targetById)).join("\n")}
          </div>`,
        )
        .join("\n")
    : `<p class="muted">(sin actividades)</p>`;

  return `<article class="phase">
    <div class="phase-head">
      <span class="phase-num">Fase ${phase.orden}</span>
      <h3>${escapeHtml(phase.nombre)}</h3>
      <span class="days">${escapeHtml(phase.dias_label)}</span>
    </div>
    <p>${escapeHtml(phase.descripcion)}</p>
    ${gradeBlocks}
  </article>`;
}

function renderActivity(
  activity: Phase["byGrade"][number]["byMateria"][number],
  targetById: Map<string, Target>,
): string {
  const dbaPills = activity.targetIds
    .map((id) => targetById.get(id))
    .filter((target): target is Target => Boolean(target))
    .map((target) => `<span class="pill">DBA #${target.dba_numero}</span>`)
    .join("");

  return `<div class="activity">
    <p class="subject">${escapeHtml(activity.materia_nombre)}</p>
    <p>${escapeHtml(activity.tarea)}</p>
    <p class="observation">Observacion en clase: ${escapeHtml(activity.evidencia_observable)}</p>
    ${dbaPills ? `<div class="dba-list">${dbaPills}</div>` : ""}
  </div>`;
}

function renderTargetsForGrade(group: ProjectDocument["targetsByGrade"][number]): string {
  return `<div class="grade">
    <p class="grade-title">Grado ${group.grado}</p>
    <ul>
      ${group.items
        .map(
          (target) => `<li>
            <strong>${escapeHtml(target.materia_nombre)}:</strong>
            DBA #${target.dba_numero} - ${escapeHtml(target.enunciado)}
            ${
              target.evidencia && target.materia_slug !== "ingles"
                ? `<p class="dba-detail">Evidencia: ${escapeHtml(target.evidencia)}</p>`
                : ""
            }
          </li>`,
        )
        .join("")}
    </ul>
  </div>`;
}

function section(title: string, html: string): string {
  return `<section><h2>${escapeHtml(title)}</h2>${html}</section>`;
}

function firstRelation<T>(value: RelationOne<T>): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function formatGrades(grades: number[]): string {
  return grades.length > 0 ? grades.map((grade) => `${grade}°`).join(" · ") : "(sin grados)";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
