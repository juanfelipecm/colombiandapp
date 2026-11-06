import { describe, expect, it } from "vitest";
import { buildPlanJsonSchema, buildPlanSchema, PROMPT_VERSION } from "@/lib/ai/plan-schema";
import { makeBloque, makePlan } from "../fixtures/clase-viva-plan";

const M1 = "11111111-1111-1111-1111-111111111111";
const M2 = "22222222-2222-2222-2222-222222222222";

type Plan = ReturnType<typeof makePlan>;
const withFase = (plan: Plan, i: number, patch: Record<string, unknown>) => ({
  ...plan,
  fases: plan.fases.map((f, j) => (j === i ? { ...f, ...patch } : f)),
});

describe("buildPlanSchema (clase-viva-v1)", () => {
  it("uses the clase-viva prompt version", () => {
    expect(PROMPT_VERSION).toBe("clase-viva-v1");
  });

  it("accepts a well-formed plan for one grade", () => {
    expect(buildPlanSchema([3], [M1]).safeParse(makePlan([3], [M1])).success).toBe(true);
  });

  it("accepts Transición to 5° with grade-band variants", () => {
    const grados = [0, 1, 2, 3, 4, 5];
    const r = buildPlanSchema(grados, [M1, M2]).safeParse(makePlan(grados, [M1, M2]));
    expect(r.success).toBe(true);
  });

  it("accepts tarea_previa null", () => {
    const r = buildPlanSchema([1], [M1]).safeParse(makePlan([1], [M1], {}, { tarea_previa: null }));
    expect(r.success).toBe(true);
  });

  it("requires exactly 5 fases", () => {
    const plan = makePlan([1], [M1]);
    const schema = buildPlanSchema([1], [M1]);
    expect(schema.safeParse({ ...plan, fases: plan.fases.slice(0, 4) }).success).toBe(false);
    expect(schema.safeParse({ ...plan, fases: [...plan.fases, plan.fases[0]] }).success).toBe(false);
  });

  it("rejects an etapa outside the enum", () => {
    const plan = withFase(makePlan([1], [M1]), 0, { etapa: "exploracion" });
    expect(buildPlanSchema([1], [M1]).safeParse(plan).success).toBe(false);
  });

  it("rejects a bloque tipo outside the enum", () => {
    const plan = withFase(makePlan([1], [M1]), 0, { bloques: [makeBloque({ tipo: "baile" }), makeBloque()] });
    expect(buildPlanSchema([1], [M1]).safeParse(plan).success).toBe(false);
  });

  it("rejects 1 or 9 bloques in a fase", () => {
    const schema = buildPlanSchema([1], [M1]);
    expect(schema.safeParse(withFase(makePlan([1], [M1]), 0, { bloques: [makeBloque()] })).success).toBe(false);
    const nine = Array.from({ length: 9 }, () => makeBloque());
    expect(schema.safeParse(withFase(makePlan([1], [M1]), 0, { bloques: nine })).success).toBe(false);
  });

  it("rejects a single-variant variantes_por_grado", () => {
    const b = makeBloque({
      tipo: "actividad_por_grados",
      variantes_por_grado: [{ grados: [1], contenido: "Dibujan lo que observan en el patio." }],
    });
    const plan = withFase(makePlan([1, 2], [M1]), 1, { bloques: [makeBloque(), b] });
    expect(buildPlanSchema([1, 2], [M1]).safeParse(plan).success).toBe(false);
  });

  it("rejects a variant grade not in the selection", () => {
    const b = makeBloque({
      tipo: "actividad_por_grados",
      variantes_por_grado: [
        { grados: [1], contenido: "Dibujan lo que observan en el patio." },
        { grados: [4], contenido: "Escriben lo que observan en el patio." },
      ],
    });
    const plan = withFase(makePlan([1, 2], [M1]), 1, { bloques: [makeBloque(), b] });
    expect(buildPlanSchema([1, 2], [M1]).safeParse(plan).success).toBe(false);
  });

  it("rejects markdown headers in contenido", () => {
    const b = makeBloque({ contenido: "# Actividad\nPide a los estudiantes que observen la panela con cuidado." });
    const plan = withFase(makePlan([1], [M1]), 0, { bloques: [b, makeBloque()] });
    expect(buildPlanSchema([1], [M1]).safeParse(plan).success).toBe(false);
  });

  it("rejects malformed DBA tokens", () => {
    const plan = makePlan([1], [M1], { [`1:${M1}`]: "X1" });
    expect(buildPlanSchema([1], [M1]).safeParse(plan).success).toBe(false);
  });

  it("rejects a materia_id outside the selection", () => {
    const plan = makePlan([1], [M1]);
    plan.dba_targets[0].materia_id = M2;
    expect(buildPlanSchema([1], [M1]).safeParse(plan).success).toBe(false);
  });

  it("rejects empty materiales", () => {
    expect(buildPlanSchema([1], [M1]).safeParse(makePlan([1], [M1], {}, { materiales: [] })).success).toBe(false);
  });

  it("accepts null evidencia_index", () => {
    const plan = makePlan([1], [M1]);
    plan.dba_targets[0].dbas[0].evidencia_index = null;
    expect(buildPlanSchema([1], [M1]).safeParse(plan).success).toBe(true);
  });

  it("throws when given 0 selected grades or materias", () => {
    expect(() => buildPlanSchema([], [M1])).toThrow();
    expect(() => buildPlanSchema([1], [])).toThrow();
  });
});

describe("buildPlanJsonSchema", () => {
  type Obj = { properties: Record<string, unknown>; required?: string[] };
  const props = (o: unknown) => (o as Obj).properties;
  const items = (o: unknown) => (o as { items: unknown }).items;

  it("emits a root-object JSON Schema with every top-level key required", () => {
    const s = buildPlanJsonSchema([1, 2], [M1]) as unknown as Obj & { type: string; $schema?: string };
    expect(s.type).toBe("object");
    expect(s.$schema).toBeUndefined();
    expect(s.required).toEqual(
      expect.arrayContaining(["titulo", "pregunta_guia", "tarea_previa", "materiales", "dba_targets", "fases"]),
    );
  });

  it("constrains variant grados to the selected grades as a numeric enum", () => {
    const s = buildPlanJsonSchema([0, 2, 3], [M1]);
    const fase = items(props(s).fases);
    const bloque = items(props(fase).bloques);
    const variante = items(props(bloque).variantes_por_grado) as Obj;
    type Num = { type?: string; enum?: number[] };
    const grado = items(props(variante).grados) as Num & { anyOf?: Num[] };
    const options = grado.anyOf ?? [grado];
    expect(options.every((o) => o.type === "number")).toBe(true);
    expect(options.flatMap((o) => o.enum ?? []).sort()).toEqual([0, 2, 3]);
  });

  it("constrains dba_targets.materia_id to the selected materias", () => {
    const s = buildPlanJsonSchema([1], [M1, M2]);
    const target = items(props(s).dba_targets);
    const materia = props(target).materia_id as { enum?: string[] };
    expect(materia.enum?.sort()).toEqual([M1, M2].sort());
  });

  it("describes the etapa order for the model", () => {
    const s = buildPlanJsonSchema([1], [M1]);
    const etapa = props(items(props(s).fases)).etapa as { enum?: string[]; description?: string };
    expect(etapa.enum).toEqual(["despertar_curiosidad", "indagar_investigar", "crear", "reflexionar", "compartir"]);
    expect(etapa.description).toMatch(/orden/);
  });

  it("throws when given zero grades", () => {
    expect(() => buildPlanJsonSchema([], [M1])).toThrow();
  });
});
