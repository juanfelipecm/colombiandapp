import type { DbaContext } from "@/lib/ai/dba-context";
import type { GeneratedPlan } from "@/lib/ai/plan-schema";
import { BLOQUE_TIPO_LABEL } from "@/lib/clase-viva/bloques";
import { ETAPA_META, TOTAL_FASES } from "@/lib/clase-viva/etapas";
import { formatGrado, formatGradosBand, formatGradosList } from "@/lib/clase-viva/grados";

/**
 * Render a validated plan as Markdown in the shape of the Clase Viva reference
 * projects (header, tarea previa, five fases with blocks, Profe tips, DBA por
 * grado tables) for human review of eval outputs.
 */
export function renderPlanMarkdown(plan: GeneratedPlan, ctx: DbaContext): string {
  const out: string[] = [];
  const grados = [...new Set(plan.dba_targets.map((t) => t.grado))].sort((a, b) => a - b);
  const materiaNames = new Map<string, string>();
  for (const d of ctx.dbas) materiaNames.set(d.materia_id, d.materia_nombre);

  out.push(`# ${plan.titulo}`, "");
  out.push(`**Duración:** ${TOTAL_FASES} fases  `);
  out.push(`**Grados:** ${formatGradosList(grados)}  `);
  out.push(`**Áreas:** ${[...new Set(plan.dba_targets.map((t) => materiaNames.get(t.materia_id) ?? t.materia_id))].join(", ")}`, "");
  out.push(`> **Pregunta guía:** ${plan.pregunta_guia}`, "");
  if (plan.tarea_previa) out.push(`**¡Tarea antes de empezar el proyecto!** ${plan.tarea_previa}`, "");
  out.push(`**Materiales:** ${plan.materiales.join(", ")}`, "");

  for (const fase of plan.fases) {
    out.push(`## Fase ${fase.orden} - ${ETAPA_META[fase.etapa]?.nombre ?? fase.etapa}`, "");
    if (fase.gran_pregunta) out.push(`**Gran pregunta del día:** ${fase.gran_pregunta}`, "");
    for (const b of fase.bloques) {
      out.push(`**${b.titulo || BLOQUE_TIPO_LABEL[b.tipo]}**`, "");
      out.push(b.contenido, "");
      for (const v of b.variantes_por_grado ?? []) out.push(`- ${formatGradosBand(v.grados)}: ${v.contenido}`);
      if (b.variantes_por_grado?.length) out.push("");
      if (b.tip_profe) out.push(`> ${b.tip_profe}`, "");
    }
  }

  out.push(`## DBA por grado`, "");
  const byMateria = new Map<string, typeof plan.dba_targets>();
  for (const t of plan.dba_targets) byMateria.set(t.materia_id, [...(byMateria.get(t.materia_id) ?? []), t]);
  for (const [materiaId, targets] of byMateria) {
    out.push(`### ${materiaNames.get(materiaId) ?? materiaId}`, "");
    out.push(`| Grado | DBA | Evidencia |`, `|---|---|---|`);
    for (const t of [...targets].sort((a, b) => a.grado - b.grado)) {
      for (const ref of t.dbas) {
        const e = ctx.tokenToEntry.get(ref.dba_token);
        const ev = e && ref.evidencia_index !== null ? (e.evidencias[ref.evidencia_index]?.descripcion ?? "") : "";
        out.push(`| ${formatGrado(t.grado)} | ${e ? `DBA #${e.numero} — ${e.enunciado}` : ref.dba_token} | ${ev} |`);
      }
    }
    out.push("");
  }
  return out.join("\n");
}
