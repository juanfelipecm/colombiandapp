import { describe, expect, it } from "vitest";
import { assignTokens, type DbaEntry } from "@/lib/ai/dba-context";
import { PlanValidationError, type ValidationIssue } from "@/lib/ai/errors";
import { validatePlan } from "@/lib/ai/plan-validator";
import { makeBloque, makePlan } from "../fixtures/clase-viva-plan";

const matLenguaje = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const matCn = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const matIngles = "cccccccc-cccc-cccc-cccc-cccccccccccc";

const dba = (overrides: Partial<DbaEntry>): DbaEntry => ({
  id: overrides.id ?? "dba-" + Math.random().toString(36).slice(2, 10),
  grado: overrides.grado ?? 1,
  numero: overrides.numero ?? 1,
  enunciado: overrides.enunciado ?? "Enunciado",
  materia_id: overrides.materia_id ?? matLenguaje,
  materia_slug: overrides.materia_slug ?? "lenguaje",
  materia_nombre: overrides.materia_nombre ?? "Lenguaje",
  evidencias: overrides.evidencias ?? [{ id: "ev-auto", numero: 1, descripcion: "Evidencia 1" }],
});

/** One DBA per (grado × materia), tokens D1..Dn in grado-major order. */
function ctxFor(grados: number[], materias: string[], extra: Partial<DbaEntry> = {}) {
  const entries = grados.flatMap((g) => materias.map((m) => dba({ grado: g, materia_id: m, ...extra })));
  const ctx = assignTokens(entries);
  const tokens: Record<string, string> = {};
  for (const d of ctx.dbas) tokens[`${d.grado}:${d.materia_id}`] = d.token;
  return { ctx, tokens };
}

function issuesOf(fn: () => unknown): ValidationIssue[] {
  try {
    fn();
  } catch (e) {
    if (e instanceof PlanValidationError) return e.issues;
    throw e;
  }
  throw new Error("expected PlanValidationError");
}

type Plan = ReturnType<typeof makePlan>;
const withFase = (plan: Plan, i: number, patch: Record<string, unknown>) => ({
  ...plan,
  fases: plan.fases.map((f, j) => (j === i ? { ...f, ...patch } : f)),
});

