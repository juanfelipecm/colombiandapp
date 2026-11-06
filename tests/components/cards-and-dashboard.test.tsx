import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ProjectCard, cardStatusLine, projectHref, type ProjectCardData } from "@/components/ui/project-card";
import { InFlightGenerationCard } from "@/app/(app)/dashboard/in-flight-card";
import { DashboardPrimaryCta } from "@/app/(app)/dashboard/actions-client";

const card = (over: Partial<ProjectCardData> = {}): ProjectCardData => ({
  id: "p1",
  titulo: "En nuestras venas, la panela",
  status: "en_ensenanza",
  created_at: new Date().toISOString(),
  grados: [0, 2],
  phasesCompleted: 2,
  ...over,
});

describe("ProjectCard (regression: duración removed)", () => {
  afterEach(cleanup);

  it("one status line per status", () => {
    expect(cardStatusLine("en_ensenanza", 2)).toBe("Fase 3 de 5");
    expect(cardStatusLine("generado", 0)).toBe("5 fases · Listo para empezar");
    expect(cardStatusLine("completado", 5)).toBeNull();
    expect(cardStatusLine("archivado", 1)).toBeNull();
  });

  it("deep-links to the current fase while teaching", () => {
    expect(projectHref("p1", "en_ensenanza", 2)).toBe("/proyectos/p1#fase-3");
    expect(projectHref("p1", "en_ensenanza", 5)).toBe("/proyectos/p1");
    expect(projectHref("p1", "generado", 0)).toBe("/proyectos/p1");
  });

  it("renders the fase line instead of the Activo chip, Transición badge, no weeks", () => {
    const { container } = render(<ProjectCard project={card()} />);
    expect(screen.getByText("Fase 3 de 5")).toBeTruthy();
    expect(screen.queryByText("Activo")).toBeNull();
    expect(screen.getByText("Transición")).toBeTruthy();
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/proyectos/p1#fase-3");
    expect(container.textContent).not.toMatch(/\d semana/);
  });

  it("completed projects keep their chip", () => {
    render(<ProjectCard project={card({ status: "completado", phasesCompleted: 5 })} />);
    expect(screen.getByText("Completado")).toBeTruthy();
  });
});

describe("InFlightGenerationCard (regression)", () => {
  afterEach(cleanup);

  it("shows grades and materias without a duration", () => {
    const { container } = render(
      <InFlightGenerationCard
        generation={{ id: "g1", grados: [0, 1], materiaCount: 2, createdAt: new Date().toISOString() }}
      />,
    );
    expect(container.textContent).toMatch(/Transición y 1° · 2 materias · hace un momento/);
    expect(container.textContent).not.toMatch(/semana/);
    expect(container.textContent).not.toMatch(/▶/);
  });
});

describe("DashboardPrimaryCta active (regression)", () => {
  afterEach(cleanup);

  it("shows the fase label and links to the current fase", () => {
    const { container } = render(
      <DashboardPrimaryCta
        state="active"
        project={{ id: "p1", titulo: "Panela", grados: [1, 2], phasesCompleted: 1 }}
      />,
    );
    expect(screen.getByText("1° y 2° · Fase 2 de 5")).toBeTruthy();
    const continuar = Array.from(container.querySelectorAll("a")).find((a) => a.textContent === "Continuar");
    expect(continuar?.getAttribute("href")).toBe("/proyectos/p1#fase-2");
  });
});
