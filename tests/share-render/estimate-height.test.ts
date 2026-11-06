import { describe, expect, it } from "vitest";
import { estimateHeight, HEIGHT_LIMITS, linesFor } from "@/lib/share-render/estimate-height";
import { makeShareData, sharePhases } from "../fixtures/share-data";

describe("estimateHeight", () => {
  it("counts wrapped lines per paragraph", () => {
    expect(linesFor("", 60)).toBe(0);
    expect(linesFor("a".repeat(60), 60)).toBe(1);
    expect(linesFor("a".repeat(61), 60)).toBe(2);
    expect(linesFor("uno\n\ndos", 60)).toBe(2);
  });

  it("compact overview of a typical plan stays under the soft cap", () => {
    const e = estimateHeight(makeShareData(), { compact: true });
    expect(e.estimated).toBeGreaterThan(1800);
    expect(e.softCapped).toBe(false);
  });

  it("compact height does not grow with block text (bounded by design)", () => {
    const huge = makeShareData({ phases: sharePhases({ blocksPerFase: 8, contenido: "x".repeat(1400) }) });
    expect(estimateHeight(huge, { compact: true }).estimated).toBe(
      estimateHeight(makeShareData(), { compact: true }).estimated,
    );
    expect(estimateHeight(huge, { compact: true }).hardCapped).toBe(false);
  });

  it("full (PDF) height grows with the plan and is taller than the overview", () => {
    const typical = estimateHeight(makeShareData());
    const huge = estimateHeight(makeShareData({ phases: sharePhases({ blocksPerFase: 8, contenido: "x".repeat(1400) }) }));
    expect(typical.estimated).toBeGreaterThan(estimateHeight(makeShareData(), { compact: true }).estimated);
    expect(huge.estimated).toBeGreaterThan(typical.estimated * 3);
    expect(huge.hardCapped).toBe(true);
  });

  it("exposes the limits as a const", () => {
    expect(HEIGHT_LIMITS.SOFT_CAP).toBe(6000);
    expect(HEIGHT_LIMITS.HARD_CAP).toBe(8000);
  });
});
