import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ETAPAS,
  ETAPA_META,
  etapaByOrden,
  etapasSentence,
  faseProgressLabel,
  isEtapa,
} from "@/lib/clase-viva/etapas";
import {
  deriveGradeBands,
  formatGrado,
  formatGradosBand,
  formatGradosList,
} from "@/lib/clase-viva/grados";
import {
  faseSummaryLine,
  parseBloques,
  splitParagraphs,
  truncate,
} from "@/lib/clase-viva/bloques";

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

const bloque = (over: Record<string, unknown> = {}) => ({
  tipo: "actividad",
  titulo: "Actividad central",
  contenido: "Pide a los estudiantes que observen la panela. Luego conversan en círculo sobre su sabor.",
  variantes_por_grado: null,
  tip_profe: null,
  ...over,
});

describe("etapas", () => {
  it("has five etapas in methodology order with orden 1..5", () => {
    expect(ETAPAS).toEqual([
      "despertar_curiosidad",
      "indagar_investigar",
      "crear",
      "reflexionar",
      "compartir",
    ]);
    ETAPAS.forEach((e, i) => expect(ETAPA_META[e].orden).toBe(i + 1));
  });

  it("maps orden to etapa", () => {
    expect(etapaByOrden(1)).toBe("despertar_curiosidad");
    expect(etapaByOrden(5)).toBe("compartir");
    expect(etapaByOrden(6)).toBeNull();
    expect(etapaByOrden(0)).toBeNull();
  });

  it("isEtapa guards strings", () => {
    expect(isEtapa("crear")).toBe(true);
    expect(isEtapa("exploracion")).toBe(false);
    expect(isEtapa(3)).toBe(false);
  });

  it("builds the wizard sentence", () => {
    expect(etapasSentence()).toBe(
      "Despertar la curiosidad, Indagar e investigar, Crear, Reflexionar y Compartir",
    );
  });

  it("faseProgressLabel per status", () => {
    expect(faseProgressLabel("generado", 0)).toBe("5 fases");
    expect(faseProgressLabel("archivado", 2)).toBe("5 fases");
    expect(faseProgressLabel("en_ensenanza", 0)).toBe("Fase 1 de 5");
    expect(faseProgressLabel("en_ensenanza", 2)).toBe("Fase 3 de 5");
    expect(faseProgressLabel("en_ensenanza", 5)).toBe("5 fases completadas");
    expect(faseProgressLabel("completado", 3)).toBe("5 fases completadas");
  });

  it("copy has no emoji", () => {
    for (const e of ETAPAS) {
      const m = ETAPA_META[e];
      expect(EMOJI.test(`${m.nombre}${m.descripcion}${m.generando}`)).toBe(false);
    }
  });
});

describe("grados", () => {
  it("derives bands from the selection", () => {
    expect(deriveGradeBands([0, 1, 2, 3, 4, 5])).toEqual([[0, 1], [2, 3], [4, 5]]);
    expect(deriveGradeBands([1, 2, 3, 4, 5])).toEqual([[1], [2, 3], [4, 5]]);
    expect(deriveGradeBands([3])).toEqual([[3]]);
    expect(deriveGradeBands([5, 0])).toEqual([[0], [5]]);
  });

  it("formats grades in Spanish", () => {
    expect(formatGrado(0)).toBe("Transición");
    expect(formatGrado(3)).toBe("3°");
    expect(formatGradosList([2, 0, 1])).toBe("Transición, 1° y 2°");
    expect(formatGradosList([4])).toBe("4°");
    expect(formatGradosBand([0, 1])).toBe("Transición y 1°");
  });
});

describe("bloques", () => {
  afterEach(() => vi.restoreAllMocks());

  it("parses valid bloques", () => {
    const out = parseBloques([bloque(), bloque({ tipo: "cierre", titulo: "Cierre" })]);
    expect(out).toHaveLength(2);
    expect(out[1].tipo).toBe("cierre");
  });

  it("turns a malformed entry into a logged placeholder, never drops it", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const out = parseBloques([bloque(), { tipo: "baile" }, bloque()], { projectId: "p1" });
    expect(out.map((b) => b.tipo)).toEqual(["actividad", "invalido", "actividad"]);
    expect(spy).toHaveBeenCalledOnce();
    expect(String(spy.mock.calls[0][0])).toContain("project=p1");
  });

  it("returns [] for non-arrays", () => {
    expect(parseBloques(null)).toEqual([]);
    expect(parseBloques({})).toEqual([]);
  });

  it("splits paragraphs on newlines, dropping blanks", () => {
    expect(splitParagraphs("Uno.\r\n\r\n  Dos.  \n\nTres.\n")).toEqual(["Uno.", "Dos.", "Tres."]);
  });

  it("truncate adds an ellipsis within the limit", () => {
    expect(truncate("abcdef", 10)).toBe("abcdef");
    const t = truncate("a".repeat(100), 90);
    expect(t.length).toBe(90);
    expect(t.endsWith("…")).toBe(true);
  });

  it("faseSummaryLine prefers gran_pregunta, else first sentence of first activity", () => {
    const bloques = parseBloques([
      bloque({ tipo: "inicio", titulo: "Inicio", contenido: "Reúne al grupo en círculo para empezar el día juntos." }),
      bloque(),
    ]);
    expect(faseSummaryLine({ gran_pregunta: "¿Qué sabemos de la panela?", bloques })).toBe(
      "¿Qué sabemos de la panela?",
    );
    expect(faseSummaryLine({ gran_pregunta: null, bloques })).toBe(
      "Pide a los estudiantes que observen la panela.",
    );
    expect(faseSummaryLine({ gran_pregunta: null, bloques: [] })).toBe("");
    expect(faseSummaryLine({ gran_pregunta: "x".repeat(200), bloques }).length).toBe(90);
  });
});
