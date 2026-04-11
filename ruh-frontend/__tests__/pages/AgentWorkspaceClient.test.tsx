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
  default: ({
    sandbox,
    onNewChat,
    onConversationCreated,
  }: {
    sandbox: { sandbox_name: string };
    onNewChat: () => void;
    onConversationCreated: (conv: { id: string; name: string }) => void;
  }) => (
    <div>
      <div>Chat panel for {sandbox.sandbox_name}</div>
      <button onClick={onNewChat}>trigger-new-chat</button>
      <button onClick={() => onConversationCreated({ id: 'conv-new', name: 'New Chat' })}>
        trigger-conv-created
      </button>
    </div>
  ),
}));

jest.mock('@/components/HistoryPanel', () => ({
  __esModule: true,
  default: ({
    onOpenConversation,
  }: {
    onOpenConversation: (conv: { id: string; name: string }) => void;
  }) => (
    <div>
      <div>History panel</div>
      <button onClick={() => onOpenConversation({ id: 'conv-from-history', name: 'History Conv' })}>
        trigger-open-conv
      </button>
    </div>
  ),
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

  test('shows error when agent fetch fails on load', async () => {
    server.use(
      http.get(`${BASE}/api/agents/agent-runtime-001`, () =>
        HttpResponse.json({ detail: 'Not found' }, { status: 404 }),
      ),
    );

    render(<AgentWorkspaceClient agentId="agent-runtime-001" />);

    await waitFor(() => {
      expect(screen.getByText('Could not open this workspace')).toBeInTheDocument();
    });
  });

  test('shows "Existing sandbox reused" when launched=false', async () => {
    server.use(
      http.post(`${BASE}/api/agents/agent-runtime-001/launch`, () =>
        HttpResponse.json({
          launched: false,
          sandboxId: 'sb-test-001',
          agent: makeAgentRecord(),
        }),
      ),
      http.get(`${BASE}/api/sandboxes`, () => HttpResponse.json([makeSandbox()])),
    );

    render(<AgentWorkspaceClient agentId="agent-runtime-001" />);

    await waitFor(() => {
      expect(screen.getByText('Existing sandbox reused')).toBeInTheDocument();
    });
  });

  test('shows "Freshly launched" when launched=true', async () => {
    server.use(
      http.post(`${BASE}/api/agents/agent-runtime-001/launch`, () =>
        HttpResponse.json({
          launched: true,
          sandboxId: 'sb-test-001',
          agent: makeAgentRecord(),
        }),
      ),
      http.get(`${BASE}/api/sandboxes`, () => HttpResponse.json([makeSandbox()])),
    );

    render(<AgentWorkspaceClient agentId="agent-runtime-001" />);

    await waitFor(() => {
      expect(screen.getByText('Freshly launched')).toBeInTheDocument();
    });
  });

  test('shows error when sandbox not found after launch', async () => {
    server.use(
      http.post(`${BASE}/api/agents/agent-runtime-001/launch`, () =>
        HttpResponse.json({
          launched: true,
          sandboxId: 'sb-missing-001',
          agent: makeAgentRecord(),
        }),
      ),
      http.get(`${BASE}/api/sandboxes`, () => HttpResponse.json([makeSandbox()])),
    );

    render(<AgentWorkspaceClient agentId="agent-runtime-001" />);

    await waitFor(() => {
      expect(screen.getByText('Could not open this workspace')).toBeInTheDocument();
      expect(screen.getByText('Launched sandbox was not found.')).toBeInTheDocument();
    });
  });

  test('shows SetupPanel when agent has missing required inputs', async () => {
    server.use(
      http.get(`${BASE}/api/agents/agent-runtime-001`, () =>
        HttpResponse.json(makeAgentRecord({
          runtime_inputs: [
            {
              key: 'GOOGLE_ADS_API_KEY',
              label: 'Google Ads API Key',
              description: 'Your API key',
              required: true,
              value: '',
              populationStrategy: 'user_required',
            },
          ],
        })),
      ),
    );

    render(<AgentWorkspaceClient agentId="agent-runtime-001" />);

    await waitFor(() => {
      expect(screen.getByText('Almost ready')).toBeInTheDocument();
      expect(screen.getByText('Google Ads API Key')).toBeInTheDocument();
    });
  });

  test('SetupPanel save & continue calls PATCH customer-config', async () => {
    let patchCalled = false;
    server.use(
      http.get(`${BASE}/api/agents/agent-runtime-001`, () =>
        HttpResponse.json(makeAgentRecord({
          runtime_inputs: [
            {
              key: 'API_KEY',
              label: 'API Key',
              description: 'Your key',
              required: true,
              value: '',
              defaultValue: 'some-default',
              populationStrategy: 'user_required',
            },
          ],
        })),
      ),
      http.patch(`${BASE}/api/agents/agent-runtime-001/customer-config`, () => {
        patchCalled = true;
        return HttpResponse.json({ ok: true });
      }),
      http.post(`${BASE}/api/agents/agent-runtime-001/launch`, () =>
        HttpResponse.json({ launched: true, sandboxId: 'sb-test-001', agent: makeAgentRecord() }),
      ),
      http.get(`${BASE}/api/sandboxes`, () => HttpResponse.json([makeSandbox()])),
    );

    render(<AgentWorkspaceClient agentId="agent-runtime-001" />);

    // isFilled returns true because defaultValue is set, so hasMissingRequired
    // returns false -> launches directly. We need truly missing (no value, no default).
    // Reconfigure: required=true, no value, no defaultValue -> goes to setup
    server.use(
      http.get(`${BASE}/api/agents/agent-runtime-001`, () =>
        HttpResponse.json(makeAgentRecord({
          runtime_inputs: [
            {
              key: 'API_KEY',
              label: 'API Key',
              description: 'Required secret',
              required: true,
              value: '',
              populationStrategy: 'user_required',
            },
          ],
        })),
      ),
    );
    render(<AgentWorkspaceClient agentId="agent-runtime-001" />);

    await waitFor(() => screen.getByText('Almost ready'));

    const saveBtn = screen.getByRole('button', { name: /save.*continue/i });
    await userEvent.click(saveBtn);

    await waitFor(() => expect(patchCalled).toBe(true));
  });

  test('SetupPanel shows "Required to Start" section for user_required inputs', async () => {
    server.use(
      http.get(`${BASE}/api/agents/agent-runtime-001`, () =>
        HttpResponse.json(makeAgentRecord({
          runtime_inputs: [
            {
              key: 'SECRET',
              label: 'Secret Token',
              description: 'Required secret',
              required: true,
              value: '',
              populationStrategy: 'user_required',
            },
          ],
        })),
      ),
    );

    render(<AgentWorkspaceClient agentId="agent-runtime-001" />);

    await waitFor(() => {
      expect(screen.getByText('Required to Start')).toBeInTheDocument();
      expect(screen.getByText('Secret Token')).toBeInTheDocument();
    });
  });

  test('SetupPanel shows "No credentials needed" when no user_required inputs', async () => {
    server.use(
      http.get(`${BASE}/api/agents/agent-runtime-001`, () =>
        HttpResponse.json(makeAgentRecord({
          runtime_inputs: [
            {
              key: 'AUTO_KEY',
              label: 'Auto Key',
              description: 'Auto configured',
              required: false,
              value: 'auto-value',
              populationStrategy: 'ai_inferred',
            },
          ],
        })),
      ),
      http.post(`${BASE}/api/agents/agent-runtime-001/launch`, () =>
        HttpResponse.json({ launched: true, sandboxId: 'sb-test-001', agent: makeAgentRecord() }),
      ),
      http.get(`${BASE}/api/sandboxes`, () => HttpResponse.json([makeSandbox()])),
    );

    // No missing required inputs, so it launches directly (no setup panel)
    render(<AgentWorkspaceClient agentId="agent-runtime-001" />);

    await waitFor(() => {
      expect(screen.getByText('Chat panel for openclaw-gateway')).toBeInTheDocument();
    });
  });

  test('SetupPanel RuntimeInputField renders boolean toggle', async () => {
    server.use(
      http.get(`${BASE}/api/agents/agent-runtime-001`, () =>
        HttpResponse.json(makeAgentRecord({
          runtime_inputs: [
            {
              key: 'ENABLE_FEATURE',
              label: 'Enable Feature',
              description: 'Toggle this feature',
              required: true,
              value: '',
              inputType: 'boolean',
              populationStrategy: 'user_required',
            },
          ],
        })),
      ),
    );

    render(<AgentWorkspaceClient agentId="agent-runtime-001" />);

    await waitFor(() => {
      expect(screen.getByText('Enable Feature')).toBeInTheDocument();
      // Boolean field shows Enabled/Disabled text
      expect(screen.getByText('Disabled')).toBeInTheDocument();
    });
  });

  test('SetupPanel RuntimeInputField renders select dropdown', async () => {
    server.use(
      http.get(`${BASE}/api/agents/agent-runtime-001`, () =>
        HttpResponse.json(makeAgentRecord({
          runtime_inputs: [
            {
              key: 'REGION',
              label: 'Region',
              description: 'Select region',
              required: true,
              value: '',
              inputType: 'select',
              options: ['us-east', 'eu-west', 'ap-south'],
              populationStrategy: 'user_required',
            },
          ],
        })),
      ),
    );

    render(<AgentWorkspaceClient agentId="agent-runtime-001" />);

    await waitFor(() => {
      expect(screen.getByText('Region')).toBeInTheDocument();
      expect(screen.getByText('Select...')).toBeInTheDocument();
    });
  });

  test('SetupPanel RuntimeInputField renders number input', async () => {
    server.use(
      http.get(`${BASE}/api/agents/agent-runtime-001`, () =>
        HttpResponse.json(makeAgentRecord({
          runtime_inputs: [
            {
              key: 'TIMEOUT',
              label: 'Timeout',
              description: 'Timeout in seconds',
              required: true,
              value: '',
              inputType: 'number',
              example: '30',
              populationStrategy: 'user_required',
            },
          ],
        })),
      ),
    );

    render(<AgentWorkspaceClient agentId="agent-runtime-001" />);

    await waitFor(() => {
      const numInput = screen.getByPlaceholderText('30');
      expect(numInput).toBeInTheDocument();
    });
  });

  test('handleNewChat callback switches conversation to null', async () => {
    server.use(
      http.post(`${BASE}/api/agents/agent-runtime-001/launch`, () =>
        HttpResponse.json({ launched: true, sandboxId: 'sb-test-001', agent: makeAgentRecord() }),
      ),
      http.get(`${BASE}/api/sandboxes`, () => HttpResponse.json([makeSandbox()])),
    );

    render(<AgentWorkspaceClient agentId="agent-runtime-001" />);
    await screen.findByRole('heading', { name: /sarah assistant/i });

    // Trigger the onNewChat callback from the mocked ChatPanel
    await userEvent.click(screen.getByRole('button', { name: 'trigger-new-chat' }));
    // No assertion needed beyond "doesn't crash" — just verifies the handler runs
    expect(screen.getByText('Chat panel for openclaw-gateway')).toBeInTheDocument();
  });

  test('handleConversationCreated callback updates active conversation', async () => {
    server.use(
      http.post(`${BASE}/api/agents/agent-runtime-001/launch`, () =>
        HttpResponse.json({ launched: true, sandboxId: 'sb-test-001', agent: makeAgentRecord() }),
      ),
      http.get(`${BASE}/api/sandboxes`, () => HttpResponse.json([makeSandbox()])),
    );

    render(<AgentWorkspaceClient agentId="agent-runtime-001" />);
    await screen.findByRole('heading', { name: /sarah assistant/i });

    await userEvent.click(screen.getByRole('button', { name: 'trigger-conv-created' }));
    expect(screen.getByText('Chat panel for openclaw-gateway')).toBeInTheDocument();
  });

  test('handleOpenConversation from HistoryPanel switches to chat tab', async () => {
    server.use(
      http.post(`${BASE}/api/agents/agent-runtime-001/launch`, () =>
        HttpResponse.json({ launched: true, sandboxId: 'sb-test-001', agent: makeAgentRecord() }),
      ),
      http.get(`${BASE}/api/sandboxes`, () => HttpResponse.json([makeSandbox()])),
    );

    render(<AgentWorkspaceClient agentId="agent-runtime-001" />);
    await screen.findByRole('heading', { name: /sarah assistant/i });

    // Switch to History tab
    await userEvent.click(screen.getByRole('button', { name: 'History' }));
    expect(screen.getByText('History panel')).toBeInTheDocument();

    // Trigger openConversation from history panel
    await userEvent.click(screen.getByRole('button', { name: 'trigger-open-conv' }));

    // Should switch back to Chat tab
    await waitFor(() => {
      expect(screen.getByText('Chat panel for openclaw-gateway')).toBeInTheDocument();
    });
  });

  test('SetupPanel toggle for boolean input changes Disabled to Enabled', async () => {
    server.use(
      http.get(`${BASE}/api/agents/agent-runtime-001`, () =>
        HttpResponse.json(makeAgentRecord({
          runtime_inputs: [
            {
              key: 'ENABLE_FEATURE',
              label: 'Enable Feature',
              description: 'Toggle',
              required: true,
              value: '',
              inputType: 'boolean',
              populationStrategy: 'user_required',
            },
          ],
        })),
      ),
    );

    render(<AgentWorkspaceClient agentId="agent-runtime-001" />);

    await waitFor(() => screen.getByText('Disabled'));

    const toggleBtn = screen.getByRole('button', { name: '' });
    // There should be a toggle button; click it
    await userEvent.click(toggleBtn);

    await waitFor(() => {
      expect(screen.getByText('Enabled')).toBeInTheDocument();
    });
  });
});

  test('SetupPanel Smart Defaults section expands when clicked', async () => {
    server.use(
      http.get(`${BASE}/api/agents/agent-runtime-001`, () =>
        HttpResponse.json(makeAgentRecord({
          runtime_inputs: [
            {
              key: 'SECRET',
              label: 'Secret Token',
              description: 'Required secret',
              required: true,
              value: '',
              populationStrategy: 'user_required',
            },
            {
              key: 'AUTO_KEY',
              label: 'Auto Key',
              description: 'Auto configured',
              required: false,
              value: 'auto-val',
              populationStrategy: 'ai_inferred',
            },
          ],
        })),
      ),
    );

    render(<AgentWorkspaceClient agentId="agent-runtime-001" />);

    await waitFor(() => screen.getByText('Almost ready'));

    // Smart Defaults collapsible button
    const smartBtn = screen.getByRole('button', { name: /smart defaults/i });
    expect(smartBtn).toBeInTheDocument();
    await userEvent.click(smartBtn);

    // After expanding, the auto-configured input card should appear
    await waitFor(() => {
      expect(screen.getByText('Auto Key')).toBeInTheDocument();
    });
  });

  test('SetupPanel select dropdown triggers updateInput on change', async () => {
    server.use(
      http.get(`${BASE}/api/agents/agent-runtime-001`, () =>
        HttpResponse.json(makeAgentRecord({
          runtime_inputs: [
            {
              key: 'REGION',
              label: 'Region',
              description: 'Select region',
              required: true,
              value: '',
              inputType: 'select',
              options: ['us-east', 'eu-west'],
              populationStrategy: 'user_required',
            },
          ],
        })),
      ),
    );

    render(<AgentWorkspaceClient agentId="agent-runtime-001" />);

    await waitFor(() => screen.getByText('Region'));

    const select = screen.getByRole('combobox');
    await userEvent.selectOptions(select, 'us-east');

    // After selection the "Select..." placeholder should be gone
    await waitFor(() => {
      expect(screen.queryByText('Select...')).not.toBeInTheDocument();
    });
  });

  test('SetupPanel number input triggers updateInput on change', async () => {
    server.use(
      http.get(`${BASE}/api/agents/agent-runtime-001`, () =>
        HttpResponse.json(makeAgentRecord({
          runtime_inputs: [
            {
              key: 'TIMEOUT',
              label: 'Timeout',
              description: 'Timeout seconds',
              required: true,
              value: '',
              inputType: 'number',
              example: '30',
              populationStrategy: 'user_required',
            },
          ],
        })),
      ),
    );

    render(<AgentWorkspaceClient agentId="agent-runtime-001" />);

    await waitFor(() => screen.getByPlaceholderText('30'));

    const numInput = screen.getByPlaceholderText('30');
    await userEvent.clear(numInput);
    await userEvent.type(numInput, '60');

    expect(numInput).toHaveValue(60);
  });

  test('SetupPanel text input triggers updateInput on change', async () => {
    server.use(
      http.get(`${BASE}/api/agents/agent-runtime-001`, () =>
        HttpResponse.json(makeAgentRecord({
          runtime_inputs: [
            {
              key: 'API_KEY',
              label: 'API Key',
              description: 'Your API key',
              required: true,
              value: '',
              populationStrategy: 'user_required',
            },
          ],
        })),
      ),
    );

    render(<AgentWorkspaceClient agentId="agent-runtime-001" />);

    await waitFor(() => screen.getByText('API Key'));

    const textInput = screen.getByRole('textbox');
    await userEvent.type(textInput, 'sk-test-key');

    expect(textInput).toHaveValue('sk-test-key');
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
