import type { DbaContext } from "@/lib/ai/dba-context";
import type { GeneratedPlan } from "@/lib/ai/plan-schema";

/**
 * Render a validated plan as a teacher-readable Markdown document.
 * Suitable for WhatsApp forwarding, printing, and human review during the
 * prompt-proofing eval.
 *
 * Resolves DBA tokens back to their enunciados + targeted evidencias so
 * the human reader can see the full pedagogical context.
 */
export function renderPlanMarkdown(plan: GeneratedPlan, ctx: DbaContext): string {
  const out: string[] = [];

  out.push(`# ${plan.titulo}`);
  out.push("");
  out.push(`> **Pregunta guía.** ${plan.pregunta_guia}`);
  out.push("");
  out.push(`**Producto final.** ${plan.producto_final}`);
  out.push("");

  // DBA targets summary
  out.push(`## DBAs objetivo`);
  out.push("");
  const targetsByGrade = new Map<number, typeof plan.dba_targets>();
  for (const t of plan.dba_targets) {
    const bucket = targetsByGrade.get(t.grado) ?? [];
    bucket.push(t);
    targetsByGrade.set(t.grado, bucket);
  }
  const grades = [...targetsByGrade.keys()].sort((a, b) => a - b);
  for (const g of grades) {
    out.push(`**Grado ${g}**`);
    for (const target of targetsByGrade.get(g) ?? []) {
      for (const ref of target.dbas) {
        const entry = ctx.tokenToEntry.get(ref.dba_token);
        if (!entry) continue;
        const ev =
          ref.evidencia_index !== null && entry.evidencias[ref.evidencia_index]
            ? entry.evidencias[ref.evidencia_index]
            : null;
        out.push(
          `- _${entry.materia_nombre}_ — DBA #${entry.numero}: ${entry.enunciado}`,
        );
        if (ev) {
          out.push(`  - Evidencia: ${ev.descripcion}`);
        }
      }
    }
    out.push("");
  }

  // Phases
  out.push(`## Plan por fases`);
  out.push("");
  const sortedPhases = [...plan.fases].sort((a, b) => a.orden - b.orden);
  for (const phase of sortedPhases) {
    out.push(`### Fase ${phase.orden} · ${phase.nombre} (${phase.dias_label})`);
    out.push("");
    out.push(phase.descripcion);
    out.push("");

    const phaseGrades = [...Object.keys(phase.actividades)].sort(
      (a, b) => Number(a) - Number(b),
    );
    for (const gradoStr of phaseGrades) {
      out.push(`**Grado ${gradoStr}**`);
      const perMateria = phase.actividades[gradoStr];
      for (const [materiaId, activity] of Object.entries(perMateria)) {
        const materiaName =
          ctx.dbas.find((d) => d.materia_id === materiaId)?.materia_nombre ??
          `Materia ${materiaId.slice(0, 6)}`;
        out.push(`- *${materiaName}.* ${activity.tarea}`);
        out.push(`  - Evidencia observable: ${activity.evidencia_observable}`);
        const dbaLabels = activity.dba_tokens
          .map((tok) => {
            const e = ctx.tokenToEntry.get(tok);
            return e ? `${e.materia_nombre} DBA #${e.numero}` : tok;
          })
          .join(", ");
        if (dbaLabels) out.push(`  - DBAs referidos: ${dbaLabels}`);
      }
      out.push("");
    }
  }

  // Materials
  out.push(`## Materiales`);
  out.push("");
  for (const m of plan.materiales) out.push(`- ${m}`);
  out.push("");

  // Closing
  out.push(`## Cierre`);
  out.push("");
  out.push(`**Actividad de cierre.** ${plan.cierre_actividad}`);
  out.push("");
  out.push(`**Cómo evaluar.** ${plan.cierre_evaluacion}`);
  out.push("");

  return out.join("\n");
}
