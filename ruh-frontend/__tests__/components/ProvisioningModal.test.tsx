/**
 * ProvisioningModal — SSE handling, phase inference, error state coverage.
 */
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProvisioningModal } from '@/components/ProvisioningModal';

type EventHandler = (e: Event) => void;

class ControllableMockEventSource {
  static lastInstance: ControllableMockEventSource | null = null;

  onerror: EventHandler | null = null;
  private handlers: Record<string, EventHandler[]> = {};
  public closed = false;

  constructor(public url: string, public options?: { withCredentials?: boolean }) {
    ControllableMockEventSource.lastInstance = this;
  }

  addEventListener(type: string, handler: EventHandler) {
    if (!this.handlers[type]) this.handlers[type] = [];
    this.handlers[type].push(handler);
  }

  /** Emit a named SSE event with JSON-serialised data. */
  emit(type: string, data: unknown) {
    const event = new MessageEvent(type, { data: JSON.stringify(data) });
    (this.handlers[type] ?? []).forEach((h) => h(event));
  }

  /** Emit a raw event with a non-JSON data string. */
  emitRaw(type: string, data: string) {
    const event = new MessageEvent(type, { data });
    (this.handlers[type] ?? []).forEach((h) => h(event));
  }

  close() {
    this.closed = true;
  }
}

beforeEach(() => {
  ControllableMockEventSource.lastInstance = null;
  // @ts-expect-error -- mock EventSource globally
  global.EventSource = ControllableMockEventSource;
});

function renderModal(overrides?: Partial<Parameters<typeof ProvisioningModal>[0]>) {
  const props = {
    agentId: 'agent-1',
    streamId: 'stream-1',
    agentName: 'Google Ads Agent',
    onComplete: jest.fn(),
    onClose: jest.fn(),
    ...overrides,
  };
  const result = render(<ProvisioningModal {...props} />);
  return { ...result, props };
}

