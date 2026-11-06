import type { GeneratedPlan } from "@/lib/ai/plan-schema";
import { ETAPAS } from "@/lib/clase-viva/etapas";

const STOP = new Set(["el", "la", "los", "las", "de", "del", "en", "y", "a", "que", "un", "una", "con", "por", "para", "se", "su", "sus", "es", "al", "lo", "como", "cómo", "qué", "nuestra", "nuestro"]);

function words(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[¿?¡!.,;:()"]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w)),
  );
}

/** Hard check: 5 fases in etapa order, 2..8 bloques each, fase 5 closes by returning to the pregunta guía. */
export function runFiveFasesCheck(plan: GeneratedPlan) {
  const problems: string[] = [];
  if (plan.fases.length !== 5) problems.push(`expected 5 fases, got ${plan.fases.length}`);
  plan.fases.forEach((f, i) => {
    if (f.orden !== i + 1 || f.etapa !== ETAPAS[i]) problems.push(`fase[${i}] is ${f.orden}/${f.etapa}, expected ${i + 1}/${ETAPAS[i]}`);
    if (f.bloques.length < 2 || f.bloques.length > 8) problems.push(`fase ${f.orden} has ${f.bloques.length} bloques`);
  });
  const last = plan.fases[4]?.bloques.at(-1);
  if (!last || last.tipo !== "cierre") {
    problems.push("fase 5 does not end with a cierre bloque");
  } else {
    const q = words(plan.pregunta_guia);
    const shared = [...words(last.contenido)].filter((w) => q.has(w)).length;
    if (shared < 2) problems.push("fase 5 cierre does not appear to return to the pregunta guía");
  }
  return { ok: problems.length === 0, problems };
}
