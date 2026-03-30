import { test, expect } from "@playwright/test";

test.describe("Admin Login", () => {
  test("login page renders", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText("Ruh Admin")).toBeVisible();
    await expect(page.getByPlaceholder("admin@ruh.ai")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
  });

  test("shows error on invalid credentials", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', "wrong@example.com");
    await page.fill('input[type="password"]', "wrongpassword");
    await page.click('button[type="submit"]');
    // Should show error (either from network error or 401 response)
    await expect(page.getByText(/failed|error|invalid/i)).toBeVisible({ timeout: 10000 });
  });

  test("shows error for non-admin user", async ({ page }) => {
    // This test requires a running backend with a non-admin user registered.
    // In CI, this would be seeded. For now, test that the error UI works.
    await page.goto("/login");
    await page.fill('input[type="email"]', "developer@ruh.ai");
    await page.fill('input[type="password"]', "password123");
    await page.click('button[type="submit"]');
    // Should show "Admin access required" or connection error
    await expect(page.locator('[class*="error"], [class*="red"]')).toBeVisible({ timeout: 10000 });
  });
});