describe('ProvisioningModal', () => {
  test('renders agent name and connecting state initially', () => {
    renderModal();
    expect(screen.getAllByText(/Google Ads Agent/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Connecting\.\.\./)).toBeInTheDocument();
  });

  test('close button calls onClose', async () => {
    const onClose = jest.fn();
    const { container } = renderModal({ onClose });
    const closeBtn = container.querySelector('button');
    expect(closeBtn).toBeTruthy();
    await userEvent.click(closeBtn!);
    expect(onClose).toHaveBeenCalled();
  });

  test('shows "Do not close" footer message while connecting', () => {
    renderModal();
    expect(screen.getByText(/do not close this window/i)).toBeInTheDocument();
  });

  test('shows all phase steps in progress bar', () => {
    renderModal();
    expect(screen.getByText('provisioning')).toBeInTheDocument();
    expect(screen.getByText('cloning')).toBeInTheDocument();
    expect(screen.getByText('installing')).toBeInTheDocument();
    expect(screen.getByText('migrating')).toBeInTheDocument();
    expect(screen.getByText('starting')).toBeInTheDocument();
    expect(screen.getByText('ready')).toBeInTheDocument();
  });

  test('shows "Connecting to provisioning stream" placeholder when no logs', () => {
    renderModal();
    expect(screen.getByText('Connecting to provisioning stream...')).toBeInTheDocument();
  });

  test('log event appends message to log list', async () => {
    renderModal();
    const es = ControllableMockEventSource.lastInstance!;

    await act(async () => {
      es.emit('log', { message: 'Container started' });
    });

    expect(screen.getByText('Container started')).toBeInTheDocument();
  });

  test('log event updates phase via inferPhase: clone message -> cloning', async () => {
    renderModal();
    const es = ControllableMockEventSource.lastInstance!;

    await act(async () => {
      es.emit('log', { message: 'Cloning template from GitHub' });
    });

    await waitFor(() => {
      expect(screen.getByText('Cloning template from GitHub...')).toBeInTheDocument();
    });
  });

  test('log event infers installing phase', async () => {
    renderModal();
    const es = ControllableMockEventSource.lastInstance!;

    await act(async () => {
      es.emit('log', { message: 'npm install completed' });
    });

    await waitFor(() => {
      expect(screen.getByText('Installing dependencies...')).toBeInTheDocument();
    });
  });

  test('log event infers migrating phase', async () => {
    renderModal();
    const es = ControllableMockEventSource.lastInstance!;

    await act(async () => {
      es.emit('log', { message: 'Running database migrations' });
    });

    await waitFor(() => {
      expect(screen.getByText('Running database migrations...')).toBeInTheDocument();
    });
  });

  test('log event infers starting phase', async () => {
    renderModal();
    const es = ControllableMockEventSource.lastInstance!;

    await act(async () => {
      es.emit('log', { message: 'Starting backend service' });
    });

    await waitFor(() => {
      expect(screen.getByText('Starting services...')).toBeInTheDocument();
    });
  });

  test('log event with non-JSON data string still appends raw text', async () => {
    renderModal();
    const es = ControllableMockEventSource.lastInstance!;

    await act(async () => {
      es.emitRaw('log', 'raw log line');
    });

    expect(screen.getByText('raw log line')).toBeInTheDocument();
  });

  test('done event sets phase to ready and calls onComplete after delay', async () => {
    jest.useFakeTimers();
    const onComplete = jest.fn();
    renderModal({ onComplete });
    const es = ControllableMockEventSource.lastInstance!;

    await act(async () => {
      es.emitRaw('done', '{}');
    });

    await waitFor(() => {
      expect(screen.getByText('Agent ready!')).toBeInTheDocument();
      expect(screen.getByText(/redirecting/i)).toBeInTheDocument();
    });

    expect(onComplete).not.toHaveBeenCalled();
    act(() => { jest.advanceTimersByTime(1500); });
    expect(onComplete).toHaveBeenCalled();

    jest.useRealTimers();
  });

  test('error event sets error phase and shows error message', async () => {
    renderModal();
    const es = ControllableMockEventSource.lastInstance!;

    await act(async () => {
      es.emit('error', { message: 'Docker pull failed' });
    });

    await waitFor(() => {
      expect(screen.getByText('Setup failed')).toBeInTheDocument();
      expect(screen.getByText('Docker pull failed')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /close and retry later/i })).toBeInTheDocument();
    });
  });

  test('error event with non-JSON data falls back to generic message', async () => {
    renderModal();
    const es = ControllableMockEventSource.lastInstance!;

    await act(async () => {
      es.emitRaw('error', 'not json');
    });

    await waitFor(() => {
      expect(screen.getByText('Setup failed')).toBeInTheDocument();
    });
    // Generic fallback message shown
    expect(screen.getByText('Connection lost during provisioning')).toBeInTheDocument();
  });

  test('result event sets phase to provisioning', async () => {
    renderModal();
    const es = ControllableMockEventSource.lastInstance!;

    await act(async () => {
      es.emitRaw('result', '{}');
    });

    await waitFor(() => {
      expect(screen.getByText('Provisioning container...')).toBeInTheDocument();
    });
  });

  test('"Close and retry later" button calls onClose from error state', async () => {
    const onClose = jest.fn();
    renderModal({ onClose });
    const es = ControllableMockEventSource.lastInstance!;

    await act(async () => {
      es.emit('error', { message: 'Oops' });
    });

    await waitFor(() => screen.getByRole('button', { name: /close and retry later/i }));
    await userEvent.click(screen.getByRole('button', { name: /close and retry later/i }));
    expect(onClose).toHaveBeenCalled();
  });

  test('EventSource URL is constructed from agentId and streamId', () => {
    renderModal({ agentId: 'agent-xyz', streamId: 'stream-abc' });
    const es = ControllableMockEventSource.lastInstance!;
    expect(es.url).toContain('agent-xyz');
    expect(es.url).toContain('stream-abc');
  });

  test('EventSource is closed on unmount', () => {
    const { unmount } = renderModal();
    const es = ControllableMockEventSource.lastInstance!;
    unmount();
    expect(es.closed).toBe(true);
  });

  test('approved event does not change phase', async () => {
    renderModal();
    const es = ControllableMockEventSource.lastInstance!;

    // approved event is a no-op — phase stays at "connecting"
    await act(async () => {
      es.emitRaw('approved', '{}');
    });

    // Phase label should still be "Connecting..."
    expect(screen.getByText(/Connecting\.\.\./)).toBeInTheDocument();
  });

  test('onerror handler does not crash', async () => {
    renderModal();
    const es = ControllableMockEventSource.lastInstance!;

    // Trigger onerror (e.g., SSE reconnect / stream ended)
    await act(async () => {
      if (es.onerror) {
        es.onerror(new Event('error'));
      }
    });

    // Phase should not change to error (onerror is a silent no-op)
    expect(screen.getByText(/Connecting\.\.\./)).toBeInTheDocument();
  });
});
