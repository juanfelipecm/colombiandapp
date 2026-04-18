import { test, expect } from "@playwright/test";

test.describe.skip("wizard happy path — needs auth session + Anthropic mock (see README.md)", () => {
  test("Diana completes 4 steps and lands on the project view", async ({ page }) => {
    // PRECONDITION: logged-in teacher session (storageState) + PLAYWRIGHT_MODE=1
    // so the server returns a canned plan instead of calling Anthropic.
    await page.goto("/dashboard");

    await page.getByRole("button", { name: "+ Nuevo proyecto" }).click();
    await expect(page).toHaveURL(/\/proyectos\/nuevo$/);

    // Step 1: grados — leave defaults
    await page.getByRole("button", { name: "Siguiente" }).click();

    // Step 2: materias
    await page.getByRole("button", { name: "Lenguaje" }).click();
    await page.getByRole("button", { name: "Ciencias Naturales" }).click();
    await page.getByRole("button", { name: "Siguiente" }).click();

    // Step 3: duración
    await page.getByText("1").first().click();
    await page.getByRole("button", { name: "Siguiente" }).click();

    // Step 4: tema + generar
    await page
      .getByPlaceholder("Cuéntale al proyecto sobre tu vereda…")
      .fill("el agua de la quebrada");
    await page.getByRole("button", { name: "Generar proyecto" }).click();

    // Generating overlay visible
    await expect(page.getByText(/Eligiendo DBAs/)).toBeVisible();

    // Canned mock should resolve within a few seconds → navigate to project view
    await page.waitForURL(/\/proyectos\/[0-9a-f-]{36}$/, { timeout: 20_000 });

    // Project view renders
    await expect(page.getByText(/Pregunta guía/)).toBeVisible();
    await expect(page.getByText(/Plan por fases/)).toBeVisible();
  });
});
