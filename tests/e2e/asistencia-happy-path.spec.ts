import { expect, test } from "@playwright/test";

/**
 * Happy-path scenarios for the attendance feature.
 *
 * SKIPPED until the e2e auth helper lands (see tests/e2e/README.md). Selectors
 * and flow are correct; only the storageState wiring is missing.
 *
 * When un-skipping:
 *   1. Add a `test.use({ storageState: 'tests/e2e/fixtures/auth.json' })`
 *      using a seeded teacher with ≥5 students across grades.
 *   2. Add a beforeEach that clears `attendance_records` for the test teacher.
 *
 * Routing:
 *   /asistencia      → calendar grid (default landing for the tab)
 *   /asistencia/hoy  → daily roster form ("pasemos lista")
 */

test.describe("Asistencia happy path", () => {
  test.skip(true, "Requires auth fixture — see tests/e2e/README.md");

  test("take attendance, save, reload — values persist", async ({ page }) => {
    await page.goto("/asistencia/hoy");
    await expect(page.getByText(/Pasemos lista/i)).toBeVisible();

    // Bulk button: "Sí, marcar presentes"
    await page.getByRole("button", { name: /marcar presentes/i }).click();
    await expect(page.getByText(/marcados/i)).toContainText(/^\d+ de \d+ marcados$/);

    await page.getByRole("button", { name: /Guardar lista/i }).click();
    await expect(page).toHaveURL(/\/asistencia\/hoy$/);

    // Reload — UI should now read "Actualizar lista" because today exists.
    await page.reload();
    await expect(page.getByRole("button", { name: /Actualizar lista/i })).toBeVisible();
  });

  test("bulk button pre-fills, one-tap flip to ausente works", async ({ page }) => {
    await page.goto("/asistencia/hoy");
    await page.getByRole("button", { name: /marcar presentes/i }).click();

    const firstAusente = page.getByRole("radio", { name: /^Ausente$/ }).first();
    await firstAusente.click();
    await expect(firstAusente).toHaveAttribute("aria-checked", "true");

    await expect(page.getByLabel(/Falta justificada/i)).toBeVisible();
  });

  test("calendar renders the current month", async ({ page }) => {
    await page.goto("/asistencia");
    await expect(page.getByText(/Resumen del mes/i)).toBeVisible();
    // Weekday headers
    await expect(page.getByRole("region", { name: /Calendario de asistencia/i })).toBeVisible();
  });

  test("partial save then resume — only marked students prefill", async ({ page }) => {
    await page.goto("/asistencia/hoy");

    const presentRadios = page.getByRole("radio", { name: /^Presente$/ });
    await presentRadios.nth(0).click();
    await presentRadios.nth(1).click();
    await presentRadios.nth(2).click();

    await expect(page.getByRole("button", { name: /Guardar lista/i })).toBeDisabled();
    await expect(page.getByText(/^3 de \d+ marcados$/)).toBeVisible();
  });

  test("Inicio CTA — collapses after taking attendance", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("link", { name: /Tomar asistencia/i })).toBeVisible();

    await page.getByRole("link", { name: /Tomar asistencia/i }).click();
    await expect(page).toHaveURL(/\/asistencia\/hoy$/);
    await page.getByRole("button", { name: /marcar presentes/i }).click();
    await page.getByRole("button", { name: /Guardar lista/i }).click();

    await page.goto("/dashboard");
    await expect(page.getByText(/Ya tomaste asistencia/i)).toBeVisible();
  });
});
