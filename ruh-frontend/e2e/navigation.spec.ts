/**
 * E2E tests: basic navigation and layout.
 * Requires the Next.js dev/prod server to be running (configured via webServer in playwright.config.ts).
 * API calls are intercepted with route mocking so no real backend is needed.
 */

import { test, expect } from '@playwright/test';

const MOCK_SANDBOXES = [
  {
    sandbox_id: 'sb-e2e-001',
    sandbox_name: 'openclaw-gateway',
    sandbox_state: 'started',
    dashboard_url: 'https://preview.daytona.io/sb-e2e-001',
    preview_token: null,
    gateway_token: 'gw-tok',
    gateway_port: 18789,
    ssh_command: 'daytona ssh sb-e2e-001',
    created_at: new Date().toISOString(),
    approved: true,
  },
];

test.beforeEach(async ({ page }) => {
  // Mock all API calls
  await page.route('**/api/sandboxes', (route) => {
    if (route.request().method() === 'GET') {
      route.fulfill({ json: MOCK_SANDBOXES });
    } else {
      route.continue();
    }
  });

  await page.route('**/api/sandboxes/*/conversations', (route) => {
    route.fulfill({ json: [] });
  });

  await page.route('**/api/sandboxes/*/models', (route) => {
    route.fulfill({ json: { object: 'list', data: [{ id: 'openclaw-default', object: 'model', created: 0, owned_by: 'openclaw' }] } });
  });

  await page.route('**/api/sandboxes/*/status', (route) => {
    route.fulfill({ json: { status: 'running' } });
  });
});

test.describe('layout', () => {
  test('page has correct title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/OpenClaw on Daytona/i);
  });

  test('sidebar "Sandboxes" heading is visible', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Sandboxes')).toBeVisible();
  });

  test('app title "OpenClaw on Daytona" is in header', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('OpenClaw on Daytona')).toBeVisible();
  });

  test('sidebar shows sandbox from API', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('openclaw-gateway')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('sandbox selection', () => {
  test('clicking sandbox shows Chat/Crons/Channels tabs', async ({ page }) => {
    await page.goto('/');
    await page.getByText('openclaw-gateway').click();

    await expect(page.getByRole('button', { name: 'Chat' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Crons' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Channels' })).toBeVisible();
  });

  test('Crons tab shows CronsPanel', async ({ page }) => {
    await page.route('**/api/sandboxes/sb-e2e-001/crons', (route) => {
      route.fulfill({ json: { jobs: [] } });
    });

    await page.goto('/');
    await page.getByText('openclaw-gateway').click();
    await page.getByRole('button', { name: 'Crons' }).click();

    // CronsPanel renders (shows empty or loading state)
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('Channels tab shows ChannelsPanel', async ({ page }) => {
    await page.route('**/api/sandboxes/sb-e2e-001/channels', (route) => {
      route.fulfill({ json: {
        telegram: { enabled: false, botToken: '', dmPolicy: 'pairing' },
        slack: { enabled: false, mode: 'socket', appToken: '', botToken: '', signingSecret: '', dmPolicy: 'pairing' },
      }});
    });

    await page.goto('/');
    await page.getByText('openclaw-gateway').click();
    await page.getByRole('button', { name: 'Channels' }).click();

    await expect(page.getByText(/telegram/i)).toBeVisible({ timeout: 3000 });
  });
});

test.describe('create sandbox flow', () => {
  test('clicking "+ New" shows SandboxForm', async ({ page }) => {
    await page.goto('/');
    await page.getByText('+ New').click();
    await expect(page.getByText('New Sandbox')).toBeVisible();
  });

  test('SandboxForm has name input with default value', async ({ page }) => {
    await page.goto('/');
    await page.getByText('+ New').click();
    const input = page.getByRole('textbox');
    await expect(input).toHaveValue('openclaw-gateway');
  });

  test('cancel returns from create view', async ({ page }) => {
    await page.goto('/');
    await page.getByText('+ New').click();
    await expect(page.getByText('New Sandbox')).toBeVisible();

    await page.getByText('✕ Cancel').click();
    await expect(page.getByText('New Sandbox')).not.toBeVisible();
  });

  test('submit button calls POST /api/sandboxes/create', async ({ page }) => {
    let createCalled = false;
    await page.route('**/api/sandboxes/create', (route) => {
      createCalled = true;
      route.fulfill({ json: { stream_id: 'e2e-stream-001' } });
    });

    await page.goto('/');
    await page.getByText('+ New').click();
    await page.getByRole('button', { name: /create sandbox/i }).click();

    await expect(async () => expect(createCalled).toBe(true)).toPass({ timeout: 3000 });
  });
});

test.describe('keyboard interactions', () => {
  test('form submits with Enter key', async ({ page }) => {
    let createCalled = false;
    await page.route('**/api/sandboxes/create', (route) => {
      createCalled = true;
      route.fulfill({ json: { stream_id: 'kb-stream-001' } });
    });

    await page.goto('/');
    await page.getByText('+ New').click();
    await page.getByRole('textbox').press('Enter');

    await expect(async () => expect(createCalled).toBe(true)).toPass({ timeout: 3000 });
  });
});
