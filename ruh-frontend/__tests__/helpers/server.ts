import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import {
  makeSandbox,
  makeConversation,
  makeCronJob,
  makeChannelsConfig,
  makeAgentRecord,
  makeCustomerSession,
  makeInstalledMarketplaceListing,
  SANDBOX_ID,
  CONV_ID,
} from './fixtures';

const BASE = 'http://localhost:8000';

export const handlers = [
  http.get(`${BASE}/api/auth/me`, () =>
    HttpResponse.json(makeCustomerSession()),
  ),

  http.get(`${BASE}/api/marketplace/my/installed-listings`, () =>
    HttpResponse.json({ items: [makeInstalledMarketplaceListing()] }),
  ),

  http.get(`${BASE}/api/agents/:agent_id`, () =>
    HttpResponse.json(makeAgentRecord()),
  ),

  http.post(`${BASE}/api/agents/:agent_id/launch`, () =>
    HttpResponse.json({
      launched: false,
      sandboxId: SANDBOX_ID,
      agent: makeAgentRecord(),
    }),
  ),

  // ── Sandboxes ────────────────────────────────────────────────────────────────

  http.get(`${BASE}/api/sandboxes`, () =>
    HttpResponse.json([makeSandbox(), makeSandbox({ sandbox_id: 'sb-002', sandbox_name: 'second-sandbox', approved: false })]),
  ),

  http.delete(`${BASE}/api/sandboxes/:sandbox_id`, () =>
    HttpResponse.json({ deleted: SANDBOX_ID }),
  ),

  http.post(`${BASE}/api/sandboxes/create`, () =>
    HttpResponse.json({ stream_id: 'test-stream-123' }),
  ),

  // ── Conversations ─────────────────────────────────────────────────────────────

  http.get(`${BASE}/api/sandboxes/:sandbox_id/conversations`, () =>
    HttpResponse.json({
      items: [makeConversation()],
      next_cursor: null,
      has_more: false,
    }),
  ),

  http.post(`${BASE}/api/sandboxes/:sandbox_id/conversations`, async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    return HttpResponse.json(makeConversation({ name: body['name'] as string ?? 'New Conversation' }));
  }),

  http.delete(`${BASE}/api/sandboxes/:sandbox_id/conversations/:conv_id`, () =>
    HttpResponse.json({ deleted: CONV_ID }),
  ),

  http.patch(`${BASE}/api/sandboxes/:sandbox_id/conversations/:conv_id`, () =>
    HttpResponse.json({ ok: true }),
  ),

  http.get(`${BASE}/api/sandboxes/:sandbox_id/conversations/:conv_id/messages`, () =>
    HttpResponse.json({
      messages: [
        { id: 1, role: 'user', content: 'Hello', created_at: new Date('2025-01-15T10:05:01Z').toISOString() },
        { id: 2, role: 'assistant', content: 'Hi there!', created_at: new Date('2025-01-15T10:05:02Z').toISOString() },
      ],
      next_cursor: null,
      has_more: false,
    }),
  ),

  http.post(`${BASE}/api/sandboxes/:sandbox_id/conversations/:conv_id/messages`, () =>
    HttpResponse.json({ ok: true }),
  ),

  // ── Chat ──────────────────────────────────────────────────────────────────────

  http.post(`${BASE}/api/sandboxes/:sandbox_id/chat`, () =>
    HttpResponse.json({
      id: 'chatcmpl-001',
      object: 'chat.completion',
      created: 1700000000,
      model: 'openclaw-default',
      choices: [{ index: 0, message: { role: 'assistant', content: 'Hello!' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
    }),
  ),

  http.get(`${BASE}/api/sandboxes/:sandbox_id/models`, () =>
    HttpResponse.json({
      object: 'list',
      data: [
        { id: 'openclaw-default', object: 'model', created: 0, owned_by: 'openclaw' },
        { id: 'gpt-4o', object: 'model', created: 0, owned_by: 'openai' },
      ],
    }),
  ),

  http.get(`${BASE}/api/sandboxes/:sandbox_id/status`, () =>
    HttpResponse.json({ status: 'running', models: 2 }),
  ),

  // ── Crons ─────────────────────────────────────────────────────────────────────

  http.get(`${BASE}/api/sandboxes/:sandbox_id/crons`, () =>
    HttpResponse.json({ jobs: [makeCronJob()] }),
  ),

  http.post(`${BASE}/api/sandboxes/:sandbox_id/crons`, async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    return HttpResponse.json(makeCronJob({ name: body['name'] as string }));
  }),

  http.patch(`${BASE}/api/sandboxes/:sandbox_id/crons/:job_id`, () =>
    HttpResponse.json({ ok: true, jobId: 'cron-job-001' }),
  ),

  http.delete(`${BASE}/api/sandboxes/:sandbox_id/crons/:job_id`, () =>
    HttpResponse.json({ deleted: 'cron-job-001' }),
  ),

  http.post(`${BASE}/api/sandboxes/:sandbox_id/crons/:job_id/toggle`, () =>
    HttpResponse.json({ jobId: 'cron-job-001', enabled: false }),
  ),

  http.post(`${BASE}/api/sandboxes/:sandbox_id/crons/:job_id/run`, () =>
    HttpResponse.json({ ok: true, jobId: 'cron-job-001' }),
  ),

  http.get(`${BASE}/api/sandboxes/:sandbox_id/crons/:job_id/runs`, () =>
    HttpResponse.json({ entries: [
      { id: 'run-001', jobId: 'cron-job-001', startedAtMs: Date.now() - 3600000, finishedAtMs: Date.now() - 3599000, status: 'ok' },
    ]}),
  ),

  // ── Channels ──────────────────────────────────────────────────────────────────

  http.get(`${BASE}/api/sandboxes/:sandbox_id/channels`, () =>
    HttpResponse.json(makeChannelsConfig()),
  ),

  http.put(`${BASE}/api/sandboxes/:sandbox_id/channels/telegram`, () =>
    HttpResponse.json({ ok: true, logs: ['✓ enabled=true', '✓ Gateway restarted'] }),
  ),

  http.put(`${BASE}/api/sandboxes/:sandbox_id/channels/slack`, () =>
    HttpResponse.json({ ok: true, logs: ['✓ enabled=true', '✓ Gateway restarted'] }),
  ),

  http.get(`${BASE}/api/sandboxes/:sandbox_id/channels/:channel/status`, () =>
    HttpResponse.json({ ok: true, channel: 'telegram', output: 'Connected' }),
  ),

  http.get(`${BASE}/api/sandboxes/:sandbox_id/channels/:channel/pairing`, () =>
    HttpResponse.json({ ok: true, codes: ['ABC12345'], output: 'Pending: ABC12345' }),
  ),

  http.post(`${BASE}/api/sandboxes/:sandbox_id/channels/:channel/pairing/approve`, () =>
    HttpResponse.json({ ok: true, code: 'ABC12345', output: 'Approved' }),
  ),
];

export const server = setupServer(...handlers);
