import { test } from "@playwright/test";

// Scaffolded: full authenticated render flow. Awaits the auth-session helper
// documented in tests/e2e/README.md (also blocks 4 other specs). Once that
// helper lands, remove the test.skip gate and wire it in via the storageState
// or cookie-injection pattern.
test.describe.skip("share-image (authenticated)", () => {
  test("logged-in user GETs share-image → 200 + image/png + non-trivial body", async ({
    request,
  }) => {
    // Replace with a real project id from the seeded test teacher.
    const projectId = "REPLACE_WITH_SEEDED_PROJECT_ID";
    const res = await request.get(`/api/proyectos/${projectId}/share-image`);
    if (res.status() !== 200) throw new Error(`expected 200, got ${res.status()}`);
    const ct = res.headers()["content-type"] ?? "";
    if (!ct.startsWith("image/png")) throw new Error(`expected image/png, got ${ct}`);
    const body = await res.body();
    if (body.length < 10_000) throw new Error(`PNG suspiciously small: ${body.length}b`);
  });
});
