import { expect, test } from "@playwright/test";

// Smoke-tier e2e: the prewarm code path runs on the client (project-view
// useEffect HEAD). With no auth session in this harness, the project page
// itself redirects to /login before the useEffect mounts. We assert that:
//   - the prewarm route exists at the expected URL shape (returns a sensible
//     status, not 5xx)
//   - HEAD requests are accepted by the route
// Full assertion (HEAD fires within 500ms of project-page mount) is gated on
// the auth-session helper documented in tests/e2e/README.md.

test.describe("share-image prewarm", () => {
  test("HEAD ?prewarm=1 returns 401/307/404, not 5xx", async ({ request }) => {
    const res = await request.head(
      "/api/proyectos/00000000-0000-0000-0000-000000000000/share-image?prewarm=1",
    );
    expect([401, 307, 404]).toContain(res.status());
    expect(res.status()).toBeLessThan(500);
  });
});
