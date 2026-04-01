export const AGENT_ID = 'agent-001';

export function makeAgent(overrides: Record<string, unknown> = {}) {
  return {
    id: AGENT_ID,
    name: 'Test Agent',
    description: 'A test agent',
    status: 'draft',
    skills: [],
    tools: [],
    triggers: [],
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

export function makeChatMessage(overrides: Record<string, unknown> = {}) {
  return {
    role: 'assistant',
    content: 'Hello! I can help you build an agent.',
    ...overrides,
  };
}

export function makeSkillGraph(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Test Agent',
    skills: [
      { name: 'Email Outreach', description: 'Send emails to prospects' },
      { name: 'Lead Scoring', description: 'Score and rank leads' },
    ],
    tools: ['Gmail', 'CRM'],
    ...overrides,
  };
}

export function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-001',
    email: 'test@example.com',
    name: 'Test User',
    avatar: null,
    ...overrides,
  };
}
