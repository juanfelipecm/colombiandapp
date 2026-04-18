import { describe, expect, it } from "vitest";
import { buildPlanJsonSchema, buildPlanSchema } from "@/lib/ai/plan-schema";

const validPlan = (overrides: Record<string, unknown> = {}) => ({
  titulo: "Exploramos el agua de nuestra vereda",
  pregunta_guia: "¿Cómo cambia el agua en nuestra vereda durante la semana?",
  producto_final: "Un mural colectivo con dibujos y observaciones del agua.",
  cierre_actividad: "Presentamos el mural a las familias el viernes en la tarde.",
  cierre_evaluacion: "Evaluamos si cada grupo completó su parte del mural y pudo explicarla.",
  materiales: ["papel", "lápices", "colores", "hojas secas"],
  dba_targets: [
    {
      grado: 1,
      materia_id: "11111111-1111-1111-1111-111111111111",
      dbas: [{ dba_token: "D1", evidencia_index: 0 }],
    },
  ],
  fases: [
    {
      orden: 1,
      nombre: "Exploración",
      dias_label: "Lunes-Martes",
      descripcion: "Los estudiantes salen a observar fuentes de agua cerca de la escuela.",
      actividades: {
        "1": {
          "11111111-1111-1111-1111-111111111111": {
            tarea: "Dibuja 3 fuentes de agua que veas hoy.",
            evidencia_observable: "El estudiante entrega un dibujo con 3 elementos.",
            dba_tokens: ["D1"],
          },
        },
      },
    },
    {
      orden: 2,
      nombre: "Síntesis",
      dias_label: "Miércoles-Viernes",
      descripcion: "Los estudiantes agrupan sus dibujos por tipo de fuente.",
      actividades: {
        "1": {
          "11111111-1111-1111-1111-111111111111": {
            tarea: "Cuenta cuántas fuentes encontraste y compara con tus compañeros.",
            evidencia_observable: "El estudiante dice un número y lo compara.",
            dba_tokens: ["D1"],
          },
        },
      },
    },
  ],
  ...overrides,
});

describe("buildPlanSchema", () => {
  it("accepts a well-formed plan for one grade", () => {
    const schema = buildPlanSchema([1], ["11111111-1111-1111-1111-111111111111"]);
    const result = schema.safeParse(validPlan());
    expect(result.success).toBe(true);
  });

  it("accepts five grades and validates all grade-string keys", () => {
    const schema = buildPlanSchema([1, 2, 3, 4, 5], ["11111111-1111-1111-1111-111111111111"]);
    const mat = "11111111-1111-1111-1111-111111111111";
    const activity = {
      tarea: "Actividad adecuada al grado.",
      evidencia_observable: "Evidencia observable.",
      dba_tokens: ["D1"],
    };
    const plan = validPlan({
      dba_targets: [1, 2, 3, 4, 5].map((g) => ({
        grado: g,
        materia_id: mat,
        dbas: [{ dba_token: "D1", evidencia_index: 0 }],
      })),
      fases: [
        {
          orden: 1,
          nombre: "Fase 1",
          dias_label: "Lunes-Martes",
          descripcion: "Descripción de la fase uno del proyecto.",
          actividades: Object.fromEntries([1, 2, 3, 4, 5].map((g) => [String(g), { [mat]: activity }])),
        },
        {
          orden: 2,
          nombre: "Fase 2",
          dias_label: "Miércoles-Viernes",
          descripcion: "Descripción de la fase dos.",
          actividades: Object.fromEntries([1, 2, 3, 4, 5].map((g) => [String(g), { [mat]: activity }])),
        },
      ],
    });
    const result = schema.safeParse(plan);
    expect(result.success).toBe(true);
  });

  it("rejects a plan missing a selected grade key", () => {
    const schema = buildPlanSchema([1, 2], ["11111111-1111-1111-1111-111111111111"]);
    const plan = validPlan(); // only has "1"
    const result = schema.safeParse(plan);
    // Actividades is now z.object({"1": ..., "2": ...}) — both keys required at the
    // schema level, so a missing grade fails Zod parse (not deferred to semantic pass).
    expect(result.success).toBe(false);
  });

  it("rejects a plan with a grade key NOT in the selection", () => {
    const schema = buildPlanSchema([1, 2], ["11111111-1111-1111-1111-111111111111"]);
    const plan = validPlan({
      fases: [
        {
          orden: 1,
          nombre: "F1",
          dias_label: "Lun-Mar",
          descripcion: "Descripción de la fase uno del proyecto.",
          actividades: {
            "3": {
              "11111111-1111-1111-1111-111111111111": {
                tarea: "Tarea no autorizada para grado 3.",
                evidencia_observable: "Evidencia.",
                dba_tokens: ["D1"],
              },
            },
          },
        },
        {
          orden: 2,
          nombre: "F2",
          dias_label: "Mie-Vie",
          descripcion: "Descripción de la fase dos.",
          actividades: {},
        },
      ],
    });
    const result = schema.safeParse(plan);
    expect(result.success).toBe(false);
  });

  it("rejects malformed DBA tokens", () => {
    const schema = buildPlanSchema([1], ["11111111-1111-1111-1111-111111111111"]);
    const plan = validPlan({
      dba_targets: [
        {
          grado: 1,
          materia_id: "11111111-1111-1111-1111-111111111111",
          dbas: [{ dba_token: "not-a-token", evidencia_index: 0 }],
        },
      ],
    });
    expect(schema.safeParse(plan).success).toBe(false);
  });

  it("rejects empty materiales list", () => {
    const schema = buildPlanSchema([1], ["11111111-1111-1111-1111-111111111111"]);
    expect(schema.safeParse(validPlan({ materiales: [] })).success).toBe(false);
  });

  it("requires at least 2 fases", () => {
    const schema = buildPlanSchema([1], ["11111111-1111-1111-1111-111111111111"]);
    const p = validPlan();
    p.fases = [p.fases[0]];
    expect(schema.safeParse(p).success).toBe(false);
  });

  it("throws when given 0 selected grades", () => {
    expect(() => buildPlanSchema([], ["11111111-1111-1111-1111-111111111111"])).toThrowError(/non-empty/);
    expect(() => buildPlanSchema([1], [])).toThrowError(/non-empty/);
  });

  it("accepts null evidencia_index", () => {
    const schema = buildPlanSchema([1], ["11111111-1111-1111-1111-111111111111"]);
    const plan = validPlan({
      dba_targets: [
        {
          grado: 1,
          materia_id: "11111111-1111-1111-1111-111111111111",
          dbas: [{ dba_token: "D1", evidencia_index: null }],
        },
      ],
    });
    expect(schema.safeParse(plan).success).toBe(true);
  });
});

