/**
 * Event Tracer — lightweight observability for the AG-UI event pipeline.
 *
 * Tracks every event from emission (builder-agent) through reception
 * (use-agent-chat) to application (copilot-store). Exposes traces on
 * `window.__EVENT_TRACES__` for browser-console debugging.
 */

export type TraceSource = "builder-agent" | "use-agent-chat" | "copilot-store" | "forge-chat";
export type TraceStatus = "emitted" | "received" | "applied" | "dropped";

export interface EventTrace {
  timestamp: number;
  source: TraceSource;
  eventType: string;
  eventName?: string;
  status: TraceStatus;
  reason?: string;
  payload?: unknown;
}

const MAX_TRACES = 500;

class EventTracerImpl {
  private traces: EventTrace[] = [];
  private _enabled = true;

  get enabled() {
    return this._enabled;
  }
  set enabled(v: boolean) {
    this._enabled = v;
  }

  private push(trace: EventTrace) {
    if (!this._enabled) return;
    this.traces.push(trace);
    if (this.traces.length > MAX_TRACES) {
      this.traces = this.traces.slice(-MAX_TRACES);
    }
    // Auto-expose on window for console debugging
    if (typeof window !== "undefined") {
      (window as unknown as Record<string, unknown>).__EVENT_TRACES__ = this.traces;
    }
  }

  emit(source: TraceSource, eventType: string, eventName?: string, payload?: unknown) {
    this.push({ timestamp: Date.now(), source, eventType, eventName, status: "emitted", payload });
  }

  receive(source: TraceSource, eventType: string, eventName?: string) {
    this.push({ timestamp: Date.now(), source, eventType, eventName, status: "received" });
  }

  apply(source: TraceSource, eventType: string, eventName?: string) {
    this.push({ timestamp: Date.now(), source, eventType, eventName, status: "applied" });
  }

  drop(source: TraceSource, eventType: string, eventName?: string, reason?: string) {
    this.push({ timestamp: Date.now(), source, eventType, eventName, status: "dropped", reason });
  }

  /** Dump all traces to console as a table. */
  dump() {
    if (typeof console !== "undefined" && console.table) {
      console.table(this.traces);
    }
    return this.traces;
  }

  /** Get all traces (for testing). */
  getTraces(): readonly EventTrace[] {
    return this.traces;
  }

  /** Clear all traces. */
  clear() {
    this.traces = [];
  }
}

/** Singleton tracer instance. */
export const tracer = new EventTracerImpl();
