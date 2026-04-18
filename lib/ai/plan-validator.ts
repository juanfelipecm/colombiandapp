import type { DbaContext } from "./dba-context";
import { PlanValidationError, type ValidationIssue } from "./errors";
import { buildPlanSchema, type GeneratedPlan } from "./plan-schema";

export type ValidateInputs = {
  grados: number[];
  materiaIds: string[];
};

export type ValidateResult = {
  plan: GeneratedPlan;
};

/**
 * Validate a generated plan in two passes:
 *   Pass 1 — Zod schema (structural): catches shape, types, missing grade keys, out-of-range values.
 *   Pass 2 — Semantic: resolves tokens against tokenToUuid, checks cross-product coverage,
 *            verifies activity dba_tokens belong to their project's dba_targets for the same grado×materia,
 *            validates evidencia_index against the DBA's evidencias list.
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
          kind: "activity_token_not_in_targets",
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

  // Pass 2c: every activity's dba_tokens must appear in that project's dba_targets for the same pair
  const targetsByPair = new Map<string, Set<string>>();
  for (const target of plan.dba_targets) {
    const key = `${target.grado}:${target.materia_id}`;
    const tokens = new Set(target.dbas.map((d) => d.dba_token));
    targetsByPair.set(key, tokens);
  }

  for (const phase of plan.fases) {
    for (const [gradoStr, perMateria] of Object.entries(phase.actividades)) {
      const grado = Number(gradoStr);
      for (const [materiaId, activity] of Object.entries(perMateria)) {
        const pairKey = `${grado}:${materiaId}`;
        const allowedTokens = targetsByPair.get(pairKey);
        if (!allowedTokens) {
          // The schema-level check would have caught missing grade, but not missing materia.
          issues.push({ kind: "missing_cross_product", grado, materia_id: materiaId });
          continue;
        }
        for (const token of activity.dba_tokens) {
          if (!ctx.tokenToEntry.has(token)) {
            issues.push({ kind: "unknown_token", token, where: `fase ${phase.orden} / grado ${grado} / materia ${materiaId}` });
            continue;
          }
          if (!allowedTokens.has(token)) {
            issues.push({
              kind: "activity_token_not_in_targets",
              token,
              grado,
              materia_id: materiaId,
            });
          }
        }
      }
    }
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
