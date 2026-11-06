import type { GeneratedPlan } from "@/lib/ai/plan-schema";
import { deriveGradeBands } from "@/lib/clase-viva/grados";

/**
 * Hard: every actividad_por_grados partitions the selected grades (mirrors the
 * validator so the eval log shows it explicitly).
 * Soft (warning): with ≥ 2 bands, at least one actividad_por_grados exists.
 */
export function runBandsCoverageCheck(plan: GeneratedPlan, grados: number[]) {
  const problems: string[] = [];
  const warnings: string[] = [];
  const selected = new Set(grados);
  let bandBlocks = 0;
  for (const f of plan.fases) {
    f.bloques.forEach((b, i) => {
      if (b.tipo !== "actividad_por_grados") return;
      bandBlocks++;
      const seen = new Map<number, number>();
      for (const v of b.variantes_por_grado ?? []) for (const g of v.grados) seen.set(g, (seen.get(g) ?? 0) + 1);
      const missing = [...selected].filter((g) => !seen.has(g));
      const dup = [...seen].filter(([, n]) => n > 1).map(([g]) => g);
      if (missing.length || dup.length) problems.push(`fase ${f.orden} bloque ${i + 1}: missing [${missing}] dup [${dup}]`);
    });
  }
  if (deriveGradeBands(grados).length >= 2 && bandBlocks === 0) warnings.push("no actividad_por_grados in a multi-band project");
  return { ok: problems.length === 0, problems, warnings, bandBlocks };
}
