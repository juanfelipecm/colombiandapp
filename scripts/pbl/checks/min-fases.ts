import type { GeneratedPlan } from "@/lib/ai/plan-schema";

export function runMinFasesCheck(plan: GeneratedPlan, expectedMin: number) {
  return {
    ok: plan.fases.length >= expectedMin,
    actual: plan.fases.length,
    expected: expectedMin,
  };
}
