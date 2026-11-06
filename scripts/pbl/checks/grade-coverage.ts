import type { GeneratedPlan } from "@/lib/ai/plan-schema";

export type GradeCoverageResult = {
  ok: boolean;
  missing: Array<{ grado: string; materia_id: string }>;
};

/**
 * Sanity check: every (grade × materia) pair the teacher selected appears in
 * dba_targets. The validator enforces this too; re-checking here makes
 * failures obvious in the eval log.
 */
export function runGradeCoverageCheck(plan: GeneratedPlan, grados: number[], materiaIds: string[]): GradeCoverageResult {
  const missing: GradeCoverageResult["missing"] = [];
  const targetPairs = new Set(plan.dba_targets.map((t) => `${t.grado}:${t.materia_id}`));
  for (const g of grados) {
    for (const m of materiaIds) {
      if (!targetPairs.has(`${g}:${m}`)) missing.push({ grado: String(g), materia_id: m });
    }
  }
  return { ok: missing.length === 0, missing };
}
