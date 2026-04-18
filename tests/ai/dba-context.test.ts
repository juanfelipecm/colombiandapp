import { describe, expect, it } from "vitest";
import { assignTokens, type DbaEntry } from "@/lib/ai/dba-context";

const entry = (overrides: Partial<DbaEntry> = {}): DbaEntry => ({
  id: "00000000-0000-0000-0000-000000000001",
  grado: 1,
  numero: 1,
  enunciado: "Enunciado base",
  materia_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  materia_slug: "lenguaje",
  materia_nombre: "Lenguaje",
  evidencias: [{ id: "ev-1", numero: 1, descripcion: "Ev1" }],
  ...overrides,
});

describe("assignTokens", () => {
  it("assigns D1..DN in input order", () => {
    const ctx = assignTokens([
      entry({ id: "a" }),
      entry({ id: "b" }),
      entry({ id: "c" }),
    ]);
    expect(ctx.dbas.map((d) => d.token)).toEqual(["D1", "D2", "D3"]);
    expect(ctx.tokenToUuid.get("D1")).toBe("a");
    expect(ctx.tokenToUuid.get("D2")).toBe("b");
    expect(ctx.tokenToUuid.get("D3")).toBe("c");
  });

  it("buckets by grade:materia_id", () => {
    const materiaA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const materiaB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    const ctx = assignTokens([
      entry({ id: "x", grado: 1, materia_id: materiaA }),
      entry({ id: "y", grado: 1, materia_id: materiaA }),
      entry({ id: "z", grado: 1, materia_id: materiaB }),
      entry({ id: "w", grado: 2, materia_id: materiaA }),
    ]);
    expect(ctx.byGradeMateria.get(`1:${materiaA}`)).toHaveLength(2);
    expect(ctx.byGradeMateria.get(`1:${materiaB}`)).toHaveLength(1);
    expect(ctx.byGradeMateria.get(`2:${materiaA}`)).toHaveLength(1);
    expect(ctx.byGradeMateria.get(`2:${materiaB}`)).toBeUndefined();
  });

  it("handles empty input", () => {
    const ctx = assignTokens([]);
    expect(ctx.dbas).toEqual([]);
    expect(ctx.tokenToUuid.size).toBe(0);
    expect(ctx.byGradeMateria.size).toBe(0);
  });

  it("preserves DBA properties on tokenized entries", () => {
    const ctx = assignTokens([entry({ id: "x", enunciado: "Algo importante" })]);
    expect(ctx.dbas[0].enunciado).toBe("Algo importante");
    expect(ctx.tokenToEntry.get("D1")?.enunciado).toBe("Algo importante");
  });
});
