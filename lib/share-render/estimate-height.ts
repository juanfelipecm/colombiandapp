import type { ShareData } from "./load-project";

const SOFT_CAP = 6000;
const HARD_CAP = 8000;

// Rough per-section heights in px. Calibrated to match the actual rendered
// component within ~10% — close enough to know whether the soft cap will fire.
const COVER_BASE = 700;
const PRODUCTO_BASE = 300;
const PRODUCTO_PER_LINE = 42;
const PHASE_BASE = 300;
const PHASE_PER_GRADE_MATERIA = 135;
const DBA_PER_GRADE = 90;
const DBA_PER_ITEM = 110;
const MATERIALES_BASE = 220;
const MATERIALES_PER_PAIR = 44;
const CIERRE_BASE = 340;
const FOOTER_BASE = 200;

export type HeightEstimate = {
  estimated: number;
  softCapped: boolean;
  hardCapped: boolean;
};

export function estimateHeight(data: ShareData): HeightEstimate {
  const productoLines = Math.ceil(data.project.producto_final.length / 60);
  const producto = PRODUCTO_BASE + productoLines * PRODUCTO_PER_LINE;

  let phases = 0;
  for (const ph of data.phases) {
    let pairs = 0;
    for (const g of ph.byGrade) pairs += g.byMateria.length;
    phases += PHASE_BASE + pairs * PHASE_PER_GRADE_MATERIA;
  }

  let dbas = 200; // section heading + padding
  for (const g of data.targetsByGrade) {
    dbas += DBA_PER_GRADE + g.items.length * DBA_PER_ITEM;
  }

  const materialesPairs = Math.ceil(data.materiales.length / 2);
  const materiales = MATERIALES_BASE + materialesPairs * MATERIALES_PER_PAIR;

  const cierreLines =
    Math.ceil(data.project.cierre_actividad.length / 60) +
    Math.ceil(data.project.cierre_evaluacion.length / 60);
  const cierre = CIERRE_BASE + cierreLines * 34;

  const estimated =
    COVER_BASE + producto + phases + dbas + materiales + cierre + FOOTER_BASE;

  return {
    estimated,
    softCapped: estimated > SOFT_CAP,
    hardCapped: estimated > HARD_CAP,
  };
}

export const HEIGHT_LIMITS = { SOFT_CAP, HARD_CAP };
