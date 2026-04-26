import { expect, test } from "@playwright/test";

/**
 * Smoke tests for the attendance routes — what we CAN verify without a live
 * authenticated session. Mirrors the pattern in smoke.spec.ts: assert that
 * middleware redirects anonymous traffic to /login, so the routes exist and
 * are gated correctly.
 *
 * The full take/save/resume + Inicio CTA scenarios live in
 * `asistencia-happy-path.spec.ts` (skipped pending the auth helper — see
 * README.md). Once that's wired up, those specs cover:
 *
 *   - take attendance for today, save, reload → values persisted
 *   - bulk "Sí, marcar presentes" → all rows pre-fill green; one-tap flip works
 *   - resumen empty when no data; populated after taking attendance
 *   - partial-resume: save 5/18, reload, finish remaining 13
 *   - Inicio CTA: shown when no attendance for today; collapses after save
 */

test.describe("Asistencia smoke", () => {
  test("unauth /asistencia redirects to /login", async ({ page }) => {
    await page.goto("/asistencia");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("unauth /asistencia/resumen redirects to /login", async ({ page }) => {
    await page.goto("/asistencia/resumen");
    await expect(page).toHaveURL(/\/login$/);
  });
});
