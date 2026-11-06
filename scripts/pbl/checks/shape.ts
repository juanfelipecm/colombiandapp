import type { GeneratedPlan } from "@/lib/ai/plan-schema";

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

/**
 * Soft pedagogical checks (warnings only, never fail a fixture):
 *  - a tarea sent in fase N is retaken in fase N+1
 *  - tarea_previa is retaken in fase 1
 *  - each fase ends with a cierre
 *  - fase 4 uses the feedback and "antes pensaba / ahora pienso" routines
 *  - no emoji anywhere
 */
export function runShapeCheck(plan: GeneratedPlan) {
  const warnings: string[] = [];
  const text = (i: number) => plan.fases[i]?.bloques.map((b) => `${b.titulo} ${b.contenido}`).join(" ").toLowerCase() ?? "";
  const retakes = /(tarea|trajeron|traje|casa|familia)/;

  plan.fases.forEach((f, i) => {
    if (f.bloques.some((b) => b.tipo === "tarea") && i < 4 && !retakes.test(text(i + 1))) {
      warnings.push(`fase ${f.orden} sends a tarea but fase ${f.orden + 1} does not seem to retake it`);
    }
    if (f.bloques.at(-1)?.tipo !== "cierre") warnings.push(`fase ${f.orden} does not end with a cierre`);
  });
  if (plan.tarea_previa && !retakes.test(text(0))) warnings.push("tarea_previa is not retaken in fase 1");
  const f4 = text(3);
  if (!/me gustó/.test(f4)) warnings.push("fase 4 lacks the 'Una cosa que me gustó' routine");
  if (!/ahora pienso/.test(f4)) warnings.push("fase 4 lacks 'Antes pensaba… ahora pienso…'");
  if (EMOJI.test(JSON.stringify(plan))) warnings.push("emoji found in the plan");
  return { warnings };
}
