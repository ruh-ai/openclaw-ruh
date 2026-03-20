import { test, expect } from '@playwright/test';

test.describe('Agent Creation', () => {
  test('chat input is visible on create page', async ({ page }) => {
    await page.goto('/agents/create');
    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible();
  });

  test('can type a message in chat input', async ({ page }) => {
    await page.goto('/agents/create');
    const textarea = page.locator('textarea');
    await textarea.fill('Build me an email outreach agent');
    await expect(textarea).toHaveValue('Build me an email outreach agent');
  });

  test('send button is visible', async ({ page }) => {
    await page.goto('/agents/create');
    // Send button should exist in the chat input area
    const sendButton = page.locator('button[type="submit"], button:has(svg)').last();
    await expect(sendButton).toBeVisible();
  });
});
