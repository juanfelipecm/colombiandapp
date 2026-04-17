import { describe, expect, it } from "vitest";
import { validateExtraction } from "@/scripts/dba/lib";

const baseDba = {
  grado: 3,
  numero: 1,
  enunciado: "Comprende fracciones simples.",
  evidencias: [
    { numero: 1, descripcion: "Divide figuras en partes iguales." },
    { numero: 2, descripcion: "Identifica 1/2 y 1/4 en objetos." },
  ],
};

describe("validateExtraction", () => {
  it("accepts a well-formed extraction", () => {
    const r = validateExtraction({ dbas: [baseDba] }, { min: 1, max: 5 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.extraction.dbas).toHaveLength(1);
  });

  it("rejects schema violations (missing field)", () => {
    const r = validateExtraction({ dbas: [{ ...baseDba, enunciado: undefined }] }, {
      min: 1,
      max: 5,
    });
    expect(r.ok).toBe(false);
  });

  it("rejects grado outside declared range", () => {
    const r = validateExtraction(
      { dbas: [{ ...baseDba, grado: 9 }] },
      { min: 1, max: 5 },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.includes("outside declared range"))).toBe(true);
    }
  });

  it("rejects grado outside 0-11 (schema level)", () => {
    const r = validateExtraction(
      { dbas: [{ ...baseDba, grado: 12 }] },
      { min: 0, max: 11 },
    );
    expect(r.ok).toBe(false);
  });

  it("rejects duplicate (grado, numero) pairs", () => {
    const r = validateExtraction(
      { dbas: [baseDba, { ...baseDba }] },
      { min: 1, max: 5 },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.includes("Duplicate DBA key"))).toBe(true);
    }
  });

  it("rejects duplicate evidencia numeros within a DBA", () => {
    const r = validateExtraction(
      {
        dbas: [
          {
            ...baseDba,
            evidencias: [
              { numero: 1, descripcion: "a" },
              { numero: 1, descripcion: "b" },
            ],
          },
        ],
      },
      { min: 1, max: 5 },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.includes("duplicate evidencia"))).toBe(true);
    }
  });

  it("rejects empty dbas array", () => {
    const r = validateExtraction({ dbas: [] }, { min: 1, max: 5 });
    expect(r.ok).toBe(false);
  });

  it("rejects a DBA with no evidencias", () => {
    const r = validateExtraction(
      { dbas: [{ ...baseDba, evidencias: [] }] },
      { min: 1, max: 5 },
    );
    expect(r.ok).toBe(false);
  });
});
