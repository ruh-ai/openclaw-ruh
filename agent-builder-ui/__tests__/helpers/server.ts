import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { makeAgent, makeChatMessage, makeSkillGraph, makeUser } from './fixtures';

const BASE = 'http://localhost:3000';

export const handlers = [
  // ── Auth ────────────────────────────────────────────────────────────────────

  http.get(`${BASE}/api/auth/session`, () =>
    HttpResponse.json({ user: makeUser(), isAuthenticated: true }),
  ),

  // ── Agents ──────────────────────────────────────────────────────────────────

  http.get(`${BASE}/api/agents`, () =>
    HttpResponse.json([makeAgent()]),
  ),

  http.post(`${BASE}/api/agents`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(makeAgent({ name: body['name'] as string }));
  }),

  http.get(`${BASE}/api/agents/:agentId`, () =>
    HttpResponse.json(makeAgent()),
  ),

  // ── Chat (OpenClaw gateway proxy) ───────────────────────────────────────────

  http.post(`${BASE}/api/openclaw`, () =>
    HttpResponse.json({
      messages: [
        makeChatMessage({ role: 'assistant', content: 'I will help you create an agent.' }),
      ],
      skillGraph: makeSkillGraph(),
    }),
  ),

  // ── Skill Graph ─────────────────────────────────────────────────────────────

  http.get(`${BASE}/api/agents/:agentId/skills`, () =>
    HttpResponse.json(makeSkillGraph()),
  ),
];

export const server = setupServer(...handlers);
