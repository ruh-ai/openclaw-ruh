import '@testing-library/jest-dom';
import { server } from './__tests__/helpers/server';

// ── EventSource mock ──────────────────────────────────────────────────────────
// jsdom does not implement EventSource; provide a test-controllable replacement.

type EventHandler = ((event: MessageEvent) => void) | null;

class MockEventSource {
  static instances: MockEventSource[] = [];

  url: string;
  readyState = 1; // OPEN
  onerror: EventHandler = null;
  onmessage: EventHandler = null;

  private handlers = new Map<string, Set<(e: Event) => void>>();

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, handler: (e: Event) => void) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(handler);
  }

  removeEventListener(type: string, handler: (e: Event) => void) {
    this.handlers.get(type)?.delete(handler);
  }

  /** Test helper — dispatch a named event with a JSON data string. */
  emit(type: string, data: string) {
    const event = new MessageEvent(type, { data });
    this.handlers.get(type)?.forEach((h) => h(event));
  }

  close() {
    this.readyState = 2;
  }
}

// Expose the class so individual tests can access MockEventSource.instances
(global as unknown as Record<string, unknown>).MockEventSource = MockEventSource;
Object.defineProperty(global, 'EventSource', { value: MockEventSource, writable: true });

// ── navigator.clipboard ───────────────────────────────────────────────────────

Object.defineProperty(navigator, 'clipboard', {
  value: { writeText: jest.fn().mockResolvedValue(undefined) },
  writable: true,
  configurable: true,
});

// ── scrollIntoView ─────────────────────────────────────────────────────────────

window.HTMLElement.prototype.scrollIntoView = jest.fn();

// ── MSW server lifecycle ──────────────────────────────────────────────────────

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
