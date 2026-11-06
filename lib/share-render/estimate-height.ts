import type { ShareData } from "./load-project";
import { splitParagraphs, truncate, type Bloque } from "@/lib/clase-viva/bloques";

const SOFT_CAP = 6000;
const HARD_CAP = 8000;

// Rough per-section heights in px at 1080px width. Close enough (~10%) to size
// the Satori canvas and to know whether the image's soft cap would fire.
const COVER_BASE = 740;
const AREAS_LINE = 34;
const TAREA_BASE = 120;
const TAREA_PER_LINE = 30;
const SECTION_HEADING = 120; // padding + h2
const COMPACT_PHASE_ROW = 112;
const PHASE_BASE = 230; // eyebrow + numeral + hairline + nombre
const GRAN_PREGUNTA_BASE = 90;
const GRAN_PREGUNTA_PER_LINE = 32;
const BLOQUE_BASE = 44;
const BLOQUE_PER_LINE = 30;
const PARAGRAPH_GAP = 10;
const VARIANTE_ROW_BASE = 30;
const VARIANTE_PER_LINE = 28;
const TIP_BASE = 50;
const TIP_PER_LINE = 28;
const DBA_COMPACT_PER_MATERIA = 40;
const DBA_MATERIA_HEADING = 60;
const DBA_ROW_BASE = 30;
const DBA_ROW_PER_LINE = 30;
const DBA_EVIDENCIA_PER_LINE = 26;
const MATERIALES_BASE = 220;
const MATERIALES_PER_PAIR = 44;
const FOOTER_BASE = 200;

/** Wrapped line count for plain text with newlines at a given chars-per-line. */
export function linesFor(text: string, charsPerLine: number): number {
  const paras = splitParagraphs(text);
  if (paras.length === 0) return 0;
  return paras.reduce((n, p) => n + Math.max(1, Math.ceil(p.length / charsPerLine)), 0);
}

function textBlock(text: string, cpl: number, perLine: number): number {
  const paras = splitParagraphs(text).length;
  return linesFor(text, cpl) * perLine + Math.max(0, paras - 1) * PARAGRAPH_GAP;
}

export type HeightEstimate = {
  estimated: number;
  softCapped: boolean;
  hardCapped: boolean;
};

export function estimateHeight(data: ShareData, opts: { compact?: boolean } = {}): HeightEstimate {
  const compact = opts.compact ?? false;
  let h = COVER_BASE + (data.materias.length > 0 ? AREAS_LINE : 0);

  if (data.project.tarea_previa) {
    const tarea = compact ? truncate(data.project.tarea_previa, 140) : data.project.tarea_previa;
    h += TAREA_BASE + textBlock(tarea, 70, TAREA_PER_LINE);
  }

  h += SECTION_HEADING;
  for (const ph of data.phases) {
    if (compact) {
      h += COMPACT_PHASE_ROW;
      continue;
    }
    h += PHASE_BASE;
    if (ph.gran_pregunta) h += GRAN_PREGUNTA_BASE + linesFor(ph.gran_pregunta, 60) * GRAN_PREGUNTA_PER_LINE;
    for (const raw of ph.bloques) {
      if (raw.tipo === "invalido") {
        h += BLOQUE_BASE;
        continue;
      }
      const b = raw as Bloque;
      h += BLOQUE_BASE + textBlock(b.contenido, 75, BLOQUE_PER_LINE);
      for (const v of b.variantes_por_grado ?? []) h += VARIANTE_ROW_BASE + textBlock(v.contenido, 52, VARIANTE_PER_LINE);
      if (b.tip_profe) h += TIP_BASE + textBlock(b.tip_profe, 65, TIP_PER_LINE);
    }
  }

  if (data.targetsByMateria.length > 0) {
    h += SECTION_HEADING;
    for (const g of data.targetsByMateria) {
      if (compact) {
        h += DBA_COMPACT_PER_MATERIA;
        continue;
      }
      h += DBA_MATERIA_HEADING;
      for (const r of g.rows) {
        h += DBA_ROW_BASE + linesFor(`DBA #${r.dba_numero} — ${r.enunciado}`, 62) * DBA_ROW_PER_LINE;
        if (r.evidencia && g.materia_slug !== "ingles") h += linesFor(`Evidencia: ${r.evidencia}`, 72) * DBA_EVIDENCIA_PER_LINE;
      }
    }
  }

  if (!compact && data.materiales.length > 0) {
    h += MATERIALES_BASE + Math.ceil(data.materiales.length / 2) * MATERIALES_PER_PAIR;
  }

  h += FOOTER_BASE;
  const estimated = Math.round(h);
  return { estimated, softCapped: estimated > SOFT_CAP, hardCapped: estimated > HARD_CAP };
}

export const HEIGHT_LIMITS = { SOFT_CAP, HARD_CAP };
