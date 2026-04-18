import { describe, expect, it } from "vitest";
import { assignTokens, type DbaEntry } from "@/lib/ai/dba-context";
import { PlanValidationError } from "@/lib/ai/errors";
import { validatePlan } from "@/lib/ai/plan-validator";

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

function activityWithTokens(tokens: string[]) {
  return {
    tarea: "Una actividad apropiada al grado y a la materia.",
    evidencia_observable: "Evidencia observable en clase.",
    dba_tokens: tokens,
  };
}

function basePlan(grados: number[], materiaIds: string[], tokens: Record<string, Record<string, string[]>>) {
  const dba_targets = grados.flatMap((g) =>
    materiaIds.map((m) => ({
      grado: g,
      materia_id: m,
      dbas: [{ dba_token: tokens[String(g)][m][0], evidencia_index: 0 as number | null }],
    })),
  );

  const makeActivities = () =>
    Object.fromEntries(
      grados.map((g) => [
        String(g),
        Object.fromEntries(materiaIds.map((m) => [m, activityWithTokens(tokens[String(g)][m])])),
      ]),
    );

  return {
    titulo: "Proyecto de prueba de la vereda",
    pregunta_guia: "¿Qué nos enseña la quebrada sobre el agua y la vida?",
    producto_final: "Un mural colectivo con observaciones de la quebrada.",
    cierre_actividad: "Presentamos el mural a las familias el viernes.",
    cierre_evaluacion: "Evaluamos si cada grupo explicó su contribución.",
    materiales: ["papel", "lápices", "hojas"],
    dba_targets,
    fases: [
      {
        orden: 1,
        nombre: "Exploración",
        dias_label: "Lunes-Martes",
        descripcion: "Salimos a observar la quebrada y anotamos lo que vemos.",
        actividades: makeActivities(),
      },
      {
        orden: 2,
        nombre: "Síntesis",
        dias_label: "Miércoles-Viernes",
        descripcion: "Combinamos observaciones en un mural colectivo.",
        actividades: makeActivities(),
      },
    ],
  };
}

