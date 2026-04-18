import { test, expect } from "@playwright/test";

test.describe.skip("mobile backgrounding — needs auth session + Anthropic mock (see README.md)", () => {
  test("generation completes server-side while client is disconnected", async ({
    page,
    context,
  }) => {
    // PRECONDITION: logged-in teacher + PLAYWRIGHT_MODE=1 with a slow canned
    // response (e.g. 10s delay) so we have time to simulate backgrounding.
    await page.goto("/proyectos/nuevo");
    // ... complete steps 1-4 (see wizard-happy-path.spec.ts)

    await page.getByRole("button", { name: "Generar proyecto" }).click();

    // Wait for the initial 202 → generation is queued server-side
    await expect(page.getByText(/Eligiendo DBAs/)).toBeVisible();

    // Simulate backgrounding: go offline for 15 seconds
    await context.setOffline(true);
    await page.waitForTimeout(15_000);
    await context.setOffline(false);

    // Polling resumes; the project lands once the mock finishes
    await page.waitForURL(/\/proyectos\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    await expect(page.getByText(/Pregunta guía/)).toBeVisible();
  });
});