describe("validatePlan — DBA targets (unchanged rules)", () => {
  it("passes on a correct plan (1 grade × 1 materia)", () => {
    const { ctx, tokens } = ctxFor([1], [matLenguaje]);
    const out = validatePlan(makePlan([1], [matLenguaje], tokens), ctx, { grados: [1], materiaIds: [matLenguaje] });
    expect(out.plan.fases).toHaveLength(5);
  });

  it("passes on 3 grades × 2 materias with bands", () => {
    const g = [0, 2, 5];
    const { ctx, tokens } = ctxFor(g, [matLenguaje, matCn]);
    expect(() =>
      validatePlan(makePlan(g, [matLenguaje, matCn], tokens), ctx, { grados: g, materiaIds: [matLenguaje, matCn] }),
    ).not.toThrow();
  });

  it("rejects unknown token in dba_targets", () => {
    const { ctx } = ctxFor([1], [matLenguaje]);
    const issues = issuesOf(() =>
      validatePlan(makePlan([1], [matLenguaje], { [`1:${matLenguaje}`]: "D99" }), ctx, {
        grados: [1],
        materiaIds: [matLenguaje],
      }),
    );
    expect(issues.some((i) => i.kind === "unknown_token")).toBe(true);
  });

  it("rejects a token from another pair", () => {
    const { ctx, tokens } = ctxFor([1, 2], [matLenguaje]);
    const swapped = { [`1:${matLenguaje}`]: tokens[`2:${matLenguaje}`], [`2:${matLenguaje}`]: tokens[`2:${matLenguaje}`] };
    const issues = issuesOf(() =>
      validatePlan(makePlan([1, 2], [matLenguaje], swapped), ctx, { grados: [1, 2], materiaIds: [matLenguaje] }),
    );
    expect(issues.some((i) => i.kind === "target_token_wrong_pair")).toBe(true);
  });

  it("rejects missing (grade × materia) in dba_targets", () => {
    const { ctx, tokens } = ctxFor([1], [matLenguaje, matCn]);
    const plan = makePlan([1], [matLenguaje, matCn], tokens);
    plan.dba_targets = plan.dba_targets.filter((t) => t.materia_id === matLenguaje);
    const issues = issuesOf(() => validatePlan(plan, ctx, { grados: [1], materiaIds: [matLenguaje, matCn] }));
    expect(issues).toContainEqual({ kind: "missing_cross_product", grado: 1, materia_id: matCn });
  });

  it("rejects duplicate DBA in same pair", () => {
    const { ctx, tokens } = ctxFor([1], [matLenguaje]);
    const plan = makePlan([1], [matLenguaje], tokens);
    plan.dba_targets[0].dbas.push({ ...plan.dba_targets[0].dbas[0] });
    const issues = issuesOf(() => validatePlan(plan, ctx, { grados: [1], materiaIds: [matLenguaje] }));
    expect(issues.some((i) => i.kind === "duplicate_dba_target")).toBe(true);
  });

  it("accepts null evidencia_index for Inglés DBAs", () => {
    const { ctx, tokens } = ctxFor([3], [matIngles], { materia_slug: "ingles", evidencias: [] });
    const plan = makePlan([3], [matIngles], tokens);
    plan.dba_targets[0].dbas[0].evidencia_index = null;
    expect(() => validatePlan(plan, ctx, { grados: [3], materiaIds: [matIngles] })).not.toThrow();
  });

  it("rejects null evidencia_index for non-Inglés DBAs that have evidencias", () => {
    const { ctx, tokens } = ctxFor([1], [matLenguaje]);
    const plan = makePlan([1], [matLenguaje], tokens);
    plan.dba_targets[0].dbas[0].evidencia_index = null;
    const issues = issuesOf(() => validatePlan(plan, ctx, { grados: [1], materiaIds: [matLenguaje] }));
    expect(issues.some((i) => i.kind === "evidencia_required_for_non_ingles")).toBe(true);
  });

  it("rejects out-of-range evidencia_index", () => {
    const { ctx, tokens } = ctxFor([1], [matLenguaje]);
    const plan = makePlan([1], [matLenguaje], tokens);
    plan.dba_targets[0].dbas[0].evidencia_index = 7;
    const issues = issuesOf(() => validatePlan(plan, ctx, { grados: [1], materiaIds: [matLenguaje] }));
    expect(issues.some((i) => i.kind === "evidencia_index_out_of_range")).toBe(true);
  });

  it("attaches raw output to the error for logging", () => {
    const { ctx } = ctxFor([1], [matLenguaje]);
    try {
      validatePlan({ titulo: "x" }, ctx, { grados: [1], materiaIds: [matLenguaje] });
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(PlanValidationError);
      expect((e as PlanValidationError).rawOutput).toContain("titulo");
    }
  });
});