describe("validatePlan", () => {
  it("passes on a correct plan (1 grade × 1 materia)", () => {
    const ctx = assignTokens([dba({ grado: 1, materia_id: matLenguaje })]);
    const plan = basePlan([1], [matLenguaje], { "1": { [matLenguaje]: ["D1"] } });
    const result = validatePlan(plan, ctx, { grados: [1], materiaIds: [matLenguaje] });
    expect(result.plan.titulo).toContain("vereda");
  });

  it("passes on 2 grades × 2 materias (full cross-product)", () => {
    const ctx = assignTokens([
      dba({ grado: 1, materia_id: matLenguaje }),
      dba({ grado: 1, materia_id: matCn, materia_slug: "ciencias_naturales", materia_nombre: "Ciencias Naturales" }),
      dba({ grado: 2, materia_id: matLenguaje }),
      dba({ grado: 2, materia_id: matCn, materia_slug: "ciencias_naturales", materia_nombre: "Ciencias Naturales" }),
    ]);
    const plan = basePlan([1, 2], [matLenguaje, matCn], {
      "1": { [matLenguaje]: ["D1"], [matCn]: ["D2"] },
      "2": { [matLenguaje]: ["D3"], [matCn]: ["D4"] },
    });
    expect(() => validatePlan(plan, ctx, { grados: [1, 2], materiaIds: [matLenguaje, matCn] })).not.toThrow();
  });

  it("rejects unknown token in dba_targets", () => {
    const ctx = assignTokens([dba({ grado: 1, materia_id: matLenguaje })]);
    const plan = basePlan([1], [matLenguaje], { "1": { [matLenguaje]: ["D99"] } });
    expect(() => validatePlan(plan, ctx, { grados: [1], materiaIds: [matLenguaje] })).toThrow(
      PlanValidationError,
    );
  });

  it("rejects missing (grade × materia) in dba_targets", () => {
    const ctx = assignTokens([
      dba({ grado: 1, materia_id: matLenguaje }),
      dba({ grado: 2, materia_id: matLenguaje }),
    ]);
    // User selected 2 grades but plan only includes 1 in dba_targets
    const plan = {
      ...basePlan([1, 2], [matLenguaje], {
        "1": { [matLenguaje]: ["D1"] },
        "2": { [matLenguaje]: ["D2"] },
      }),
      dba_targets: [
        { grado: 1, materia_id: matLenguaje, dbas: [{ dba_token: "D1", evidencia_index: 0 }] },
        // grado 2 missing
      ],
    };
    expect(() => validatePlan(plan, ctx, { grados: [1, 2], materiaIds: [matLenguaje] })).toThrow(
      PlanValidationError,
    );
  });

  it("rejects duplicate DBA in same (grade × materia) pair", () => {
    const ctx = assignTokens([dba({ id: "x1", grado: 1, materia_id: matLenguaje })]);
    const plan = {
      ...basePlan([1], [matLenguaje], { "1": { [matLenguaje]: ["D1"] } }),
      dba_targets: [
        {
          grado: 1,
          materia_id: matLenguaje,
          dbas: [
            { dba_token: "D1", evidencia_index: 0 },
            { dba_token: "D1", evidencia_index: 0 },
          ],
        },
      ],
    };
    expect(() => validatePlan(plan, ctx, { grados: [1], materiaIds: [matLenguaje] })).toThrow(
      PlanValidationError,
    );
  });

  it("rejects activity token that isn't in its pair's dba_targets", () => {
    const ctx = assignTokens([
      dba({ grado: 1, materia_id: matLenguaje }),
      dba({ grado: 1, materia_id: matLenguaje }),
    ]);
    const plan = basePlan([1], [matLenguaje], { "1": { [matLenguaje]: ["D1"] } });
    plan.fases[0].actividades["1"][matLenguaje].dba_tokens = ["D2"]; // D2 exists but not in targets
    expect(() => validatePlan(plan, ctx, { grados: [1], materiaIds: [matLenguaje] })).toThrow(
      PlanValidationError,
    );
  });

  it("accepts null evidencia_index for Inglés DBAs", () => {
    const ctx = assignTokens([
      dba({ grado: 3, materia_id: matIngles, materia_slug: "ingles", materia_nombre: "Inglés", evidencias: [] }),
    ]);
    const plan = basePlan([3], [matIngles], { "3": { [matIngles]: ["D1"] } });
    plan.dba_targets[0].dbas[0].evidencia_index = null;
    expect(() => validatePlan(plan, ctx, { grados: [3], materiaIds: [matIngles] })).not.toThrow();
  });

  it("rejects null evidencia_index for non-Inglés DBAs that DO have evidencias", () => {
    const ctx = assignTokens([dba({ grado: 1, materia_id: matLenguaje })]);
    const plan = basePlan([1], [matLenguaje], { "1": { [matLenguaje]: ["D1"] } });
    plan.dba_targets[0].dbas[0].evidencia_index = null;
    expect(() => validatePlan(plan, ctx, { grados: [1], materiaIds: [matLenguaje] })).toThrow(
      PlanValidationError,
    );
  });

  it("rejects out-of-range evidencia_index", () => {
    const ctx = assignTokens([
      dba({
        grado: 1,
        materia_id: matLenguaje,
        evidencias: [
          { id: "ev1", numero: 1, descripcion: "E1" },
          { id: "ev2", numero: 2, descripcion: "E2" },
        ],
      }),
    ]);
    const plan = basePlan([1], [matLenguaje], { "1": { [matLenguaje]: ["D1"] } });
    plan.dba_targets[0].dbas[0].evidencia_index = 5; // only 2 evidencias
    expect(() => validatePlan(plan, ctx, { grados: [1], materiaIds: [matLenguaje] })).toThrow(
      PlanValidationError,
    );
  });

  it("attaches raw output to the error for logging", () => {
    const ctx = assignTokens([dba({ grado: 1, materia_id: matLenguaje })]);
    const plan = basePlan([1], [matLenguaje], { "1": { [matLenguaje]: ["D99"] } });
    try {
      validatePlan(plan, ctx, { grados: [1], materiaIds: [matLenguaje] });
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(PlanValidationError);
      if (err instanceof PlanValidationError) {
        expect(err.rawOutput.length).toBeGreaterThan(0);
        expect(err.issues.length).toBeGreaterThan(0);
      }
    }
  });
});
