import type { DbaContext } from "./dba-context";
import { PlanValidationError, type ValidationIssue } from "./errors";
import { buildPlanSchema, type GeneratedPlan } from "./plan-schema";
import { ETAPAS } from "@/lib/clase-viva/etapas";
import { deriveGradeBands } from "@/lib/clase-viva/grados";

export type ValidateInputs = {
  grados: number[];
  materiaIds: string[];
};

export type ValidateResult = {
  plan: GeneratedPlan;
};

/**
 * Validate a generated plan in two passes:
 *   Pass 1 — Zod schema (structural): shape, enums, lengths, exactly 5 fases.
 *   Pass 2 — Semantic:
 *     2a  dba_targets tokens resolve, belong to their (grado × materia) pair, no duplicates,
 *         evidencia_index in range (null only for Inglés)
 *     2b  every (grado × materia) pair has dba_targets
 *     2c  fases[i] has orden i+1 and the i-th etapa
 *     2d  variantes_por_grado only on actividad_por_grados and partitions the selected grades
 *         (actividad_por_grados is not allowed when the selection is a single band)
 *
 * On any failure, throws PlanValidationError with structured issues + the raw output for logging.
 */
export function validatePlan(
  rawOutput: unknown,
  ctx: DbaContext,
  inputs: ValidateInputs,
): ValidateResult {
  const schema = buildPlanSchema(inputs.grados, inputs.materiaIds);

  // Pass 1: structural
  const parsed = schema.safeParse(rawOutput);
  if (!parsed.success) {
    const issues: ValidationIssue[] = parsed.error.issues.map((issue) => ({
      kind: "zod_parse",
      message: issue.message,
      path: issue.path as (string | number)[],
    }));
    throw new PlanValidationError(issues, safeStringify(rawOutput));
  }

  const plan = parsed.data as GeneratedPlan;
  const issues: ValidationIssue[] = [];

  // Pass 2a: every token in dba_targets resolves + is for the right grado/materia pair
  const expectedPairs = new Set<string>();
  for (const g of inputs.grados) {
    for (const m of inputs.materiaIds) {
      expectedPairs.add(`${g}:${m}`);
    }
  }
  const seenPairs = new Set<string>();
  const duplicateGuard = new Map<string, Set<string>>(); // `${grado}:${materia}` -> set of dba_ids

  for (const target of plan.dba_targets) {
    const pairKey = `${target.grado}:${target.materia_id}`;
    // A pair split across two entries would give two rows with the same orden
    // and fail the RPC's unique constraint after the paid model calls.
    if (seenPairs.has(pairKey)) {
      issues.push({ kind: "duplicate_target_pair", grado: target.grado, materia_id: target.materia_id });
    }
    seenPairs.add(pairKey);

    const pairDupes = duplicateGuard.get(pairKey) ?? new Set<string>();

    for (const ref of target.dbas) {
      const entry = ctx.tokenToEntry.get(ref.dba_token);
      if (!entry) {
        issues.push({ kind: "unknown_token", token: ref.dba_token, where: "dba_targets" });
        continue;
      }
      if (entry.grado !== target.grado || entry.materia_id !== target.materia_id) {
        issues.push({
          kind: "target_token_wrong_pair",
          token: ref.dba_token,
          grado: target.grado,
          materia_id: target.materia_id,
        });
        continue;
      }

      if (pairDupes.has(entry.id)) {
        issues.push({
          kind: "duplicate_dba_target",
          grado: target.grado,
          materia_id: target.materia_id,
          dba_id: entry.id,
        });
        continue;
      }
      pairDupes.add(entry.id);

      // Validate evidencia_index
      if (ref.evidencia_index === null) {
        if (entry.materia_slug !== "ingles" && entry.evidencias.length > 0) {
          issues.push({ kind: "evidencia_required_for_non_ingles", token: ref.dba_token });
        }
      } else {
        if (ref.evidencia_index < 0 || ref.evidencia_index >= entry.evidencias.length) {
          issues.push({
            kind: "evidencia_index_out_of_range",
            token: ref.dba_token,
            index: ref.evidencia_index,
          });
        }
      }
    }
    duplicateGuard.set(pairKey, pairDupes);
  }

  // Pass 2b: cross-product coverage — every (grado × materia) must appear in dba_targets
  for (const pair of expectedPairs) {
    if (!seenPairs.has(pair)) {
      const [g, m] = pair.split(":");
      issues.push({ kind: "missing_cross_product", grado: Number(g), materia_id: m });
    }
  }

  // Pass 2c: fases are the five etapas, in order
  plan.fases.forEach((fase, i) => {
    const expected = ETAPAS[i];
    if (fase.orden !== i + 1 || fase.etapa !== expected) {
      issues.push({
        kind: "etapa_orden_mismatch",
        index: i,
        expected_etapa: expected,
        got_etapa: fase.etapa,
        got_orden: fase.orden,
      });
    }
  });

  // Pass 2d: grade-band variants only on actividad_por_grados, partitioning the selection
  const selected = new Set(inputs.grados);
  const singleBand = deriveGradeBands(inputs.grados).length <= 1;
  for (const fase of plan.fases) {
    fase.bloques.forEach((bloque, b) => {
      const isBands = bloque.tipo === "actividad_por_grados";
      if (!isBands) {
        if (bloque.variantes_por_grado !== null) {
          issues.push({ kind: "variantes_unexpected", fase: fase.orden, bloque: b, tipo: bloque.tipo });
        }
        return;
      }
      if (singleBand) {
        issues.push({ kind: "variantes_single_grade", fase: fase.orden, bloque: b });
        return;
      }
      if (!bloque.variantes_por_grado) {
        issues.push({ kind: "variantes_required", fase: fase.orden, bloque: b });
        return;
      }
      const seen = new Map<number, number>();
      for (const v of bloque.variantes_por_grado) {
        for (const grado of v.grados) seen.set(grado, (seen.get(grado) ?? 0) + 1);
      }
      const missing = [...selected].filter((gr) => !seen.has(gr)).sort((a, c) => a - c);
      const extra = [...seen.keys()].filter((gr) => !selected.has(gr)).sort((a, c) => a - c);
      const duplicated = [...seen.entries()]
        .filter(([, n]) => n > 1)
        .map(([gr]) => gr)
        .sort((a, c) => a - c);
      if (missing.length || extra.length || duplicated.length) {
        issues.push({ kind: "variantes_not_partition", fase: fase.orden, bloque: b, missing, extra, duplicated });
      }
    });
  }

  if (issues.length > 0) {
    throw new PlanValidationError(issues, safeStringify(rawOutput));
  }

  return { plan };
}

function safeStringify(value: unknown): string {
  try {
    return typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    return "[unstringifiable output]";
  }
}

export { PlanValidationError } from "./errors";
export type { GeneratedPlan } from "./plan-schema";
