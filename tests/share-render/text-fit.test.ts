import { describe, expect, it } from "vitest";
import { fitTitulo, fitPreguntaGuia } from "@/lib/share-render/text-fit";

describe("fitTitulo", () => {
  it("returns 48 for short títulos", () => {
    expect(fitTitulo("Cómo cuidamos el agua")).toBe(48);
  });

  it("steps down for medium-long títulos", () => {
    expect(fitTitulo("a".repeat(80))).toBe(42);
    expect(fitTitulo("a".repeat(120))).toBe(36);
  });

  it("clamps at 30 for very long títulos", () => {
    expect(fitTitulo("a".repeat(300))).toBe(30);
  });

  it("never returns a value below the floor", () => {
    expect(fitTitulo("a".repeat(10000))).toBeGreaterThanOrEqual(30);
  });
});

describe("fitPreguntaGuia", () => {
  it("returns 32 for typical questions", () => {
    expect(fitPreguntaGuia("¿Por qué el agua se ve diferente?")).toBe(32);
  });

  it("steps down for verbose questions", () => {
    expect(fitPreguntaGuia("a".repeat(160))).toBe(28);
    expect(fitPreguntaGuia("a".repeat(220))).toBe(24);
  });

  it("clamps at 20 for very long questions", () => {
    expect(fitPreguntaGuia("a".repeat(500))).toBe(20);
  });
});
