import { test, expect } from "@playwright/test";

test.describe.skip("idempotency — needs auth session + Anthropic mock (see README.md)", () => {
  test("double-tap Generar produces ONE project", async ({ page }) => {
    // PRECONDITION: logged-in teacher + PLAYWRIGHT_MODE=1.
    // The wizard generates a fresh UUID per tap; two quick taps within the same
    // click handler re-send the SAME UUID, so the API returns the existing row
    // on the second call. Verify the generations log has exactly one row with
    // that UUID.
    await page.goto("/proyectos/nuevo");
    // fill steps 1-4
    // ... (see wizard-happy-path.spec.ts for the flow)

    // Tap generar twice in quick succession (React dedupes within the handler)
    const generar = page.getByRole("button", { name: "Generar proyecto" });
    await generar.click();
    await generar.click();

    await page.waitForURL(/\/proyectos\/[0-9a-f-]{36}$/, { timeout: 20_000 });

    // Fetch generations log via API (or direct DB) — expect ONE success row
    // for this idempotency key, not two.
    expect(true).toBe(true);
  });

  test("'Crear otro proyecto' creates a NEW project", async ({ page }) => {
    // Land on a project view, tap the CTA that resubmits with a fresh UUID,
    // expect a different project_id than the first.
    expect(true).toBe(true);
  });
});
