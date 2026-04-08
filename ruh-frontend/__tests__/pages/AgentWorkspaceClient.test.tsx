import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';

import { AgentWorkspaceClient } from '@/app/agents/[agentId]/AgentWorkspaceClient';
import AgentWorkspacePage from '@/app/agents/[agentId]/page';

import { makeAgentRecord, makeSandbox } from '../helpers/fixtures';
import { server } from '../helpers/server';

const BASE = 'http://localhost:8000';

jest.mock('@/components/ChatPanel', () => ({
  __esModule: true,
  default: ({ sandbox }: { sandbox: { sandbox_name: string } }) => (
    <div>Chat panel for {sandbox.sandbox_name}</div>
  ),
}));

jest.mock('@/components/HistoryPanel', () => ({
  __esModule: true,
  default: () => <div>History panel</div>,
}));

jest.mock('@/components/MissionControlPanel', () => ({
  __esModule: true,
  default: () => <div>Mission control panel</div>,
}));

describe('AgentWorkspaceClient', () => {
  test('launches the agent runtime and renders the dedicated workspace tabs', async () => {
    let launchCalls = 0;

    server.use(
      http.post(`${BASE}/api/agents/agent-runtime-001/launch`, () => {
        launchCalls += 1;
        return HttpResponse.json({
          launched: true,
          sandboxId: 'sb-test-001',
          agent: makeAgentRecord(),
        });
      }),
      http.get(`${BASE}/api/sandboxes`, () => HttpResponse.json([makeSandbox()])),
    );

    render(<AgentWorkspaceClient agentId="agent-runtime-001" />);

    expect(
      await screen.findByRole('heading', { name: /sarah assistant/i }),
    ).toBeInTheDocument();
    expect(launchCalls).toBe(1);
    expect(screen.getByText('Chat panel for openclaw-gateway')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'History' }));
    expect(screen.getByText('History panel')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Mission Control' }));
    expect(screen.getByText('Mission control panel')).toBeInTheDocument();
  });

  test('shows an error state when launch fails', async () => {
    server.use(
      http.post(`${BASE}/api/agents/agent-runtime-001/launch`, () =>
        HttpResponse.json({ detail: 'Agent not found' }, { status: 404 }),
      ),
    );

    render(<AgentWorkspaceClient agentId="agent-runtime-001" />);

    await waitFor(() => {
      expect(screen.getByText('Could not open this workspace')).toBeInTheDocument();
      expect(screen.getByText('Agent not found')).toBeInTheDocument();
    });
  });
});

describe('AgentWorkspacePage (page wrapper)', () => {
  test('renders AgentWorkspaceClient via the page wrapper', () => {
    // Just verify the wrapper renders without throwing
    const { container } = render(
      <AgentWorkspacePage params={{ agentId: 'agent-runtime-001' }} />,
    );
    expect(container).toBeTruthy();
  });
});
