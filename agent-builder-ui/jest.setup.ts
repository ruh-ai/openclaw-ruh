import '@testing-library/jest-dom';
import { server } from './__tests__/helpers/server';

// ── WebSocket mock ───────────────────────────────────────────────────────────
// jsdom does not implement WebSocket; provide a test-controllable replacement.

type EventHandler = ((event: Event) => void) | null;

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  url: string;
  readyState = MockWebSocket.OPEN;
  onopen: EventHandler = null;
  onclose: EventHandler = null;
  onmessage: EventHandler = null;
  onerror: EventHandler = null;

  private handlers = new Map<string, Set<(e: Event) => void>>();

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
    // Auto-fire open event
    setTimeout(() => this.onopen?.(new Event('open')), 0);
  }

  addEventListener(type: string, handler: (e: Event) => void) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(handler);
  }

  removeEventListener(type: string, handler: (e: Event) => void) {
    this.handlers.get(type)?.delete(handler);
  }

  send(_data: string) {
    // No-op for tests
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
  }

  /** Test helper — dispatch a message event */
  emit(data: string) {
    const event = new MessageEvent('message', { data });
    this.onmessage?.(event);
    this.handlers.get('message')?.forEach((h) => h(event));
  }
}

(global as unknown as Record<string, unknown>).MockWebSocket = MockWebSocket;
Object.defineProperty(global, 'WebSocket', { value: MockWebSocket, writable: true });

// ── navigator.clipboard ──────────────────────────────────────────────────────

Object.defineProperty(navigator, 'clipboard', {
  value: { writeText: jest.fn().mockResolvedValue(undefined) },
  writable: true,
  configurable: true,
});

// ── scrollIntoView ───────────────────────────────────────────────────────────

window.HTMLElement.prototype.scrollIntoView = jest.fn();

// ── MSW server lifecycle ─────────────────────────────────────────────────────

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
