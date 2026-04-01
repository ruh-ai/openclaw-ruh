import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../helpers/server';
import { makeSandbox } from '../helpers/fixtures';
import Home from '@/app/page';

const BASE = 'http://localhost:8000';

describe('Home page', () => {
  test('renders the current empty state and sidebar entry point', async () => {
    server.use(http.get(`${BASE}/api/sandboxes`, () => HttpResponse.json([])));
    render(<Home />);
    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument());

    expect(screen.getByText('No sandbox selected')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /\+ new sandbox/i })
    ).toBeInTheDocument();
    expect(screen.getByText('New Sandbox')).toBeInTheDocument();
  });

  test('clicking the sidebar New Sandbox entry shows SandboxForm', async () => {
    render(<Home />);
    await userEvent.click(screen.getByText('New Sandbox'));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /create sandbox/i })).toBeInTheDocument()
    );
  });

  test('clicking the empty-state create button shows SandboxForm', async () => {
    server.use(http.get(`${BASE}/api/sandboxes`, () => HttpResponse.json([])));
    render(<Home />);
    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /\+ new sandbox/i }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /create sandbox/i })).toBeInTheDocument()
    );
  });

  test('cancel button in SandboxForm returns to empty view', async () => {
    render(<Home />);
    await userEvent.click(screen.getByText('New Sandbox'));
    await waitFor(() => screen.getByRole('button', { name: /create sandbox/i }));

    await userEvent.click(screen.getByText('✕ Cancel'));
    await waitFor(() =>
      expect(screen.getByText('No sandbox selected')).toBeInTheDocument()
    );
  });

  test('selecting a sandbox shows Chat, History, and Mission Control tabs', async () => {
    const sandbox = makeSandbox();
    server.use(http.get(`${BASE}/api/sandboxes`, () => HttpResponse.json([sandbox])));

    render(<Home />);
    await waitFor(() => screen.getByText('openclaw-gateway'));
    await userEvent.click(screen.getByText('openclaw-gateway'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Chat' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'History' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Mission Control' })).toBeInTheDocument();
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
    expect(chatBtn.className).toContain('bg-[#fdf4ff]');
  });

  test('clicking History tab shows the chat history panel', async () => {
    const sandbox = makeSandbox();
    server.use(http.get(`${BASE}/api/sandboxes`, () => HttpResponse.json([sandbox])));

    render(<Home />);
    await waitFor(() => screen.getByText('openclaw-gateway'));
    await userEvent.click(screen.getByText('openclaw-gateway'));

    await waitFor(() => screen.getByRole('button', { name: 'History' }));
    await userEvent.click(screen.getByRole('button', { name: 'History' }));

    await waitFor(() => expect(screen.getByText('Chat History')).toBeInTheDocument());
  });

  test('clicking Mission Control shows overview content', async () => {
    const sandbox = makeSandbox();
    server.use(http.get(`${BASE}/api/sandboxes`, () => HttpResponse.json([sandbox])));

    render(<Home />);
    await waitFor(() => screen.getByText('openclaw-gateway'));
    await userEvent.click(screen.getByText('openclaw-gateway'));

    await waitFor(() => screen.getByRole('button', { name: 'Mission Control' }));
    await userEvent.click(screen.getByRole('button', { name: 'Mission Control' }));

    await waitFor(() => expect(screen.getByText('Gateway Status')).toBeInTheDocument());
  });

  test('tabs are not shown when no sandbox is selected', () => {
    render(<Home />);
    expect(screen.queryByRole('button', { name: 'Chat' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'History' })).not.toBeInTheDocument();
  });

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

    await userEvent.click(screen.getByText('New Sandbox'));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /create sandbox/i })).toBeInTheDocument()
    );

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
