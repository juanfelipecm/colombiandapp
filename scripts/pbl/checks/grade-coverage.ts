import type { GeneratedPlan } from "@/lib/ai/plan-schema";

export type GradeCoverageResult = {
  ok: boolean;
  missing: Array<{ grado: string; materia_id: string; in: "dba_targets" | "phases" }>;
};

/**
 * Sanity check: every (grade × materia) pair the teacher selected should appear in dba_targets
 * AND in at least one phase's activities. The validator already enforces this structurally,
 * but re-checking here makes failures obvious in the eval log even if the prompt happens
 * to emit a degenerate but structurally-valid plan.
 */
export function runGradeCoverageCheck(
  plan: GeneratedPlan,
  grados: number[],
  materiaIds: string[],
): GradeCoverageResult {
  const missing: GradeCoverageResult["missing"] = [];

  const targetPairs = new Set(
    plan.dba_targets.map((t) => `${t.grado}:${t.materia_id}`),
  );
  for (const g of grados) {
    for (const m of materiaIds) {
      if (!targetPairs.has(`${g}:${m}`)) {
        missing.push({ grado: String(g), materia_id: m, in: "dba_targets" });
      }
    }
  }

  const phasePairs = new Set<string>();
  for (const phase of plan.fases) {
    for (const [grado, perMateria] of Object.entries(phase.actividades)) {
      for (const materia of Object.keys(perMateria)) {
        phasePairs.add(`${grado}:${materia}`);
      }
    }
  }
  for (const g of grados) {
    for (const m of materiaIds) {
      if (!phasePairs.has(`${g}:${m}`)) {
        missing.push({ grado: String(g), materia_id: m, in: "phases" });
      }
    }
  }

  return { ok: missing.length === 0, missing };
}
