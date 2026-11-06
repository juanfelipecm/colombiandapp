import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Infographic } from "@/components/share/Infographic";
import { baseShareProject, makeShareData } from "../fixtures/share-data";

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const props = { logoDataUrl: "data:image/png;base64,XXX", generatedAtLabel: "6 de noviembre de 2026", softCapped: false };

describe("Infographic — full (PDF)", () => {
  afterEach(cleanup);

  it("renders the Clase Viva sections and no legacy ones", () => {
    const { container } = render(<Infographic data={makeShareData()} {...props} />);
    expect(screen.getByText("PLAN DE PROYECTO · CLASE VIVA")).toBeTruthy();
    expect(screen.getByRole("heading", { name: /panela/ })).toBeTruthy();
    expect(screen.getByText("PREGUNTA GUÍA")).toBeTruthy();
    expect(screen.getByText("TAREA ANTES DE EMPEZAR")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Las 5 fases" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "DBA por grado" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Materiales" })).toBeTruthy();
    expect(container.textContent).not.toMatch(/Producto final|Cierre del proyecto|EL RETO|semana/);
  });

  it("keeps the editorial fase markers for all five fases", () => {
    render(<Infographic data={makeShareData()} {...props} />);
    for (let i = 1; i <= 5; i++) expect(screen.getByText(`FASE ${i}`)).toBeTruthy();
    expect(screen.getByText("Indagar e investigar")).toBeTruthy();
  });

  it("renders gran pregunta, grade bands and the Profe tip", () => {
    render(<Infographic data={makeShareData()} {...props} />);
    expect(screen.getAllByText("GRAN PREGUNTA DEL DÍA")).toHaveLength(4);
    expect(screen.getByText("Transición y 1°")).toBeTruthy();
    expect(screen.getByText("2° y 3°")).toBeTruthy();
    expect(screen.getByText(/^Profe, si no hay trapiche/)).toBeTruthy();
  });

  it("DBA tables per materia; no evidencia for Inglés; Transición badge", () => {
    render(<Infographic data={makeShareData()} {...props} />);
    expect(screen.getByText(/DBA #7 — Produce textos orales breves/)).toBeTruthy();
    expect(screen.getByText(/Saluda en inglés/)).toBeTruthy();
    expect(screen.queryByText(/ESTA NO DEBE APARECER/)).toBeNull();
    expect(screen.getAllByText("Transición").length).toBeGreaterThan(0);
  });

  it("cover: subtitle with Transición, áreas, 5 fases pill, singular niño", () => {
    render(<Infographic data={makeShareData({ studentCount: 1 })} {...props} />);
    expect(screen.getByText("Para Transición, 1°, 2° y 3°")).toBeTruthy();
    expect(screen.getByText("Áreas: Lenguaje · Inglés")).toBeTruthy();
    expect(screen.getByText("Transición a 3°")).toBeTruthy();
    expect(screen.getByText("5 fases")).toBeTruthy();
    expect(screen.getByText(/1 niño$/)).toBeTruthy();
  });

  it("no PDF notice in full mode unless soft-capped; no emoji", () => {
    const { container, rerender } = render(<Infographic data={makeShareData()} {...props} />);
    expect(screen.queryByText(/PLAN COMPLETO EN EL PDF/)).toBeNull();
    expect(EMOJI.test(container.textContent ?? "")).toBe(false);
    rerender(<Infographic data={makeShareData()} {...props} softCapped />);
    expect(screen.getByText(/PLAN COMPLETO EN EL PDF/)).toBeTruthy();
  });

  it("omits tarea previa when absent", () => {
    render(<Infographic data={makeShareData({ project: { ...baseShareProject, tarea_previa: null } })} {...props} />);
    expect(screen.queryByText("TAREA ANTES DE EMPEZAR")).toBeNull();
  });
});

describe("Infographic — compact (share image)", () => {
  afterEach(cleanup);

  it("shows one row per fase: etapa eyebrow + per-project summary line", () => {
    const { container } = render(<Infographic data={makeShareData()} {...props} compact />);
    expect(screen.getByText("Despertar la curiosidad")).toBeTruthy();
    expect(screen.getByText("¿Qué descubrimos sobre la panela en la fase 2?")).toBeTruthy();
    // fase 5 has no gran pregunta → first sentence of its first activity
    expect(screen.getByText("Pide a los estudiantes que se sienten en círculo para la fase 5.")).toBeTruthy();
    expect(container.textContent).not.toMatch(/GRAN PREGUNTA DEL DÍA|Profe, si no hay trapiche/);
  });

  it("caps tarea previa, summarizes DBA per materia, drops materiales, always shows the PDF notice", () => {
    const long = "Pide a los estudiantes " + "que pregunten en casa ".repeat(20);
    render(
      <Infographic
        data={makeShareData({ project: { ...baseShareProject, tarea_previa: long } })}
        {...props}
        compact
      />,
    );
    const tarea = screen.getByText(/^Pide a los estudiantes que pregunten/);
    expect(tarea.textContent!.length).toBeLessThanOrEqual(140);
    expect(tarea.textContent!.endsWith("…")).toBe(true);
    expect(screen.getByText("Lenguaje · 2 DBA en 2 grados")).toBeTruthy();
    expect(screen.getByText("Inglés · 1 DBA en 1 grado")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Materiales" })).toBeNull();
    expect(screen.getByText(/PLAN COMPLETO EN EL PDF/)).toBeTruthy();
  });
});
