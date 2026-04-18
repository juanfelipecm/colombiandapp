import { test, expect } from "@playwright/test";

test.describe.skip("admin 404 — needs auth session for non-admin teacher (see README.md)", () => {
  test("authenticated non-admin hitting /admin/generation-logs sees 404", async ({ page }) => {
    // PRECONDITION: logged-in as a teacher whose UUID is NOT in ADMIN_TEACHER_IDS.
    // Middleware passes them through (they're authenticated); `requireAdmin()`
    // calls `notFound()` which renders the project's 404 page.
    await page.goto("/admin/generation-logs");
    // Next.js renders a 404 page with specific chrome — check for the status:
    // We can assert against response status via request interception:
    const response = await page.waitForResponse((r) =>
      r.url().endsWith("/admin/generation-logs"),
    );
    expect(response.status()).toBe(404);
  });

  test("authenticated admin sees the log page", async ({ page }) => {
    // PRECONDITION: logged-in admin teacher (UUID in ADMIN_TEACHER_IDS).
    await page.goto("/admin/generation-logs");
    await expect(page.getByText(/Generation logs/)).toBeVisible();
  });
});
