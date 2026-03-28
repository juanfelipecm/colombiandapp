import { describe, it, expect, vi, afterEach } from "vitest";
import { computeAge } from "@/lib/utils/age";

describe("computeAge", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("computes correct age for a past birthday", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-28"));
    expect(computeAge("2019-01-15")).toBe(7);
  });

  it("computes correct age when birthday is today", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-28"));
    expect(computeAge("2019-03-28")).toBe(7);
  });

  it("computes correct age when birthday is tomorrow", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-28"));
    expect(computeAge("2019-03-29")).toBe(6);
  });

  it("returns 0 for a birth date in the future", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-28"));
    expect(computeAge("2027-01-01")).toBe(0);
  });

  it("handles Date object input", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-28"));
    expect(computeAge(new Date("2016-06-15"))).toBe(9);
  });

  it("computes correct age for a student born in 2018 (typical 1st grader)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-28"));
    expect(computeAge("2018-07-20")).toBe(7);
  });

  it("computes correct age for a student born in 2015 (typical 5th grader)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-28"));
    expect(computeAge("2015-02-10")).toBe(11);
  });
});
