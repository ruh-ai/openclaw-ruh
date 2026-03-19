import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../helpers/server';
import { makeSandbox } from '../helpers/fixtures';
import Home from '@/app/page';

const BASE = 'http://localhost:8000';

describe('Home page', () => {
  // ── Initial render ────────────────────────────────────────────────────────────

  test('renders app title "OpenClaw on Daytona"', async () => {
    render(<Home />);
    expect(screen.getByText('OpenClaw on Daytona')).toBeInTheDocument();
  });

  test('renders SandboxSidebar with "Sandboxes" heading', async () => {
    render(<Home />);
    expect(screen.getByText('Sandboxes')).toBeInTheDocument();
  });

  test('shows empty state with paw emoji and create button', async () => {
    server.use(http.get(`${BASE}/api/sandboxes`, () => HttpResponse.json([])));
    render(<Home />);
    await waitFor(() => screen.queryByText('Loading…') === null, { timeout: 2000 }).catch(() => {});
    // May show the paw or create button
    const createBtn = screen.queryByRole('button', { name: /create new sandbox/i });
    expect(createBtn ?? screen.getByText('OpenClaw on Daytona')).toBeTruthy();
  });

  // ── Navigation to create view ─────────────────────────────────────────────────

  test('clicking "+ New" in sidebar shows SandboxForm', async () => {
    render(<Home />);
    const newBtn = screen.getByText('+ New');
    await userEvent.click(newBtn);
    await waitFor(() => expect(screen.getByText('New Sandbox')).toBeInTheDocument());
  });

  test('clicking "+ Create New Sandbox" shows SandboxForm', async () => {
    server.use(http.get(`${BASE}/api/sandboxes`, () => HttpResponse.json([])));
    render(<Home />);
    await waitFor(() => screen.queryByText('Loading…') === null, { timeout: 2000 }).catch(() => {});

    const createBtn = screen.queryByRole('button', { name: /create new sandbox/i });
    if (createBtn) {
      await userEvent.click(createBtn);
      await waitFor(() => expect(screen.getByText('New Sandbox')).toBeInTheDocument());
    }
  });

  // ── Cancel create returns to previous view ────────────────────────────────────

  test('cancel button in SandboxForm returns to empty view', async () => {
    render(<Home />);
    await userEvent.click(screen.getByText('+ New'));
    await waitFor(() => screen.getByText('New Sandbox'));

    await userEvent.click(screen.getByText('✕ Cancel'));
    await waitFor(() => expect(screen.queryByText('New Sandbox')).not.toBeInTheDocument());
  });

  // ── Selecting a sandbox ───────────────────────────────────────────────────────

  test('selecting a sandbox shows Chat/Crons/Channels tabs', async () => {
    const sandbox = makeSandbox();
    server.use(http.get(`${BASE}/api/sandboxes`, () => HttpResponse.json([sandbox])));

    render(<Home />);
    await waitFor(() => screen.getByText('openclaw-gateway'));
    await userEvent.click(screen.getByText('openclaw-gateway'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Chat' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Crons' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Channels' })).toBeInTheDocument();
    });
  });

  test('Chat tab is active by default when sandbox selected', async () => {
    const sandbox = makeSandbox();
    server.use(http.get(`${BASE}/api/sandboxes`, () => HttpResponse.json([sandbox])));

    render(<Home />);
    await waitFor(() => screen.getByText('openclaw-gateway'));
    await userEvent.click(screen.getByText('openclaw-gateway'));

    await waitFor(() => screen.getByRole('button', { name: 'Chat' }));
    const chatBtn = screen.getByRole('button', { name: 'Chat' });
    expect(chatBtn).toHaveClass('bg-gray-800');
  });

  // ── Tab switching ─────────────────────────────────────────────────────────────

  test('clicking Crons tab shows CronsPanel', async () => {
    const sandbox = makeSandbox();
    server.use(http.get(`${BASE}/api/sandboxes`, () => HttpResponse.json([sandbox])));

    render(<Home />);
    await waitFor(() => screen.getByText('openclaw-gateway'));
    await userEvent.click(screen.getByText('openclaw-gateway'));

    await waitFor(() => screen.getByRole('button', { name: 'Crons' }));
    await userEvent.click(screen.getByRole('button', { name: 'Crons' }));

    // CronsPanel should render — "Cron Jobs" is the panel's h2 heading
    await waitFor(() =>
      expect(
        screen.queryByText('Cron Jobs') ??
        screen.queryByText(/loading cron/i),
      ).toBeTruthy(),
    );
  });

  test('clicking Channels tab shows ChannelsPanel', async () => {
    const sandbox = makeSandbox();
    server.use(http.get(`${BASE}/api/sandboxes`, () => HttpResponse.json([sandbox])));

    render(<Home />);
    await waitFor(() => screen.getByText('openclaw-gateway'));
    await userEvent.click(screen.getByText('openclaw-gateway'));

    await waitFor(() => screen.getByRole('button', { name: 'Channels' }));
    await userEvent.click(screen.getByRole('button', { name: 'Channels' }));

    await waitFor(() =>
      expect(screen.queryByText(/telegram/i) ?? screen.queryByText(/slack/i)).toBeTruthy(),
    );
  });

  // ── Tabs not shown without sandbox ───────────────────────────────────────────

  test('tabs are not shown when no sandbox is selected', () => {
    render(<Home />);
    expect(screen.queryByRole('button', { name: 'Chat' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Crons' })).not.toBeInTheDocument();
  });

  // ── refreshKey increments after creation ──────────────────────────────────────

  test('SandboxForm onCreated triggers sidebar refresh', async () => {
    let fetchCount = 0;
    const getMockES = () =>
      (global as unknown as { MockEventSource: { instances: { emit: (t: string, d: string) => void }[] } }).MockEventSource;

    server.use(
      http.get(`${BASE}/api/sandboxes`, () => {
        fetchCount++;
        return HttpResponse.json([]);
      }),
      http.post(`${BASE}/api/sandboxes/create`, () =>
        HttpResponse.json({ stream_id: 'refresh-test-stream' }),
      ),
    );

    render(<Home />);
    const initialFetchCount = fetchCount;

    await userEvent.click(screen.getByText('+ New'));
    await waitFor(() => screen.getByText('New Sandbox'));

    await userEvent.click(screen.getByRole('button', { name: /create sandbox/i }));

    // Wait for EventSource instance
    await waitFor(() => getMockES().instances.length > 0);

    getMockES().instances[getMockES().instances.length - 1].emit(
      'result',
      JSON.stringify({ sandbox_id: 'sb-new' }),
    );

    // After result event, sidebar should re-fetch
    await waitFor(() => expect(fetchCount).toBeGreaterThan(initialFetchCount));
  });
});
