import { describe, it, expect } from "vitest";
import { absenceRate, sortByAbsenceRate, sortByName } from "@/lib/asistencia/sort";
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

describe("absenceRate", () => {
  it("returns 0 when no days marked", () => {
    expect(absenceRate(row({ days_marked_30: 0, absences_30: 0 }))).toBe(0);
  });

  it("computes ratio correctly", () => {
    expect(absenceRate(row({ days_marked_30: 18, absences_30: 4 }))).toBeCloseTo(0.222, 3);
  });

  it("returns 1 when all marked days are absences", () => {
    expect(absenceRate(row({ days_marked_30: 5, absences_30: 5 }))).toBe(1);
  });
});

describe("sortByAbsenceRate", () => {
  it("returns DESC by rate", () => {
    const rows = [
      row({ student_id: "a", days_marked_30: 18, absences_30: 1 }),
      row({ student_id: "b", days_marked_30: 18, absences_30: 8 }),
    ];
    expect(sortByAbsenceRate(rows).map((r) => r.student_id)).toEqual(["b", "a"]);
  });
});

describe("sortByName", () => {
  it("sorts by last_name then first_name", () => {
    const rows = [
      row({ student_id: "1", first_name: "B", last_name: "Pérez" }),
      row({ student_id: "2", first_name: "A", last_name: "Pérez" }),
      row({ student_id: "3", first_name: "Z", last_name: "Gómez" }),
    ];
    expect(sortByName(rows).map((r) => r.student_id)).toEqual(["3", "2", "1"]);
  });
});
