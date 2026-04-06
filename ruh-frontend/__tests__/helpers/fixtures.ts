import type { SandboxRecord } from '@/components/SandboxSidebar';

export const SANDBOX_ID = 'sb-test-001';
export const CONV_ID = 'conv-test-001';
export const AGENT_ID = 'agent-runtime-001';
export const LISTING_ID = 'listing-sarah-001';

export function makeSandbox(overrides: Partial<SandboxRecord> = {}): SandboxRecord {
  return {
    sandbox_id: SANDBOX_ID,
    sandbox_name: 'openclaw-gateway',
    sandbox_state: 'started',
    dashboard_url: 'https://preview.daytona.io/sb-test-001',
    preview_token: 'prev-tok-abc',
    gateway_token: 'gw-tok-xyz',
    gateway_port: 18789,
    ssh_command: `daytona ssh ${SANDBOX_ID}`,
    created_at: new Date('2025-01-15T10:00:00Z').toISOString(),
    approved: true,
    ...overrides,
  };
}

export function makeConversation(overrides: Record<string, unknown> = {}) {
  return {
    id: CONV_ID,
    sandbox_id: SANDBOX_ID,
    name: 'New Conversation',
    model: 'openclaw-default',
    openclaw_session_key: `agent:main:${CONV_ID}`,
    created_at: new Date('2025-01-15T10:05:00Z').toISOString(),
    updated_at: new Date('2025-01-15T10:05:00Z').toISOString(),
    message_count: 0,
    ...overrides,
  };
}

export function makeCronJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cron-job-001',
    name: 'Daily Report',
    enabled: true,
    schedule: { kind: 'cron', expr: '0 9 * * *', tz: 'UTC' },
    sessionTarget: 'main',
    payload: { kind: 'agentTurn', message: 'Generate daily report' },
    deleteAfterRun: false,
    state: { lastRunAtMs: Date.now() - 86400000, nextRunAtMs: Date.now() + 3600000, status: 'ok' },
    ...overrides,
  };
}

export function makeChannelsConfig(overrides: Record<string, unknown> = {}) {
  return {
    telegram: {
      enabled: false,
      botToken: '',
      dmPolicy: 'pairing',
    },
    slack: {
      enabled: false,
      mode: 'socket',
      appToken: '',
      botToken: '',
      signingSecret: '',
      dmPolicy: 'pairing',
    },
    ...overrides,
  };
}

export function makeCustomerSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    email: 'customer@ruh.ai',
    displayName: 'Ruh Customer',
    appAccess: { admin: false, builder: false, customer: true },
    activeOrganization: {
      id: 'org-customer-1',
      name: 'Acme Customer Org',
      slug: 'acme-customer',
      kind: 'customer',
      plan: 'growth',
    },
    memberships: [
      {
        organizationId: 'org-customer-1',
        organizationName: 'Acme Customer Org',
        organizationSlug: 'acme-customer',
        organizationKind: 'customer',
        role: 'owner',
      },
    ],
    ...overrides,
  };
}

export function makeAgentRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: AGENT_ID,
    name: 'Sarah Assistant',
    description: 'Warm executive operator for meetings, follow-ups, and operational coordination.',
    status: 'active',
    sandbox_ids: [SANDBOX_ID],
    ...overrides,
  };
}

export function makeInstalledListing(overrides: Record<string, unknown> = {}) {
  return {
    installId: 'install-001',
    listingId: LISTING_ID,
    agentId: AGENT_ID,
    installedVersion: '1.2.0',
    installedAt: new Date('2026-04-01T12:00:00Z').toISOString(),
    listing: {
      id: LISTING_ID,
      title: 'Sarah Assistant',
      slug: 'sarah-assistant-d15e3c9d',
      summary: 'Warm, polished executive assistant for calendar and operations.',
      category: 'operations',
      iconUrl: null,
      installCount: 241,
      avgRating: 4.9,
    },
    ...overrides,
  };
}

export const MOCK_CHAT_RESPONSE = {
  id: 'chatcmpl-test-001',
  object: 'chat.completion',
  created: 1700000000,
  model: 'openclaw-default',
  choices: [{
    index: 0,
    message: { role: 'assistant', content: 'Hello! How can I help you?' },
    finish_reason: 'stop',
  }],
  usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18 },
};

export function makeMarketplaceListing(overrides: Record<string, unknown> = {}) {
  return {
    id: 'listing-sarah',
    agentId: 'agent-sarah',
    publisherId: 'publisher-1',
    ownerOrgId: 'org-1',
    title: 'Sarah Assistant',
    slug: 'sarah-assistant',
    summary: 'Warm, polished executive assistant for calendar and operations.',
    description:
      'Sarah keeps an organization running by coordinating meetings, following up on action items, and handling operational admin work with a human tone.',
    category: 'operations',
    tags: ['assistant', 'operations'],
    iconUrl: null,
    screenshots: [],
    version: '1.2.0',
    status: 'published',
    reviewNotes: null,
    reviewedBy: null,
    reviewedAt: null,
    installCount: 241,
    avgRating: 4.9,
    publishedAt: '2026-03-31T10:00:00.000Z',
    createdAt: '2026-03-30T10:00:00.000Z',
    updatedAt: '2026-03-31T10:00:00.000Z',
    ...overrides,
  };
}

export function makeInstalledMarketplaceListing(overrides: Record<string, unknown> = {}) {
  const listingOverrides = (overrides.listing as Record<string, unknown> | undefined) ?? {};

  return {
    installId: 'install-sarah',
    listingId: 'listing-sarah',
    orgId: 'org-customer-1',
    userId: 'user-customer-1',
    agentId: 'agent-installed-sarah',
    sourceAgentVersionId: 'agent-version-sarah',
    installedVersion: '1.2.0',
    installedAt: '2026-04-01T08:30:00.000Z',
    lastLaunchedAt: '2026-04-02T09:45:00.000Z',
    listing: makeMarketplaceListing(listingOverrides),
    ...overrides,
  };
}
