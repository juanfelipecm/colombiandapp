import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), back: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}));
const setPhaseCompleted = vi.fn(async () => {});
vi.mock("@/app/(app)/proyectos/[id]/actions", () => ({
  setPhaseCompleted: (...a: unknown[]) => setPhaseCompleted(...(a as [])),
  setProjectStatus: vi.fn(async () => {}),
  setSeEnsenoBien: vi.fn(async () => {}),
}));
vi.mock("@/lib/share-render/share-handlers", () => ({ shareImage: vi.fn(), downloadPdf: vi.fn() }));

import { ProjectView, type ViewProject } from "@/app/(app)/proyectos/[id]/project-view";
import { BloqueBlock, GradeBandTable } from "@/app/(app)/proyectos/[id]/phase-section";
import { parseBloques } from "@/lib/clase-viva/bloques";
import { ETAPAS, ETAPA_META } from "@/lib/clase-viva/etapas";
import type { LoadedPhase } from "@/lib/projects/load-project";
import { makeBloque } from "../fixtures/clase-viva-plan";

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

function phases(completed = 0, opts: { invalid?: boolean } = {}): LoadedPhase[] {
  return ETAPAS.map((etapa, i) => ({
    id: `ph${i + 1}`,
    orden: i + 1,
    etapa,
    nombre: ETAPA_META[etapa].nombre,
    gran_pregunta: i === 4 ? null : `¿Gran pregunta ${i + 1}?`,
    bloques: parseBloques(
      [
        makeBloque({ tipo: "inicio", titulo: "Inicio", contenido: `Inicio de la fase ${i + 1}. Segunda frase del inicio.` }),
        i === 1
          ? makeBloque({
              tipo: "actividad_por_grados",
              titulo: "Actividad por grados",
              variantes_por_grado: [
                { grados: [0, 1], contenido: "Exploran y dibujan lo que encuentran." },
                { grados: [2, 3], contenido: "Preguntan y registran en el cuaderno." },
              ],
              tip_profe: "Profe, si llueve haz la actividad en el corredor.",
            })
          : makeBloque(),
        ...(opts.invalid && i === 2 ? [{ tipo: "baile" }] : []),
      ],
      {},
    ),
    completed_at: i < completed ? "2026-11-01T00:00:00Z" : null,
  }));
}

const project = (over: Partial<ViewProject> = {}): ViewProject => ({
  id: "p1",
  titulo: "En nuestras venas, la panela",
  pregunta_guia: "¿Cómo contar la historia de una enramada?",
  tarea_previa: "Pide a los estudiantes que pregunten en casa qué recetas llevan panela.",
  status: "en_ensenanza",
  se_enseno_bien: null,
  ...over,
});

const meta = {
  grados: [0, 1, 2, 3],
  materias: [{ id: "m1", slug: "lenguaje", nombre: "Lenguaje" }],
  studentCount: 12,
};

const targets = [
  {
    materia_id: "m1",
    materia_nombre: "Lenguaje",
    materia_slug: "lenguaje",
    rows: [{ grado: 0, dba_numero: 1, enunciado: "Comunica ideas.", evidencia: "Cuenta un cuento." }],
  },
];

function renderView(p: ViewProject, ph: LoadedPhase[], invalidoCount = 0) {
  return render(
    <ProjectView
      project={p}
      meta={meta}
      targetsByMateria={targets}
      phases={ph}
      materiales={["papel", "panela"]}
      invalidoCount={invalidoCount}
    />,
  );
}

const primaryButtons = (root: HTMLElement) =>
  Array.from(root.querySelectorAll("button")).filter((b) => b.className.includes("bg-brand-blue text-black"));

