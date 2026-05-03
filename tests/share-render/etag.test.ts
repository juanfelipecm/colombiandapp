import { describe, expect, it } from "vitest";
import { makeEtag } from "@/lib/share-render/etag";

describe("makeEtag", () => {
  it("returns a weak ETag", () => {
    const e = makeEtag("2026-05-03T12:00:00Z", "image");
    expect(e.startsWith("W/")).toBe(true);
  });

  it("is stable for the same updated_at + format", () => {
    const a = makeEtag("2026-05-03T12:00:00Z", "image");
    const b = makeEtag("2026-05-03T12:00:00Z", "image");
    expect(a).toBe(b);
  });

  it("differs for image vs pdf even with same updated_at", () => {
    const a = makeEtag("2026-05-03T12:00:00Z", "image");
    const b = makeEtag("2026-05-03T12:00:00Z", "pdf");
    expect(a).not.toBe(b);
  });

  it("differs after the project is edited (updated_at changes)", () => {
    const a = makeEtag("2026-05-03T12:00:00Z", "image");
    const b = makeEtag("2026-05-03T12:00:01Z", "image");
    expect(a).not.toBe(b);
  });
});
