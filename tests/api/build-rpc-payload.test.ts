import { describe, expect, it } from "vitest";
import { assignTokens } from "@/lib/ai/dba-context";
import type { GeneratedPlan } from "@/lib/ai/plan-schema";
import { buildRpcPayload } from "@/lib/api/build-rpc-payload";
import { makePlan } from "../fixtures/clase-viva-plan";

const MAT = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

const ctx = assignTokens([
  {
    id: "dba-uuid-1",
    grado: 0,
    numero: 1,
    enunciado: "E",
    materia_id: MAT,
    materia_slug: "lenguaje",
    materia_nombre: "Lenguaje",
    evidencias: [{ id: "ev-0", numero: 1, descripcion: "x" }],
  },
  {
    id: "dba-uuid-2",
    grado: 3,
    numero: 2,
    enunciado: "E2",
    materia_id: MAT,
    materia_slug: "lenguaje",
    materia_nombre: "Lenguaje",
    evidencias: [],
  },
]);

const args = (plan: GeneratedPlan) => ({
  plan,
  ctx,
  teacherId: "t",
  schoolId: "s",
  idempotencyKey: "k",
  studentIds: ["st1"],
  promptVersion: "clase-viva-v1",
  model: "claude-opus-4-7",
  temaContexto: null,
});

describe("buildRpcPayload", () => {
  const plan = makePlan([0, 3], [MAT], { [`0:${MAT}`]: "D1", [`3:${MAT}`]: "D2" }) as unknown as GeneratedPlan;
  plan.dba_targets[1].dbas[0].evidencia_index = null;
  const payload = buildRpcPayload(args(plan));

  it("sends fase nombre from ETAPA_META, with etapa, gran_pregunta and bloques", () => {
    expect(payload.fases.map((f) => f.nombre)).toEqual([
      "Despertar la curiosidad",
      "Indagar e investigar",
      "Crear",
      "Reflexionar",
      "Compartir",
    ]);
    expect(payload.fases[1].etapa).toBe("indagar_investigar");
    expect(payload.fases[4].gran_pregunta).toBeNull();
    expect(payload.fases[1].bloques).toBe(plan.fases[1].bloques);
  });

  it("puts tarea_previa and tema in the header without legacy fields", () => {
    expect(payload.header.tarea_previa).toBe(plan.tarea_previa);
    expect(payload.header.tema_contexto).toBe("");
    expect(payload.header).not.toHaveProperty("producto_final");
    expect(payload.header).not.toHaveProperty("duracion_semanas");
  });

  it("sends empty string for a null tarea_previa (RPC stores NULL)", () => {
    const p = buildRpcPayload(args({ ...plan, tarea_previa: null }));
    expect(p.header.tarea_previa).toBe("");
  });

  it("resolves DBA tokens and evidencia indexes to UUIDs", () => {
    expect(payload.dba_targets).toEqual([
      { grado: 0, materia_id: MAT, dba_id: "dba-uuid-1", evidencia_id: "ev-0", orden: 1 },
      { grado: 3, materia_id: MAT, dba_id: "dba-uuid-2", evidencia_id: null, orden: 1 },
    ]);
    expect(payload.grados).toEqual([0, 3]);
  });

  it("keeps materiales order", () => {
    expect(payload.materiales).toEqual(plan.materiales);
  });
});
