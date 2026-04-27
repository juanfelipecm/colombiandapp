import { describe, it, expect } from "vitest";
import { groupResumenRows } from "@/lib/asistencia/group";
import type { SummaryRow } from "@/lib/asistencia/types";

function row(overrides: Partial<SummaryRow>): SummaryRow {
  return {
    student_id: "s1",
    school_id: "sc1",
    first_name: "Test",
    last_name: "Student",
    grade: 1,
    student_created_at: "2026-01-01T00:00:00Z",
    as_of_date: "2026-04-26",
    days_marked_30: 0,
    absences_30: 0,
    lates_30: 0,
    unjustified_absences_30: 0,
    ...overrides,
  };
}

describe("groupResumenRows", () => {
  it("puts a never-marked student in sin_datos, not sin_ausencias", () => {
    // The whole point of three buckets: 0 absences out of 0 marked is NOT
    // "perfect attendance," it's "we have no signal."
    const rows = [row({ student_id: "a", days_marked_30: 0, absences_30: 0 })];
    const buckets = groupResumenRows(rows);
    expect(buckets.sin_datos).toHaveLength(1);
    expect(buckets.sin_ausencias).toHaveLength(0);
    expect(buckets.con_ausencias).toHaveLength(0);
  });

  it("puts a marked-and-never-absent student in sin_ausencias", () => {
    const rows = [row({ student_id: "a", days_marked_30: 18, absences_30: 0 })];
    const buckets = groupResumenRows(rows);
    expect(buckets.sin_ausencias).toHaveLength(1);
    expect(buckets.con_ausencias).toHaveLength(0);
    expect(buckets.sin_datos).toHaveLength(0);
  });

  it("puts a student with at least one absence in con_ausencias", () => {
    const rows = [row({ student_id: "a", days_marked_30: 18, absences_30: 1 })];
    const buckets = groupResumenRows(rows);
    expect(buckets.con_ausencias).toHaveLength(1);
    expect(buckets.sin_ausencias).toHaveLength(0);
    expect(buckets.sin_datos).toHaveLength(0);
  });

  it("sorts con_ausencias by rate DESC", () => {
    // 8/18 = 44%, 4/18 = 22%, 1/18 = 5.5%
    const rows = [
      row({ student_id: "low",  last_name: "Lo", days_marked_30: 18, absences_30: 1 }),
      row({ student_id: "high", last_name: "Hi", days_marked_30: 18, absences_30: 8 }),
      row({ student_id: "mid",  last_name: "Mi", days_marked_30: 18, absences_30: 4 }),
    ];
    const buckets = groupResumenRows(rows);
    expect(buckets.con_ausencias.map((r) => r.student_id)).toEqual(["high", "mid", "low"]);
  });

  it("breaks rate ties by absolute absences DESC, then by name", () => {
    // Same rate, different absolute counts.
    const rows = [
      row({ student_id: "a", last_name: "Pérez", days_marked_30: 10, absences_30: 5 }),
      row({ student_id: "b", last_name: "Gómez", days_marked_30: 20, absences_30: 10 }),
    ];
    const buckets = groupResumenRows(rows);
    // b has higher absolute count → comes first
    expect(buckets.con_ausencias.map((r) => r.student_id)).toEqual(["b", "a"]);
  });

  it("sorts sin_ausencias and sin_datos alphabetically by last_name then first_name", () => {
    const rows = [
      row({ student_id: "1", first_name: "Z", last_name: "B", days_marked_30: 5, absences_30: 0 }),
      row({ student_id: "2", first_name: "A", last_name: "B", days_marked_30: 5, absences_30: 0 }),
      row({ student_id: "3", first_name: "X", last_name: "A", days_marked_30: 5, absences_30: 0 }),
    ];
    const buckets = groupResumenRows(rows);
    // last name A first, then last name B sorted by first name
    expect(buckets.sin_ausencias.map((r) => r.student_id)).toEqual(["3", "2", "1"]);
  });

  it("does not mutate the input array", () => {
    const rows = [
      row({ student_id: "a", days_marked_30: 18, absences_30: 1 }),
      row({ student_id: "b", days_marked_30: 18, absences_30: 8 }),
    ];
    const before = rows.map((r) => r.student_id);
    groupResumenRows(rows);
    expect(rows.map((r) => r.student_id)).toEqual(before);
  });

  it("handles empty input cleanly", () => {
    const buckets = groupResumenRows([]);
    expect(buckets.con_ausencias).toEqual([]);
    expect(buckets.sin_ausencias).toEqual([]);
    expect(buckets.sin_datos).toEqual([]);
  });

  it("uses Spanish collation (ñ sorts as ñ, not as n+something)", () => {
    const rows = [
      row({ student_id: "1", last_name: "Ñunez",  days_marked_30: 5, absences_30: 0 }),
      row({ student_id: "2", last_name: "Nuñez",  days_marked_30: 5, absences_30: 0 }),
    ];
    const buckets = groupResumenRows(rows);
    // localeCompare("es") sorts ñ AFTER n
    expect(buckets.sin_ausencias[0].last_name).toBe("Nuñez");
  });
});
