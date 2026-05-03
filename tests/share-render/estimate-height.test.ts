import { describe, expect, it } from "vitest";
import { estimateHeight, HEIGHT_LIMITS } from "@/lib/share-render/estimate-height";
import type { ShareData } from "@/lib/share-render/load-project";

const baseProject: ShareData["project"] = {
  id: "p",
  titulo: "Agua de la quebrada",
  pregunta_guia: "¿Cómo cuidamos el agua?",
  duracion_semanas: 4,
  producto_final: "Una guía ilustrada del cuidado del agua.",
  cierre_actividad: "Presentación a la comunidad.",
  cierre_evaluacion: "Rúbrica con 3 criterios.",
  updated_at: "2026-05-03T00:00:00Z",
};

function makeData(overrides: Partial<ShareData> = {}): ShareData {
  return {
    project: baseProject,
    grados: [1, 2, 3],
    studentCount: 18,
    targetsByGrade: [
      { grado: 1, items: [{ materia_nombre: "Lenguaje", materia_slug: "lenguaje", dba_numero: 1, enunciado: "x", evidencia: null }] },
    ],
    phases: [
      {
        orden: 1,
        nombre: "Sembrar",
        dias_label: "Semana 1",
        descripcion: "intro",
        byGrade: [{ grado: 1, byMateria: [{ materia_nombre: "Lenguaje", materia_slug: "lenguaje", tarea: "x", evidencia_observable: "y" }] }],
      },
    ],
    materiales: ["lápiz", "papel"],
    ...overrides,
  };
}

describe("estimateHeight", () => {
  it("returns a height in the expected range for a small project", () => {
    const e = estimateHeight(makeData());
    expect(e.estimated).toBeGreaterThan(1500);
    expect(e.estimated).toBeLessThan(HEIGHT_LIMITS.SOFT_CAP);
    expect(e.softCapped).toBe(false);
    expect(e.hardCapped).toBe(false);
  });

  it("flags soft cap when content exceeds 6000px", () => {
    const data = makeData({
      phases: Array.from({ length: 4 }, (_, i) => ({
        orden: i + 1,
        nombre: `F${i}`,
        dias_label: `Sem ${i}`,
        descripcion: "x",
        byGrade: [
          { grado: 1, byMateria: Array.from({ length: 3 }, () => ({ materia_nombre: "Mat", materia_slug: "mat", tarea: "t", evidencia_observable: "e" })) },
          { grado: 2, byMateria: Array.from({ length: 3 }, () => ({ materia_nombre: "Mat", materia_slug: "mat", tarea: "t", evidencia_observable: "e" })) },
          { grado: 3, byMateria: Array.from({ length: 3 }, () => ({ materia_nombre: "Mat", materia_slug: "mat", tarea: "t", evidencia_observable: "e" })) },
        ],
      })),
      targetsByGrade: [
        { grado: 1, items: Array.from({ length: 6 }, () => ({ materia_nombre: "Mat", materia_slug: "mat", dba_numero: 1, enunciado: "x".repeat(80), evidencia: "y" })) },
        { grado: 2, items: Array.from({ length: 6 }, () => ({ materia_nombre: "Mat", materia_slug: "mat", dba_numero: 1, enunciado: "x".repeat(80), evidencia: "y" })) },
        { grado: 3, items: Array.from({ length: 6 }, () => ({ materia_nombre: "Mat", materia_slug: "mat", dba_numero: 1, enunciado: "x".repeat(80), evidencia: "y" })) },
      ],
    });
    const e = estimateHeight(data);
    expect(e.softCapped).toBe(true);
  });

  it("exposes the limits as a const", () => {
    expect(HEIGHT_LIMITS.SOFT_CAP).toBe(6000);
    expect(HEIGHT_LIMITS.HARD_CAP).toBe(8000);
  });
});