describe("buildPlanJsonSchema", () => {
  it("emits a root-object JSON Schema compatible with Anthropic tool_use", () => {
    const schema = buildPlanJsonSchema([1, 5], ["11111111-1111-1111-1111-111111111111"]) as Record<string, unknown>;
    expect(schema.type).toBe("object");
    expect(schema.properties).toBeTypeOf("object");
    const props = schema.properties as Record<string, unknown>;
    expect(props.titulo).toBeDefined();
    expect(props.fases).toBeDefined();
    expect(props.dba_targets).toBeDefined();
    // No $schema / definitions leak
    expect(schema.$schema).toBeUndefined();
    expect(schema.definitions).toBeUndefined();
  });

  it("forces both selected grades AND materia UUIDs as required keys under actividades", () => {
    const matA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const matB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    const schema = buildPlanJsonSchema([1, 5], [matA, matB]) as Record<string, unknown>;
    const fases = (schema.properties as Record<string, unknown>).fases as Record<string, unknown>;
    const faseItems = fases.items as Record<string, unknown>;
    const faseProps = faseItems.properties as Record<string, unknown>;
    const actividades = faseProps.actividades as Record<string, unknown>;
    expect(actividades.type).toBe("object");

    // Grade layer: explicit properties for each grade with required.
    const actividadesProps = actividades.properties as Record<string, unknown>;
    expect(actividadesProps["1"]).toBeDefined();
    expect(actividadesProps["5"]).toBeDefined();
    expect(actividades.required).toEqual(expect.arrayContaining(["1", "5"]));

    // Materia layer under grade "1": explicit properties for each materia UUID
    // with required. This is the fix for the "model elided the materia_id layer"
    // failure mode — no more additionalProperties-as-value.
    const grade1 = actividadesProps["1"] as Record<string, unknown>;
    const grade1Props = grade1.properties as Record<string, unknown>;
    expect(grade1Props[matA]).toBeDefined();
    expect(grade1Props[matB]).toBeDefined();
    expect(grade1.required).toEqual(expect.arrayContaining([matA, matB]));
  });

  it("throws when given zero grades", () => {
    expect(() => buildPlanJsonSchema([], ["11111111-1111-1111-1111-111111111111"])).toThrowError(/non-empty/);
    expect(() => buildPlanJsonSchema([1], [])).toThrowError(/non-empty/);
  });
});
