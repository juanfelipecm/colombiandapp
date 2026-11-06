import { describe, expect, it } from "vitest";
import { PlanValidationError, type ValidationIssue } from "@/lib/ai/errors";

const all: ValidationIssue[] = [
  { kind: "zod_parse", message: "Required", path: ["fases", 0, "etapa"] },
  { kind: "unknown_token", token: "D9", where: "dba_targets" },
  { kind: "missing_cross_product", grado: 2, materia_id: "m" },
  { kind: "target_token_wrong_pair", token: "D1", grado: 2, materia_id: "m" },
  { kind: "evidencia_index_out_of_range", token: "D1", index: 4 },
  { kind: "evidencia_required_for_non_ingles", token: "D1" },
  { kind: "duplicate_dba_target", grado: 1, materia_id: "m", dba_id: "x" },
  { kind: "etapa_orden_mismatch", index: 0, expected_etapa: "despertar_curiosidad", got_etapa: "crear", got_orden: 1 },
  { kind: "variantes_required", fase: 2, bloque: 0 },
  { kind: "variantes_unexpected", fase: 1, bloque: 2, tipo: "cierre" },
  { kind: "variantes_not_partition", fase: 2, bloque: 1, missing: [0], extra: [5], duplicated: [2] },
  { kind: "variantes_single_grade", fase: 2, bloque: 1 },
];

describe("PlanValidationError.toRetryHint", () => {
  it("renders every issue kind in Spanish", () => {
    for (const issue of all) {
      const hint = new PlanValidationError([issue], "").toRetryHint();
      expect(hint).toMatch(/^Tu respuesta anterior falló la validación/);
      expect(hint).not.toMatch(/undefined/);
    }
  });

  it("names grades in Spanish for partition errors", () => {
    const hint = new PlanValidationError([all[10]], "").toRetryHint();
    expect(hint).toContain("faltan Transición");
    expect(hint).toContain("sobran 5°");
    expect(hint).toContain("repetidos 2°");
    expect(hint).toContain("Fase 2, bloque 2");
  });

  it("caps the list at 8 issues and says how many were left out", () => {
    const many = Array.from({ length: 11 }, (_, i) => ({ kind: "unknown_token" as const, token: `D${i}`, where: "x" }));
    const hint = new PlanValidationError(many, "").toRetryHint();
    expect(hint.match(/^- Usaste/gm)).toHaveLength(8);
    expect(hint).toContain("y 3 error(es) más");
  });
});
