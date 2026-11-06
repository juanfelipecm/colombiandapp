import { describe, expect, it } from "vitest";
import { assignTokens } from "@/lib/ai/dba-context";
import type { GeneratedPlan } from "@/lib/ai/plan-schema";
import { runFiveFasesCheck } from "@/scripts/pbl/checks/five-fases";
import { runBandsCoverageCheck } from "@/scripts/pbl/checks/bands-coverage";
import { runZeroTechCheck } from "@/scripts/pbl/checks/zero-tech";
import { runGradeCoverageCheck } from "@/scripts/pbl/checks/grade-coverage";
import { runShapeCheck } from "@/scripts/pbl/checks/shape";
import { renderPlanMarkdown } from "@/scripts/pbl/render-markdown";
import { makeBloque, makePlan } from "../fixtures/clase-viva-plan";

const M = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function plan(grados: number[] = [0, 1, 2, 3]): GeneratedPlan {
  const p = makePlan(grados, [M]) as unknown as GeneratedPlan;
  // fase 5 cierre returns to the pregunta guía
  p.fases[4].bloques[p.fases[4].bloques.length - 1].contenido =
    "Vuelven a la pregunta: ¿cómo contar la historia de una enramada? Cada grupo responde.";
  return p;
}

describe("eval checks", () => {
  it("five-fases passes a well-formed plan and flags order + missing return to the question", () => {
    expect(runFiveFasesCheck(plan()).ok).toBe(true);
    const bad = plan();
    [bad.fases[0], bad.fases[1]] = [bad.fases[1], bad.fases[0]];
    bad.fases[4].bloques[bad.fases[4].bloques.length - 1].contenido = "Se despiden y recogen el salón.";
    const r = runFiveFasesCheck(bad);
    expect(r.ok).toBe(false);
    expect(r.problems.join(" ")).toMatch(/fase\[0\].*fase\[1\].*pregunta guía/s);
  });

  it("bands-coverage: hard on bad partitions, soft when no band block in a multi-band project", () => {
    expect(runBandsCoverageCheck(plan(), [0, 1, 2, 3]).ok).toBe(true);
    const bad = plan();
    bad.fases[1].bloques[2].variantes_por_grado = [{ grados: [0, 1], contenido: "x" }, { grados: [1, 2], contenido: "y" }];
    expect(runBandsCoverageCheck(bad, [0, 1, 2, 3]).problems[0]).toMatch(/missing \[3\] dup \[1\]/);
    const none = plan([3]);
    expect(runBandsCoverageCheck(none, [3]).warnings).toEqual([]);
    const noBands = plan();
    noBands.fases[1].bloques.splice(2, 1);
    expect(runBandsCoverageCheck(noBands, [0, 1, 2, 3]).warnings).toHaveLength(1);
  });

  it("zero-tech walks blocks and allows the teacher's phone only in tip_profe", () => {
    const p = plan();
    p.fases[0].bloques[0].tip_profe = "Profe, si tienes celular puedes mostrar un video corto.";
    expect(runZeroTechCheck(p).ok).toBe(true);
    p.fases[2].bloques[1].contenido = "Los estudiantes buscan en internet y ven un video.";
    const hits = runZeroTechCheck(p).hits.map((h) => h.term);
    expect(hits).toEqual(expect.arrayContaining(["internet", "video"]));
  });

  it("grade-coverage checks dba_targets pairs", () => {
    expect(runGradeCoverageCheck(plan(), [0, 1, 2, 3], [M]).ok).toBe(true);
    expect(runGradeCoverageCheck(plan(), [0, 1, 2, 3, 4], [M]).missing).toHaveLength(1);
  });

  it("shape warns on unretaken tarea and missing reflection routines", () => {
    const p = plan();
    p.fases[1].bloques.push(makeBloque({ tipo: "tarea", titulo: "Tarea" }) as never);
    const w = runShapeCheck(p).warnings.join(" | ");
    expect(w).toMatch(/fase 2 sends a tarea/);
    expect(w).toMatch(/me gustó/);
  });

  it("markdown follows the reference document shape", () => {
    const ctx = assignTokens([
      {
        id: "d",
        grado: 0,
        numero: 1,
        enunciado: "Comunica ideas.",
        materia_id: M,
        materia_slug: "lenguaje",
        materia_nombre: "Lenguaje",
        evidencias: [{ id: "e", numero: 1, descripcion: "Cuenta un cuento." }],
      },
    ]);
    const md = renderPlanMarkdown(plan(), ctx);
    expect(md).toMatch(/^# En nuestras venas, la panela/);
    expect(md).toContain("**Duración:** 5 fases");
    expect(md).toContain("## Fase 1 - Despertar la curiosidad");
    expect(md).toContain("## Fase 5 - Compartir");
    expect(md).toContain("- Transición y 1°: ");
    expect(md).toContain("> Profe, si llueve");
    expect(md).toContain("| Transición | DBA #1 — Comunica ideas. | Cuenta un cuento. |");
  });
});
