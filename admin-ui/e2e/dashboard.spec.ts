import { test, expect } from "@playwright/test";

test.describe("Admin Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    // Seed a fake token in localStorage to bypass login
    await page.goto("/login");
    await page.evaluate(() => {
      localStorage.setItem("accessToken", "test-admin-token");
    });
  });

  test("dashboard page renders stat cards", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByText("Dashboard")).toBeVisible();
    await expect(page.getByText("TOTAL USERS")).toBeVisible();
    await expect(page.getByText("TOTAL AGENTS")).toBeVisible();
    await expect(page.getByText("ACTIVE SANDBOXES")).toBeVisible();
    await expect(page.getByText("MARKETPLACE")).toBeVisible();
  });

  test("sidebar navigation works", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("link", { name: "Users" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Agents" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Marketplace" })).toBeVisible();
    await expect(page.getByRole("link", { name: "System" })).toBeVisible();
  });

  test("navigate to users page", async ({ page }) => {
    await page.goto("/dashboard");
    await page.click('a[href="/users"]');
    await expect(page.getByText("Users")).toBeVisible();
    await expect(page.getByPlaceholder("Search by email or name...")).toBeVisible();
  });

  test("navigate to system page", async ({ page }) => {
    await page.goto("/dashboard");
    await page.click('a[href="/system"]');
    await expect(page.getByText("System Health")).toBeVisible();
  });
});
