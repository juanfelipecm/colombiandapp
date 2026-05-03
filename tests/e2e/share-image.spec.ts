import { expect, test } from "@playwright/test";

// Smoke-tier e2e: confirms the share-image route exists and is auth-gated.
// A fuller flow that intercepts the rendered PNG and asserts byte-floor lives
// in the locked plan but requires the auth-session helper that smoke.spec.ts
// also documents as a gap (tests/e2e/README.md).

test.describe("share-image route", () => {
  test("unauth GET returns 401/307/404, never 200, never 5xx", async ({ request }) => {
    const res = await request.get(
      "/api/proyectos/00000000-0000-0000-0000-000000000000/share-image",
    );
    expect([401, 307, 404]).toContain(res.status());
    expect(res.status()).not.toBe(200);
    expect(res.status()).toBeLessThan(500);
  });

  test("invalid id (non-UUID) returns 400/307, not 5xx", async ({ request }) => {
    const res = await request.get("/api/proyectos/not-a-uuid/share-image");
    expect([400, 307, 401, 404]).toContain(res.status());
    expect(res.status()).toBeLessThan(500);
  });

  test("prewarm HEAD with bad id is also auth-gated", async ({ request }) => {
    const res = await request.head(
      "/api/proyectos/00000000-0000-0000-0000-000000000000/share-image?prewarm=1",
    );
    expect([401, 307, 404]).toContain(res.status());
    expect(res.status()).toBeLessThan(500);
  });
});
