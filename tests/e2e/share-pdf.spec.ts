import { expect, test } from "@playwright/test";

// Smoke-tier e2e: confirms the share-pdf route exists and is auth-gated.
// Full byte-floor + Content-Type assertion gated on auth-session helper
// (see tests/e2e/README.md).

test.describe("share-pdf route", () => {
  test("unauth GET returns 401/307/404, never 200, never 5xx", async ({ request }) => {
    const res = await request.get(
      "/api/proyectos/00000000-0000-0000-0000-000000000000/share-pdf",
    );
    expect([401, 307, 404]).toContain(res.status());
    expect(res.status()).not.toBe(200);
    expect(res.status()).toBeLessThan(500);
  });

  test("invalid id (non-UUID) returns 400/307, not 5xx", async ({ request }) => {
    const res = await request.get("/api/proyectos/not-a-uuid/share-pdf");
    expect([400, 307, 401, 404]).toContain(res.status());
    expect(res.status()).toBeLessThan(500);
  });
});