describe("validatePlan — Clase Viva structure", () => {
  it("rejects fases out of etapa order", () => {
    const { ctx, tokens } = ctxFor([1], [matLenguaje]);
    const plan = makePlan([1], [matLenguaje], tokens);
    [plan.fases[0], plan.fases[2]] = [plan.fases[2], plan.fases[0]];
    const issues = issuesOf(() => validatePlan(plan, ctx, { grados: [1], materiaIds: [matLenguaje] }));
    expect(issues.filter((i) => i.kind === "etapa_orden_mismatch")).toHaveLength(2);
  });

  it("rejects right etapa with wrong orden", () => {
    const { ctx, tokens } = ctxFor([1], [matLenguaje]);
    const plan = withFase(makePlan([1], [matLenguaje], tokens), 3, { orden: 5 });
    const issues = issuesOf(() => validatePlan(plan, ctx, { grados: [1], materiaIds: [matLenguaje] }));
    expect(issues).toContainEqual(
      expect.objectContaining({ kind: "etapa_orden_mismatch", index: 3, got_orden: 5 }),
    );
  });

  it("rejects actividad_por_grados without variantes", () => {
    const g = [1, 3];
    const { ctx, tokens } = ctxFor(g, [matLenguaje]);
    const b = makeBloque({ tipo: "actividad_por_grados", variantes_por_grado: null });
    const plan = withFase(makePlan(g, [matLenguaje], tokens), 1, { bloques: [makeBloque(), b] });
    const issues = issuesOf(() => validatePlan(plan, ctx, { grados: g, materiaIds: [matLenguaje] }));
    expect(issues).toContainEqual({ kind: "variantes_required", fase: 2, bloque: 1 });
  });

  it("rejects variantes on a non-band bloque", () => {
    const g = [1, 3];
    const { ctx, tokens } = ctxFor(g, [matLenguaje]);
    const b = makeBloque({
      variantes_por_grado: [
        { grados: [1], contenido: "Dibujan lo que observan en el patio." },
        { grados: [3], contenido: "Escriben lo que observan en el patio." },
      ],
    });
    const plan = withFase(makePlan(g, [matLenguaje], tokens), 0, { bloques: [makeBloque(), b] });
    const issues = issuesOf(() => validatePlan(plan, ctx, { grados: g, materiaIds: [matLenguaje] }));
    expect(issues).toContainEqual({ kind: "variantes_unexpected", fase: 1, bloque: 1, tipo: "actividad" });
  });

  it("rejects variants that miss a grade or repeat one", () => {
    const g = [0, 1, 2, 3];
    const { ctx, tokens } = ctxFor(g, [matLenguaje]);
    const b = makeBloque({
      tipo: "actividad_por_grados",
      variantes_por_grado: [
        { grados: [0, 1], contenido: "Dibujan lo que observan en el patio." },
        { grados: [1, 2], contenido: "Escriben lo que observan en el patio." },
      ],
    });
    const plan = withFase(makePlan(g, [matLenguaje], tokens), 1, { bloques: [makeBloque(), b] });
    const issues = issuesOf(() => validatePlan(plan, ctx, { grados: g, materiaIds: [matLenguaje] }));
    expect(issues).toContainEqual({
      kind: "variantes_not_partition",
      fase: 2,
      bloque: 1,
      missing: [3],
      extra: [],
      duplicated: [1],
    });
  });

  it("accepts a non-canonical but valid partition", () => {
    const g = [4, 5];
    const { ctx, tokens } = ctxFor(g, [matLenguaje]);
    const b = makeBloque({
      tipo: "actividad_por_grados",
      variantes_por_grado: [
        { grados: [4], contenido: "Investigan en parejas y registran." },
        { grados: [5], contenido: "Comparan fuentes y reconstruyen." },
      ],
    });
    // [4,5] is a single canonical band, so bands are not allowed here:
    const plan = withFase(makePlan(g, [matLenguaje], tokens), 1, { bloques: [makeBloque(), b] });
    const issues = issuesOf(() => validatePlan(plan, ctx, { grados: g, materiaIds: [matLenguaje] }));
    expect(issues).toContainEqual({ kind: "variantes_single_grade", fase: 2, bloque: 1 });

    // ...but [3,4] spans two bands and the split [3]/[4] is a valid partition.
    const g2 = [3, 4];
    const c2 = ctxFor(g2, [matLenguaje]);
    const b2 = makeBloque({
      tipo: "actividad_por_grados",
      variantes_por_grado: [
        { grados: [3], contenido: "Investigan en parejas y registran." },
        { grados: [4], contenido: "Comparan fuentes y reconstruyen." },
      ],
    });
    const plan2 = withFase(makePlan(g2, [matLenguaje], c2.tokens), 1, { bloques: [makeBloque(), b2] });
    expect(() => validatePlan(plan2, c2.ctx, { grados: g2, materiaIds: [matLenguaje] })).not.toThrow();
  });

  it("rejects actividad_por_grados for a single-band selection", () => {
    const g = [3];
    const { ctx, tokens } = ctxFor(g, [matLenguaje]);
    const b = makeBloque({
      tipo: "actividad_por_grados",
      variantes_por_grado: [
        { grados: [3], contenido: "Investigan en parejas y registran." },
        { grados: [3], contenido: "Comparan fuentes y reconstruyen." },
      ],
    });
    const plan = withFase(makePlan(g, [matLenguaje], tokens), 1, { bloques: [makeBloque(), b] });
    const issues = issuesOf(() => validatePlan(plan, ctx, { grados: g, materiaIds: [matLenguaje] }));
    expect(issues).toContainEqual({ kind: "variantes_single_grade", fase: 2, bloque: 1 });
  });

  it("a variant grade outside the selection is a zod_parse issue", () => {
    const g = [1, 3];
    const { ctx, tokens } = ctxFor(g, [matLenguaje]);
    const b = makeBloque({
      tipo: "actividad_por_grados",
      variantes_por_grado: [
        { grados: [1], contenido: "Dibujan lo que observan en el patio." },
        { grados: [5], contenido: "Escriben lo que observan en el patio." },
      ],
    });
    const plan = withFase(makePlan(g, [matLenguaje], tokens), 1, { bloques: [makeBloque(), b] });
    const issues = issuesOf(() => validatePlan(plan, ctx, { grados: g, materiaIds: [matLenguaje] }));
    expect(issues.every((i) => i.kind === "zod_parse")).toBe(true);
  });
});
