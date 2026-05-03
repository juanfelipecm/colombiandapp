import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { Infographic } from "@/components/share/Infographic";
import type { ShareData } from "@/lib/share-render/load-project";

const baseProject: ShareData["project"] = {
  id: "p",
  titulo: "Cómo cuidamos el agua de nuestro arroyo",
  pregunta_guia: "¿Por qué el agua se ve diferente?",
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
      {
        grado: 1,
        items: [
          { materia_nombre: "Lenguaje", materia_slug: "lenguaje", dba_numero: 3, enunciado: "Lee y comprende textos.", evidencia: "Resume el cuento." },
          { materia_nombre: "Inglés", materia_slug: "ingles", dba_numero: 1, enunciado: "Saluda en inglés.", evidencia: "ESTA NO DEBE APARECER" },
        ],
      },
    ],
    phases: [
      {
        orden: 1,
        nombre: "Sembrar la pregunta",
        dias_label: "Semana 1",
        descripcion: "Introducimos el reto y observamos.",
        byGrade: [
          {
            grado: 1,
            byMateria: [
              { materia_nombre: "Lenguaje", materia_slug: "lenguaje", tarea: "Hacer un dibujo del arroyo.", evidencia_observable: "Dibujo entregado." },
              { materia_nombre: "Inglés", materia_slug: "ingles", tarea: "Aprender 5 palabras.", evidencia_observable: "FANTASMA INGLÉS — NO MOSTRAR" },
            ],
          },
        ],
      },
    ],
    materiales: ["Cuaderno", "Lápiz", "Papel"],
    ...overrides,
  };
}

describe("Infographic", () => {
  it("renders all major sections", () => {
    render(<Infographic data={makeData()} logoDataUrl="data:image/png;base64,XXX" generatedAtLabel="3 de mayo de 2026" softCapped={false} />);
    expect(screen.getByText("PLAN DE PROYECTO")).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Cómo cuidamos el agua/ })).toBeTruthy();
    expect(screen.getByText("EL RETO")).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Producto final/ })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Plan por fases/ })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /DBAs y evidencias por grado/ })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Materiales/ })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Cierre del proyecto/ })).toBeTruthy();
  });

  it("excludes evidencia for inglés materia in DBAs section", () => {
    render(<Infographic data={makeData()} logoDataUrl="x" generatedAtLabel="x" softCapped={false} />);
    // Inglés DBA enunciado should appear, but the evidencia line is hidden.
    expect(screen.getByText(/Saluda en inglés/)).toBeTruthy();
    expect(screen.queryByText(/ESTA NO DEBE APARECER/)).toBeNull();
  });

  it("excludes evidencia_observable for inglés in phase tasks", () => {
    render(<Infographic data={makeData()} logoDataUrl="x" generatedAtLabel="x" softCapped={false} />);
    expect(screen.queryByText(/FANTASMA INGLÉS/)).toBeNull();
  });

  it("renders the soft-cap notice in the footer when softCapped=true", () => {
    const { container, rerender } = render(<Infographic data={makeData()} logoDataUrl="x" generatedAtLabel="3 de mayo de 2026" softCapped={false} />);
    expect(container.querySelector(".footer-soft-cap")).toBeNull();

    rerender(<Infographic data={makeData()} logoDataUrl="x" generatedAtLabel="3 de mayo de 2026" softCapped={true} />);
    const footer = container.querySelector(".footer");
    expect(footer).not.toBeNull();
    expect(within(footer as HTMLElement).getByText(/PLAN COMPLETO EN EL PDF/)).toBeTruthy();
  });

  it("renders 'Para grados 1°, 2° y 3°' subtitle", () => {
    render(<Infographic data={makeData()} logoDataUrl="x" generatedAtLabel="x" softCapped={false} />);
    expect(screen.getByText(/Para grados 1°, 2° y 3°/)).toBeTruthy();
  });

  it("renders the eyebrow + numeral phase markers (no colored circles)", () => {
    const { container } = render(<Infographic data={makeData()} logoDataUrl="x" generatedAtLabel="x" softCapped={false} />);
    const eyebrow = container.querySelector(".phase-eyebrow");
    const numeral = container.querySelector(".phase-numeral");
    const hairline = container.querySelector(".phase-hairline");
    expect(eyebrow?.textContent).toMatch(/FASE 1/);
    expect(numeral?.textContent).toBe("1");
    expect(hairline).not.toBeNull();
  });

  it("does NOT include any emoji glyphs (DESIGN.md hard rule)", () => {
    const { container } = render(<Infographic data={makeData()} logoDataUrl="x" generatedAtLabel="x" softCapped={false} />);
    const text = container.textContent ?? "";
    // Common emoji ranges: misc symbols, dingbats, transport, supplemental.
    // This is a smoke check, not exhaustive Unicode coverage.
    const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    expect(emojiRegex.test(text)).toBe(false);
  });

  it("singularizes 'semana' / 'niño' for count = 1", () => {
    const data = makeData({ studentCount: 1, project: { ...baseProject, duracion_semanas: 1 } });
    render(<Infographic data={data} logoDataUrl="x" generatedAtLabel="x" softCapped={false} />);
    expect(screen.getByText(/1 niño$/)).toBeTruthy();
    // Find the duración pill in the stat band; its label format is "1 semana".
    expect(screen.getByText(/^1 semana$/)).toBeTruthy();
  });
});
