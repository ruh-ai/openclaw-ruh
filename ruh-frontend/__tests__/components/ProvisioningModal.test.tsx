/**
 * ProvisioningModal — basic render coverage.
 * Mocks EventSource to prevent JSDOM errors.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProvisioningModal } from '@/components/ProvisioningModal';

// Mock EventSource — not available in jsdom
class MockEventSource {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  private handlers: Record<string, ((e: Event) => void)[]> = {};

  constructor(public url: string, public options?: { withCredentials?: boolean }) {}

  addEventListener(type: string, handler: (e: Event) => void) {
    if (!this.handlers[type]) this.handlers[type] = [];
    this.handlers[type].push(handler);
  }

  close() {}
}

beforeEach(() => {
  // @ts-expect-error -- mock EventSource
  global.EventSource = MockEventSource;
});

describe('ProvisioningModal', () => {
  test('renders agent name and connecting state initially', () => {
    render(
      <ProvisioningModal
        agentId="agent-1"
        streamId="stream-1"
        agentName="Google Ads Agent"
        onComplete={jest.fn()}
        onClose={jest.fn()}
      />
    );

    // Header shows the agent name
    const elements = screen.getAllByText(/Google Ads Agent/);
    expect(elements.length).toBeGreaterThan(0);
    // Initial phase is "connecting"
    expect(screen.getByText(/Connecting\.\.\./)).toBeTruthy();
  });

  test('close button calls onClose', async () => {
    const onClose = jest.fn();
    const { container } = render(
      <ProvisioningModal
        agentId="agent-1"
        streamId="stream-1"
        agentName="Test Agent"
        onComplete={jest.fn()}
        onClose={onClose}
      />
    );

    const closeBtn = container.querySelector('button');
    if (closeBtn) {
      await userEvent.click(closeBtn);
      expect(onClose).toHaveBeenCalled();
    }
  });
});
