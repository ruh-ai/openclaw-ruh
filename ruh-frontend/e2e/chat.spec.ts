/**
 * E2E tests: chat panel interactions.
 */

import { test, expect } from '@playwright/test';

const SANDBOX = {
  sandbox_id: 'sb-chat-001',
  sandbox_name: 'chat-sandbox',
  sandbox_state: 'started',
  dashboard_url: 'https://preview.daytona.io/sb-chat-001',
  preview_token: null,
  gateway_token: 'gw-chat-tok',
  gateway_port: 18789,
  ssh_command: 'daytona ssh sb-chat-001',
  created_at: new Date().toISOString(),
  approved: true,
};

const CONV = {
  id: 'conv-e2e-001',
  sandbox_id: 'sb-chat-001',
  name: 'Test Chat',
  model: 'openclaw-default',
  openclaw_session_key: 'agent:main:conv-e2e-001',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  message_count: 2,
};

test.beforeEach(async ({ page }) => {
  await page.route('**/api/sandboxes', (route) => {
    if (route.request().method() === 'GET') route.fulfill({ json: [SANDBOX] });
    else route.continue();
  });

  await page.route('**/api/sandboxes/sb-chat-001/conversations', (route) => {
    if (route.request().method() === 'GET') route.fulfill({ json: [CONV] });
    else route.fulfill({ json: { ...CONV, id: 'conv-new' } });
  });

  await page.route('**/api/sandboxes/sb-chat-001/conversations/*/messages', (route) => {
    if (route.request().method() === 'GET') {
      route.fulfill({ json: [
        { role: 'user', content: 'Hello from E2E' },
        { role: 'assistant', content: 'E2E response here' },
      ]});
    } else {
      route.fulfill({ json: { ok: true } });
    }
  });

  await page.route('**/api/sandboxes/sb-chat-001/models', (route) => {
    route.fulfill({ json: {
      object: 'list',
      data: [{ id: 'openclaw-default', object: 'model', created: 0, owned_by: 'openclaw' }],
    }});
  });

  await page.route('**/api/sandboxes/sb-chat-001/status', (route) => {
    route.fulfill({ json: { status: 'running' } });
  });

  await page.route('**/api/sandboxes/sb-chat-001/chat', (route) => {
    route.fulfill({ json: {
      id: 'chatcmpl-e2e',
      object: 'chat.completion',
      created: 1700000000,
      model: 'openclaw-default',
      choices: [{ index: 0, message: { role: 'assistant', content: 'E2E AI reply' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 5, completion_tokens: 4, total_tokens: 9 },
    }});
  });
});

test.describe('chat panel', () => {
  test('shows conversation in sidebar after selecting sandbox', async ({ page }) => {
    await page.goto('/');
    await page.getByText('chat-sandbox').click();
    await expect(page.getByText('Test Chat')).toBeVisible({ timeout: 5000 });
  });

  test('clicking conversation loads its messages', async ({ page }) => {
    await page.goto('/');
    await page.getByText('chat-sandbox').click();
    await page.getByText('Test Chat').click();

    await expect(page.getByText('Hello from E2E')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('E2E response here')).toBeVisible();
  });

  test('can type and send a message', async ({ page }) => {
    let chatCalled = false;
    await page.route('**/api/sandboxes/sb-chat-001/chat', (route) => {
      chatCalled = true;
      route.fulfill({ json: {
        id: 'chatcmpl-send',
        object: 'chat.completion',
        created: 1700000000,
        model: 'openclaw-default',
        choices: [{ index: 0, message: { role: 'assistant', content: 'Response!' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
      }});
    });

    await page.goto('/');
    await page.getByText('chat-sandbox').click();
    await page.getByText('Test Chat').click();

    // Wait for chat view to load
    await expect(page.getByRole('textbox')).toBeVisible({ timeout: 5000 });
    await page.getByRole('textbox').fill('Hello, world!');
    await page.getByRole('button', { name: /send/i }).click();

    await expect(async () => expect(chatCalled).toBe(true)).toPass({ timeout: 3000 });
  });

  test('can create a new conversation', async ({ page }) => {
    let createCalled = false;
    await page.route('**/api/sandboxes/sb-chat-001/conversations', (route) => {
      if (route.request().method() === 'POST') {
        createCalled = true;
        route.fulfill({ json: { ...CONV, id: 'conv-created', name: 'New Conversation' } });
      } else {
        route.fulfill({ json: [CONV] });
      }
    });

    await page.goto('/');
    await page.getByText('chat-sandbox').click();
    await expect(page.getByText('Test Chat')).toBeVisible({ timeout: 5000 });

    // Find the "New" button in conversation list
    const newBtn = page.getByRole('button', { name: /new/i }).first();
    await newBtn.click();

    await expect(async () => expect(createCalled).toBe(true)).toPass({ timeout: 3000 });
  });
});
