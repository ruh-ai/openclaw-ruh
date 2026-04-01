import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../helpers/server';
import SandboxForm from '@/components/SandboxForm';

const BASE = 'http://localhost:8000';

// Access the MockEventSource class set up in jest.setup.ts
const getMockES = () =>
  (global as unknown as {
    MockEventSource: {
      instances: {
        emit: (t: string, d: string) => void;
        close: () => void;
        onerror?: (event: MessageEvent) => void;
      }[];
    };
  }).MockEventSource;

function renderForm(props: { onCreated?: () => void; onCancel?: () => void } = {}) {
  return render(<SandboxForm {...props} />);
}

describe('SandboxForm', () => {
  beforeEach(() => {
    // Clear MockEventSource instances between tests
    getMockES().instances.length = 0;
  });

  // ── Initial render ────────────────────────────────────────────────────────────

  test('renders the sandbox name field label', () => {
    renderForm();
    expect(screen.getByText('Sandbox Name')).toBeInTheDocument();
  });

  test('renders name input with default value "openclaw-gateway"', () => {
    renderForm();
    const input = screen.getByRole('textbox');
    expect(input).toHaveValue('openclaw-gateway');
  });

  test('renders "Create Sandbox" submit button', () => {
    renderForm();
    expect(screen.getByRole('button', { name: /create sandbox/i })).toBeInTheDocument();
  });

  test('renders cancel button when onCancel prop provided', () => {
    renderForm({ onCancel: jest.fn() });
    expect(screen.getByText('✕ Cancel')).toBeInTheDocument();
  });

  test('does not render cancel button when onCancel not provided', () => {
    renderForm();
    expect(screen.queryByText('✕ Cancel')).not.toBeInTheDocument();
  });

  // ── Input interaction ─────────────────────────────────────────────────────────

  test('updates sandbox name input on change', async () => {
    renderForm();
    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    await userEvent.type(input, 'my-sandbox');
    expect(input).toHaveValue('my-sandbox');
  });

  // ── Form submission ───────────────────────────────────────────────────────────

  test('calls POST /api/sandboxes/create with sandbox name on submit', async () => {
    let capturedBody: Record<string, unknown> = {};
    server.use(http.post(`${BASE}/api/sandboxes/create`, async ({ request }) => {
      capturedBody = await request.json() as Record<string, unknown>;
      return HttpResponse.json({ stream_id: 'test-stream' });
    }));

    renderForm();
    await userEvent.click(screen.getByRole('button', { name: /create sandbox/i }));

    await waitFor(() => expect(capturedBody.sandbox_name).toBe('openclaw-gateway'));
  });

  test('disables input and hides submit button while running', async () => {
    renderForm();
    await userEvent.click(screen.getByRole('button', { name: /create sandbox/i }));

    await waitFor(() => expect(screen.getByRole('textbox')).toBeDisabled());
    expect(screen.queryByRole('button', { name: /create sandbox/i })).not.toBeInTheDocument();
  });

  // ── SSE event handling ────────────────────────────────────────────────────────

  test('displays log messages from SSE log events', async () => {
    renderForm();
    await userEvent.click(screen.getByRole('button', { name: /create sandbox/i }));

    await waitFor(() => expect(getMockES().instances.length).toBe(1));

    act(() => {
      getMockES().instances[0].emit('log', JSON.stringify({ message: 'Installing OpenClaw...' }));
    });

    await waitFor(() => expect(screen.getByText('Installing OpenClaw...')).toBeInTheDocument());
  });

  test('displays log for approved event', async () => {
    renderForm();
    await userEvent.click(screen.getByRole('button', { name: /create sandbox/i }));

    await waitFor(() => expect(getMockES().instances.length).toBe(1));

    act(() => {
      getMockES().instances[0].emit('approved', JSON.stringify({ message: 'device-001 approved' }));
    });

    await waitFor(() => expect(screen.getByText(/device-001 approved/)).toBeInTheDocument());
  });

  test('calls onCreated callback on result event', async () => {
    const onCreated = jest.fn();
    renderForm({ onCreated });

    await userEvent.click(screen.getByRole('button', { name: /create sandbox/i }));
    await waitFor(() => expect(getMockES().instances.length).toBe(1));

    act(() => {
      getMockES().instances[0].emit('result', JSON.stringify({ sandbox_id: 'sb-001' }));
    });

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
  });

  test('shows "Sandbox ready!" message on done event', async () => {
    renderForm();
    await userEvent.click(screen.getByRole('button', { name: /create sandbox/i }));

    await waitFor(() => expect(getMockES().instances.length).toBe(1));

    act(() => {
      getMockES().instances[0].emit('done', '{}');
    });

    await waitFor(() => expect(screen.getByText('Sandbox ready!')).toBeInTheDocument());
  });

  test('keeps the success state when EventSource closes after a done event', async () => {
    renderForm();
    await userEvent.click(screen.getByRole('button', { name: /create sandbox/i }));

    await waitFor(() => expect(getMockES().instances.length).toBe(1));

    act(() => {
      getMockES().instances[0].emit('done', '{}');
    });

    await waitFor(() => expect(screen.getByText('Sandbox ready!')).toBeInTheDocument());

    act(() => {
      getMockES().instances[0].onerror?.(new MessageEvent('error'));
    });

    expect(screen.getByText('Sandbox ready!')).toBeInTheDocument();
    expect(screen.queryByText('SSE connection error')).not.toBeInTheDocument();
  });

  test('shows error message on SSE error event', async () => {
    renderForm();
    await userEvent.click(screen.getByRole('button', { name: /create sandbox/i }));

    await waitFor(() => expect(getMockES().instances.length).toBe(1));

    act(() => {
      getMockES().instances[0].emit('error', JSON.stringify({ message: 'Installation failed' }));
    });

    await waitFor(() => expect(screen.getByText('Installation failed')).toBeInTheDocument());
    expect(screen.getByText(/try again/i)).toBeInTheDocument();
  });

  // ── Error state ───────────────────────────────────────────────────────────────

  test('shows error when POST /api/sandboxes/create returns 500', async () => {
    server.use(http.post(`${BASE}/api/sandboxes/create`, () =>
      HttpResponse.json({ detail: 'DAYTONA_API_KEY not set' }, { status: 500 }),
    ));
    renderForm();
    await userEvent.click(screen.getByRole('button', { name: /create sandbox/i }));

    await waitFor(() => expect(screen.getByText('DAYTONA_API_KEY not set')).toBeInTheDocument());
  });

  test('"Try again" button resets to idle state', async () => {
    server.use(http.post(`${BASE}/api/sandboxes/create`, () =>
      HttpResponse.json({ detail: 'Server error' }, { status: 500 }),
    ));
    renderForm();
    await userEvent.click(screen.getByRole('button', { name: /create sandbox/i }));
    await waitFor(() => screen.getByText(/try again/i));

    await userEvent.click(screen.getByText(/try again/i));

    expect(screen.getByRole('button', { name: /create sandbox/i })).toBeInTheDocument();
    expect(screen.queryByText('Error')).not.toBeInTheDocument();
  });

  // ── Cancel ────────────────────────────────────────────────────────────────────

  test('cancel button calls onCancel', async () => {
    const onCancel = jest.fn();
    renderForm({ onCancel });
    await userEvent.click(screen.getByText('✕ Cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
