import type { ResumenBuckets, SummaryRow } from "./types";
import { sortByAbsenceRate, sortByName } from "./sort";

// Three buckets, never collapse "perfect attendance" with "never marked":
//   con_ausencias  — at least 1 absence (the actionable list)
//   sin_ausencias  — marked at least once and never absent
//   sin_datos      — never marked in the window (we have no signal)
export function groupResumenRows(rows: SummaryRow[]): ResumenBuckets {
  const con_ausencias: SummaryRow[] = [];
  const sin_ausencias: SummaryRow[] = [];
  const sin_datos: SummaryRow[] = [];

  for (const row of rows) {
    if (row.days_marked_30 === 0) {
      sin_datos.push(row);
    } else if (row.absences_30 > 0) {
      con_ausencias.push(row);
    } else {
      sin_ausencias.push(row);
    }
  }

  return {
    con_ausencias: sortByAbsenceRate(con_ausencias),
    sin_ausencias: sortByName(sin_ausencias),
    sin_datos: sortByName(sin_datos),
  };
}
