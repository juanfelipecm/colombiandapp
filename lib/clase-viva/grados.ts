/** Grade helpers. Grade 0 is Transición. */

export const GRADE_BANDS: number[][] = [
  [0, 1],
  [2, 3],
  [4, 5],
];

/**
 * Canonical bands intersected with the teacher's selection, empty bands dropped.
 *   [1,2,3,4,5] → [[1],[2,3],[4,5]]   [3] → [[3]]   [0,5] → [[0],[5]]
 */
export function deriveGradeBands(selected: number[]): number[][] {
  const set = new Set(selected);
  return GRADE_BANDS.map((band) => band.filter((g) => set.has(g))).filter((b) => b.length > 0);
}

export function formatGrado(g: number): string {
  return g === 0 ? "Transición" : `${g}°`;
}

function joinEs(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

/** [0,1,2] → "Transición, 1° y 2°" */
export function formatGradosList(grados: number[]): string {
  return joinEs([...grados].sort((a, b) => a - b).map(formatGrado));
}

/** [0,1] → "Transición y 1°" */
export function formatGradosBand(grados: number[]): string {
  return formatGradosList(grados);
}
