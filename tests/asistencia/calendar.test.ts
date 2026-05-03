import { describe, it, expect } from "vitest";
import {
  bucketForDay,
  monthBoundaries,
  monthOfDate,
  nextMonth,
  nextMonthIso,
  prevMonth,
  weekdayIndex,
  weekdaysInMonth,
} from "@/lib/asistencia/calendar";

describe("monthBoundaries", () => {
  it("handles 31-day months", () => {
    expect(monthBoundaries("2026-05")).toEqual({ start: "2026-05-01", end: "2026-05-31" });
  });

  it("handles 30-day months", () => {
    expect(monthBoundaries("2026-04")).toEqual({ start: "2026-04-01", end: "2026-04-30" });
  });

  it("handles February in a non-leap year", () => {
    expect(monthBoundaries("2026-02")).toEqual({ start: "2026-02-01", end: "2026-02-28" });
  });

  it("handles February in a leap year", () => {
    expect(monthBoundaries("2024-02")).toEqual({ start: "2024-02-01", end: "2024-02-29" });
  });
});

describe("weekdaysInMonth", () => {
  it("excludes Saturdays and Sundays", () => {
    // May 2026: starts Friday, has 21 weekdays
    const days = weekdaysInMonth("2026-05");
    expect(days).toContain("2026-05-01"); // Friday
    expect(days).not.toContain("2026-05-02"); // Saturday
    expect(days).not.toContain("2026-05-03"); // Sunday
    expect(days).toContain("2026-05-04"); // Monday
    expect(days.length).toBe(21);
  });

  it("returns days in chronological order", () => {
    const days = weekdaysInMonth("2026-05");
    const sorted = [...days].sort();
    expect(days).toEqual(sorted);
  });
});

describe("weekdayIndex", () => {
  it("returns 1 for Monday and 5 for Friday", () => {
    expect(weekdayIndex("2026-05-04")).toBe(1); // Monday
    expect(weekdayIndex("2026-05-08")).toBe(5); // Friday
  });
});

describe("bucketForDay", () => {
  it("returns empty when no records", () => {
    expect(bucketForDay(0, 20, false)).toBe("empty");
  });

  it("returns empty when no students", () => {
    expect(bucketForDay(0, 0, true)).toBe("empty");
  });

  it("returns all at 100%", () => {
    expect(bucketForDay(20, 20, true)).toBe("all");
  });

  it("returns partial at exactly 40%", () => {
    expect(bucketForDay(8, 20, true)).toBe("partial");
  });

  it("returns partial just above 40%", () => {
    expect(bucketForDay(9, 20, true)).toBe("partial");
  });

  it("returns low just below 40%", () => {
    expect(bucketForDay(7, 20, true)).toBe("low");
  });

  it("returns low when present is 1 of many", () => {
    expect(bucketForDay(1, 20, true)).toBe("low");
  });
});

describe("prevMonth / nextMonth", () => {
  it("rolls back across year boundary", () => {
    expect(prevMonth("2026-01")).toBe("2025-12");
  });

  it("rolls forward across year boundary", () => {
    expect(nextMonth("2025-12")).toBe("2026-01");
  });

  it("decrements within a year", () => {
    expect(prevMonth("2026-05")).toBe("2026-04");
  });

  it("increments within a year", () => {
    expect(nextMonth("2026-05")).toBe("2026-06");
  });
});

describe("nextMonthIso", () => {
  it("returns null when at the current Bogotá month", () => {
    expect(nextMonthIso("2026-05", "2026-05-03")).toBeNull();
  });

  it("returns null when past the current Bogotá month", () => {
    expect(nextMonthIso("2026-06", "2026-05-03")).toBeNull();
  });

  it("returns next month when in the past", () => {
    expect(nextMonthIso("2026-04", "2026-05-03")).toBe("2026-05");
  });
});

describe("monthOfDate", () => {
  it("extracts YYYY-MM from a date", () => {
    expect(monthOfDate("2026-05-03")).toBe("2026-05");
  });
});
