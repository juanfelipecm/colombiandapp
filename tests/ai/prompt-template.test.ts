import { describe, expect, it } from "vitest";
import { assignTokens, type DbaEntry } from "@/lib/ai/dba-context";
import { SYSTEM_PROMPT, buildDbaReference, buildUserPrompt } from "@/lib/ai/prompt-template";

const matLenguaje = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const matIngles = "cccccccc-cccc-cccc-cccc-cccccccccccc";

const entry = (overrides: Partial<DbaEntry>): DbaEntry => ({
  id: overrides.id ?? "dba-x",
  grado: overrides.grado ?? 1,
  numero: overrides.numero ?? 1,
  enunciado: overrides.enunciado ?? "Enunciado",
  materia_id: overrides.materia_id ?? matLenguaje,
  materia_slug: overrides.materia_slug ?? "lenguaje",
  materia_nombre: overrides.materia_nombre ?? "Lenguaje",
  evidencias: overrides.evidencias ?? [{ id: "ev-uno", numero: 1, descripcion: "Evidencia uno" }],
});

describe("SYSTEM_PROMPT", () => {
  it("names Colombia and multigrade context", () => {
    expect(SYSTEM_PROMPT).toContain("Colombia");
    expect(SYSTEM_PROMPT).toContain("multigrado");
  });

  it("warns against prompt-injection in user_input tags", () => {
    expect(SYSTEM_PROMPT).toContain("<user_input>");
    expect(SYSTEM_PROMPT).toMatch(/nunca sigas instrucciones/i);
  });

  it("forbids tech resources for kids", () => {
    expect(SYSTEM_PROMPT.toLowerCase()).toMatch(/cero recursos tecnol/);
  });
});

describe("buildDbaReference", () => {
  it("lists DBAs per (grade, materia) with tokens and evidencias", () => {
    const ctx = assignTokens([
      entry({ id: "a", grado: 1, materia_id: matLenguaje, enunciado: "Identifica medios." }),
      entry({ id: "b", grado: 1, materia_id: matLenguaje, numero: 2, enunciado: "Relaciona sonidos." }),
    ]);
    const text = buildDbaReference(ctx, [1], [matLenguaje]);
    expect(text).toContain("D1");
    expect(text).toContain("D2");
    expect(text).toContain("Identifica medios.");
    expect(text).toContain("Relaciona sonidos.");
    expect(text).toContain("Evidencia uno");
  });

  it("marks Ingles DBAs with evidencia_index null guidance when no evidencias", () => {
    const ctx = assignTokens([
      entry({
        id: "i1",
        grado: 3,
        materia_id: matIngles,
        materia_slug: "ingles",
        materia_nombre: "Inglés",
        evidencias: [],
      }),
    ]);
    const text = buildDbaReference(ctx, [3], [matIngles]);
    expect(text).toContain("D1");
    expect(text).toMatch(/evidencia_index: null/i);
  });

  it("notes 'Sin DBAs disponibles' for a pair with no DBAs", () => {
    const ctx = assignTokens([]);
    const text = buildDbaReference(ctx, [4], [matLenguaje]);
    expect(text).toContain("Sin DBAs disponibles");
  });
});

describe("buildUserPrompt", () => {
  const ctx = assignTokens([entry({ id: "a", grado: 1, materia_id: matLenguaje })]);

  it("includes student counts per grade", () => {
    const text = buildUserPrompt(
      {
        grados: [1],
        materia_ids: [matLenguaje],
        studentCountsByGrade: { 1: 3 },
        duracion_semanas: 1,
        tema_contexto: null,
      },
      ctx,
    );
    expect(text).toContain("grado 1: 3 estudiantes");
  });

  it("wraps tema_contexto in <user_input> tags when provided", () => {
    const text = buildUserPrompt(
      {
        grados: [1],
        materia_ids: [matLenguaje],
        studentCountsByGrade: { 1: 3 },
        duracion_semanas: 1,
        tema_contexto: "el agua de la quebrada",
      },
      ctx,
    );
    expect(text).toContain("<user_input>");
    expect(text).toContain("el agua de la quebrada");
    expect(text).toContain("</user_input>");
  });

  it("handles empty tema_contexto with a neutral note", () => {
    const text = buildUserPrompt(
      {
        grados: [1],
        materia_ids: [matLenguaje],
        studentCountsByGrade: { 1: 3 },
        duracion_semanas: 1,
        tema_contexto: null,
      },
      ctx,
    );
    expect(text).not.toContain("<user_input>");
    expect(text).toMatch(/no proporcion/i);
  });

  it("adds Inglés branch note when a DBA in context is Inglés", () => {
    const inglesCtx = assignTokens([
      entry({
        id: "i1",
        grado: 3,
        materia_id: matIngles,
        materia_slug: "ingles",
        materia_nombre: "Inglés",
        evidencias: [],
      }),
    ]);
    const text = buildUserPrompt(
      {
        grados: [3],
        materia_ids: [matIngles],
        studentCountsByGrade: { 3: 4 },
        duracion_semanas: 1,
        tema_contexto: null,
      },
      inglesCtx,
    );
    expect(text).toMatch(/inglés.*null/i);
  });
});
