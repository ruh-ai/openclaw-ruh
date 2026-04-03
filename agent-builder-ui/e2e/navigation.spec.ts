import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test('page loads successfully', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Ruh/i);
  });

  test('sidebar navigation is visible', async ({ page }) => {
    await page.goto('/');
    const sidebar = page.locator('[role="complementary"]');
    await expect(sidebar).toBeVisible();
  });

  test('can navigate to agent creation page', async ({ page }) => {
    await page.goto('/agents/create');
    // Chat input should be visible on the create page
    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible();
  });
});