describe("ProjectView — Clase Viva", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("header: title, pregunta guía box, '5 fases' meta with Transición; no legacy sections", () => {
    const { container } = renderView(project(), phases(1));
    expect(screen.getByRole("heading", { level: 1, name: /panela/ })).toBeTruthy();
    expect(screen.getByText("Pregunta guía")).toBeTruthy();
    expect(screen.getByText(/5 fases · 12 estudiantes · Transición, 1°, 2° y 3° · Lenguaje/)).toBeTruthy();
    expect(screen.getByText("Las 5 fases")).toBeTruthy();
    expect(container.textContent).not.toMatch(/Producto final|Cierre del proyecto|Hoy|semana/);
    expect(EMOJI.test(container.textContent ?? "")).toBe(false);
  });

  it("en_ensenanza: no bubble, strip shows 'Siguiente', current fase open with the only primary button", () => {
    const { container } = renderView(project(), phases(1));
    expect(container.querySelector("svg.lucide-sparkles")).toBeNull();
    expect(screen.getByText("Siguiente: Fase 2 · Indagar e investigar")).toBeTruthy();
    const current = container.querySelector("#fase-2") as HTMLElement;
    expect(current.getAttribute("data-current")).toBe("true");
    expect(within(current).getByRole("button", { expanded: true })).toBeTruthy();
    expect(within(current).getByText("Completar Fase 2")).toBeTruthy();
    expect(primaryButtons(container)).toHaveLength(1);
    // completed fase 1 is collapsed and shows its summary line
    const f1 = container.querySelector("#fase-1") as HTMLElement;
    expect(within(f1).getByText("Completada")).toBeTruthy();
    expect(within(f1).getByTestId("fase-summary").textContent).toBe("¿Gran pregunta 1?");
  });

  it("generado: one yellow bubble, all fases collapsed, no Completar", () => {
    const { container } = renderView(project({ status: "generado" }), phases(0));
    expect(container.querySelectorAll("svg.lucide-sparkles")).toHaveLength(1);
    expect(screen.queryByText(/Completar Fase/)).toBeNull();
    expect(screen.queryByText(/Siguiente:/)).toBeNull();
    expect(container.querySelectorAll('[aria-expanded="true"]')).toHaveLength(0);
    // fase 5 has no gran_pregunta → summary falls back to the first activity sentence
    const f5 = container.querySelector("#fase-5") as HTMLElement;
    expect(within(f5).getByTestId("fase-summary").textContent).toMatch(/^Pide a los estudiantes/);
  });

  it("tarea previa sits above Fase 1 while it is pending, then moves to a disclosure", () => {
    const { container, unmount } = renderView(project(), phases(0));
    const callout = container.querySelector('[data-callout="warning"]') as HTMLElement;
    expect(callout.textContent).toMatch(/Tarea antes de empezar/);
    expect(callout.compareDocumentPosition(container.querySelector("#fase-1")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    unmount();
    const { container: c2 } = renderView(project(), phases(1));
    expect(c2.querySelector('[data-callout="warning"]')).toBeNull();
    expect(screen.getAllByText("Tarea previa").length).toBeGreaterThan(0);
  });

  it("completing the current fase calls the action and announces it", () => {
    renderView(project(), phases(1));
    fireEvent.click(screen.getByText("Completar Fase 2"));
    expect(setPhaseCompleted).toHaveBeenCalledWith("p1", "ph2", true);
    expect(screen.getByText("Fase 2 completada")).toBeTruthy();
  });

  it("question boxes are blue, tips are yellow", () => {
    const { container } = renderView(project(), phases(1));
    const questions = container.querySelectorAll('[data-callout="question"]');
    expect(questions.length).toBe(2); // pregunta guía + gran pregunta of the open fase
    questions.forEach((q) => expect(q.className).toContain("bg-[#DDEEFF]"));
    const tip = container.querySelector('[data-callout="tip"]') as HTMLElement;
    expect(tip.textContent).toBe("Profe, si llueve haz la actividad en el corredor.");
    expect(tip.className).toContain("border-brand-yellow");
  });

  it("legacy / empty plan shows the recovery state", () => {
    renderView(project({ tarea_previa: null }), []);
    expect(screen.getByText("Volver a generar")).toBeTruthy();
  });

  it("hides 'Compartir como imagen' when blocks are damaged, keeps the PDF", () => {
    renderView(project(), phases(1, { invalid: true }), 1);
    fireEvent.click(screen.getByLabelText("Más opciones"));
    expect(screen.queryByText("Compartir como imagen")).toBeNull();
    expect(screen.getByText("Descargar PDF")).toBeTruthy();
  });

  it("kebab and strip buttons meet the 44px target", () => {
    const { container } = renderView(project(), phases(1));
    expect(screen.getByLabelText("Más opciones").className).toContain("h-11 w-11");
    const stripButtons = container.querySelectorAll('[aria-label^="Ir a Fase"]');
    expect(stripButtons).toHaveLength(5);
    stripButtons.forEach((b) => expect(b.className).toContain("h-11 w-11"));
  });

  it("DBA por grado groups rows per materia", () => {
    renderView(project(), phases(1));
    fireEvent.click(screen.getByRole("button", { name: "DBA por grado" }));
    expect(screen.getAllByText("Lenguaje").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/DBA #1 — Comunica ideas\./).length).toBeGreaterThan(0);
  });
});

describe("phase-section blocks", () => {
  afterEach(cleanup);

  it("renders every bloque tipo with its label", () => {
    for (const tipo of ["inicio", "rompehielos", "experiencia", "actividad", "tarea", "cierre"]) {
      const [b] = parseBloques([makeBloque({ tipo, titulo: `Título ${tipo}` })]);
      const { container } = render(<BloqueBlock bloque={b} />);
      expect(container.querySelector(`[data-bloque="${tipo}"] h4`)?.textContent).toBe(`Título ${tipo}`);
      cleanup();
    }
  });

  it("invalido renders a recovery line with a regenerate link", () => {
    render(<BloqueBlock bloque={{ tipo: "invalido" }} />);
    expect(screen.getByText(/Este bloque no se pudo mostrar/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /volver a generar el proyecto/ }).getAttribute("href")).toBe(
      "/proyectos/nuevo",
    );
  });

  it("grade bands: stacked rows for phones and a semantic table for sm+", () => {
    const { container } = render(
      <GradeBandTable
        variantes={[
          { grados: [4, 5], contenido: "Investigan y comparan." },
          { grados: [0, 1], contenido: "Exploran y dibujan." },
          { grados: [2, 3], contenido: "Preguntan y registran." },
        ]}
      />,
    );
    const rows = container.querySelectorAll("table th[scope=row]");
    expect(Array.from(rows).map((r) => r.textContent)).toEqual(["Transición y 1°", "2° y 3°", "4° y 5°"]);
    expect(container.querySelector(".sm\\:hidden")?.children).toHaveLength(3);
  });
});
