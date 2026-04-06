import { test, expect } from '@playwright/test';
import { setupAuth } from './helpers/auth';

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuth(page);
  });

  test('page loads successfully', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Ruh/i);
  });

  test('sidebar navigation is visible', async ({ page }) => {
    await page.goto('/');
    // The sidebar uses nav buttons (Overview, Agents, Tools, Activity) rather than aside/complementary role.
    // Use exact: true to avoid matching "Open Next.js Dev Tools" which also contains "Tools".
    await expect(page.getByRole('button', { name: 'Overview', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Agents', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tools', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Activity', exact: true })).toBeVisible();
  });

  test('can navigate to agent creation page', async ({ page }) => {
    await page.goto('/agents/create');
    await expect(page.getByText('Who are you bringing to life?')).toBeVisible();
    await expect(page.getByRole('button', { name: /Bring to life/i })).toBeDisabled();
  });
});
