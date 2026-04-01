/**
 * Regression coverage for retiring the legacy Guided create flow.
 *
 * The supported new-agent entry contract is now Co-Pilot or Advanced only.
 * Guided must not remain reachable from `/agents/create`.
 */

import { test, expect, Page, Route } from "@playwright/test";

const API_BASE = "http://localhost:8000";

async function mockAgentsApi(page: Page) {
  const saved: Record<string, unknown>[] = [];

  await page.route(`${API_BASE}/api/agents`, async (route: Route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(saved) });
      return;
    }

    await route.continue();
  });

  await page.route(`${API_BASE}/api/sandboxes`, async (route: Route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
}

async function goToCreatePage(page: Page) {
  await page.goto("/agents/create");
  await expect(page.getByRole("button", { name: /Co-Pilot/i })).toBeVisible({ timeout: 15_000 });
}

test.describe("Create Agent guided-mode retirement", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem("openclaw-agents"));
  });

  test("defaults new-agent creation to the supported Co-Pilot contract", async ({ page }) => {
    await mockAgentsApi(page);
    await goToCreatePage(page);

    await expect(page.getByRole("button", { name: /Guided/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Co-Pilot/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Advanced/i })).toBeVisible();
    await expect(page.locator("textarea")).toBeVisible();
  });

  test("does not let operators switch back into the retired Guided flow", async ({ page }) => {
    await mockAgentsApi(page);
    await goToCreatePage(page);

    await page.getByRole("button", { name: /Advanced/i }).click();
    await expect(page.locator("textarea")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: /Guided/i })).toHaveCount(0);
  });
});
