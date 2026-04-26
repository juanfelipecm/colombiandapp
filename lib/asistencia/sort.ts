import type { SummaryRow } from "./types";

export function absenceRate(row: SummaryRow): number {
  if (row.days_marked_30 === 0) return 0;
  return row.absences_30 / row.days_marked_30;
}

// Sort by rate DESC, then absences DESC, then name ASC.
// Used inside the con_ausencias bucket — the actionable list.
export function sortByAbsenceRate(rows: SummaryRow[]): SummaryRow[] {
  return [...rows].sort((a, b) => {
    const rateDiff = absenceRate(b) - absenceRate(a);
    if (rateDiff !== 0) return rateDiff;
    const absDiff = b.absences_30 - a.absences_30;
    if (absDiff !== 0) return absDiff;
    return compareNames(a, b);
  });
}

// Alphabetical, used for sin_ausencias and sin_datos buckets.
export function sortByName(rows: SummaryRow[]): SummaryRow[] {
  return [...rows].sort(compareNames);
}

function compareNames(a: SummaryRow, b: SummaryRow): number {
  const last = a.last_name.localeCompare(b.last_name, "es");
  if (last !== 0) return last;
  return a.first_name.localeCompare(b.first_name, "es");
}
