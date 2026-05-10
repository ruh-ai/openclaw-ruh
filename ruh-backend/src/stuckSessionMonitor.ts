/**
 * Stuck-session monitor — polls running sandbox gateways and emits
 * `runtime.diagnostic` system events when an architect/copilot session wedges
 * (or recovers).
 *
 * Background: the openclaw runtime detects stuck sessions and logs
 *   2026-05-09T06:27:35Z [diagnostic] stuck session: sessionId=copilot
 *   sessionKey=agent:copilot:copilot-plan:abc state=processing age=215s queueDepth=1
 * every 30s, but the diagnostic only lives in `/tmp/openclaw-gateway.log` inside
 * the container. Today, debugging a stuck Plan stage required tailing that log
 * by hand. This monitor surfaces the same signal as durable system_events so
 * /api/agents/:id/system-events and /api/agents/:id/diagnostics can show it,
 * and so a future builder UI badge has something to render.
 *
 * Design:
 *   - Pure logic (`diffSessionStates`, `recordEventsForCycle`) is testable
 *     without docker/db.
 *   - Every cycle: list running openclaw containers, tail each gateway log,
 *     parse stuck-session lines, diff against the previous cycle's state,
 *     emit `session.stuck` for newly-wedged keys and `session.recovered`
 *     for keys that disappeared. Steady-state (already-known stuck keys
 *     that are still stuck) emits nothing — the events stream stays quiet
 *     unless something transitions.
 *   - Failures (docker exec timeout, missing log file) skip that sandbox
 *     for the cycle without blowing up the whole monitor.
 *
 * The monitor never tries to recover the stuck session itself — that's a
 * runtime-side fix. This is purely visibility.
 */

export interface StuckSession {
  session_id: string;
  session_key: string;
  state: string;
  age_seconds: number;
  queue_depth: number;
}

/**
 * Parse `[diagnostic] stuck session:` lines into structured records, deduping
 * by session_key (keeping the highest age) and sorting by age descending.
 * Inlined here so the monitor is self-contained; will be deduped against
 * agentDiagnostics.parseStuckSessions once both surfaces ship.
 */
function parseStuckSessions(lines: string[]): StuckSession[] {
  const found: StuckSession[] = [];
  for (const line of lines) {
    if (!line.includes('[diagnostic] stuck session')) continue;
    const sessionId = line.match(/sessionId=(\S+)/)?.[1] ?? '';
    const sessionKey = line.match(/sessionKey=(\S+)/)?.[1] ?? '';
    const state = line.match(/state=(\S+)/)?.[1] ?? 'unknown';
    const age = Number.parseInt(line.match(/age=(\d+)s/)?.[1] ?? '0', 10);
    const queueDepth = Number.parseInt(line.match(/queueDepth=(\d+)/)?.[1] ?? '0', 10);
    if (!sessionKey) continue;
    const existingIdx = found.findIndex((s) => s.session_key === sessionKey);
    if (existingIdx >= 0) {
      if (age > found[existingIdx].age_seconds) {
        found[existingIdx] = { session_id: sessionId, session_key: sessionKey, state, age_seconds: age, queue_depth: queueDepth };
      }
      continue;
    }
    found.push({ session_id: sessionId, session_key: sessionKey, state, age_seconds: age, queue_depth: queueDepth });
  }
  return found.sort((a, b) => b.age_seconds - a.age_seconds);
}

export interface StuckSessionEvent {
  kind: 'session.stuck' | 'session.recovered';
  sandbox_id: string;
  agent_id: string | null;
  session: StuckSession;
}

export type SandboxSessionState = Map<string, StuckSession>;

/**
 * Diff two states for a single sandbox. Returns the events to emit:
 *   - newly_stuck: keys present in `current` but not in `previous`
 *   - recovered: keys present in `previous` but not in `current`
 * Steady-state keys (in both) emit no event.
 */
export function diffSessionStates(
  previous: SandboxSessionState,
  current: SandboxSessionState,
): { newlyStuck: StuckSession[]; recovered: StuckSession[] } {
  const newlyStuck: StuckSession[] = [];
  const recovered: StuckSession[] = [];
  for (const [key, session] of current) {
    if (!previous.has(key)) newlyStuck.push(session);
  }
  for (const [key, session] of previous) {
    if (!current.has(key)) recovered.push(session);
  }
  return { newlyStuck, recovered };
}

/**
 * Pull the current stuck-session state out of a gateway log tail. Returns a
 * Map keyed by `session_key` so diff is O(N).
 */
export function extractCurrentSessions(logTail: string): SandboxSessionState {
  const lines = logTail.split('\n').filter((line) => line.length > 0);
  const sessions = parseStuckSessions(lines);
  const map: SandboxSessionState = new Map();
  for (const session of sessions) {
    map.set(session.session_key, session);
  }
  return map;
}

/** Inputs the orchestrator hands to a monitor cycle. */
export interface MonitorCycleDeps {
  listRunningSandboxIds: () => Promise<string[]>;
  tailGatewayLog: (sandboxId: string) => Promise<string>;
  resolveAgentId: (sandboxId: string) => Promise<string | null>;
  emitEvent: (event: StuckSessionEvent) => Promise<void>;
  onError?: (sandboxId: string, error: unknown) => void;
}

/**
 * Run one poll cycle. Updates `state` in place and returns the list of events
 * actually emitted (for tests). The orchestrator calls this on a fixed
 * interval and the state map persists across cycles.
 */
export async function runMonitorCycle(
  state: Map<string, SandboxSessionState>,
  deps: MonitorCycleDeps,
): Promise<StuckSessionEvent[]> {
  const emitted: StuckSessionEvent[] = [];
  let sandboxIds: string[];
  try {
    sandboxIds = await deps.listRunningSandboxIds();
  } catch (err) {
    deps.onError?.('<list>', err);
    return emitted;
  }

  // Drop state for sandboxes that are no longer running so we don't leak
  // memory and so a sandbox restart starts from a clean slate.
  const liveSet = new Set(sandboxIds);
  for (const known of state.keys()) {
    if (!liveSet.has(known)) state.delete(known);
  }

  for (const sandboxId of sandboxIds) {
    let logTail: string;
    try {
      logTail = await deps.tailGatewayLog(sandboxId);
    } catch (err) {
      deps.onError?.(sandboxId, err);
      continue;
    }
    const previous = state.get(sandboxId) ?? new Map();
    const current = extractCurrentSessions(logTail);
    const { newlyStuck, recovered } = diffSessionStates(previous, current);

    if (newlyStuck.length === 0 && recovered.length === 0) {
      state.set(sandboxId, current);
      continue;
    }

    let agentId: string | null = null;
    if (newlyStuck.length > 0 || recovered.length > 0) {
      try {
        agentId = await deps.resolveAgentId(sandboxId);
      } catch (err) {
        deps.onError?.(sandboxId, err);
      }
    }

    for (const session of newlyStuck) {
      const event: StuckSessionEvent = { kind: 'session.stuck', sandbox_id: sandboxId, agent_id: agentId, session };
      try {
        await deps.emitEvent(event);
        emitted.push(event);
      } catch (err) {
        deps.onError?.(sandboxId, err);
      }
    }
    for (const session of recovered) {
      const event: StuckSessionEvent = { kind: 'session.recovered', sandbox_id: sandboxId, agent_id: agentId, session };
      try {
        await deps.emitEvent(event);
        emitted.push(event);
      } catch (err) {
        deps.onError?.(sandboxId, err);
      }
    }

    state.set(sandboxId, current);
  }

  return emitted;
}

/** Default poll interval — matches the runtime's stuck-session diagnostic emit cadence. */
export const DEFAULT_POLL_INTERVAL_MS = 30_000;

export interface StartMonitorOptions {
  intervalMs?: number;
  deps: MonitorCycleDeps;
  onCycleError?: (error: unknown) => void;
}

export interface MonitorHandle {
  stop: () => void;
  /** For tests — run a single cycle synchronously instead of waiting for the interval. */
  triggerCycle: () => Promise<StuckSessionEvent[]>;
}

/**
 * Start the monitor. Runs an immediate first cycle, then schedules subsequent
 * cycles on `intervalMs`. Returns a handle for stop/test control.
 */
export function startStuckSessionMonitor(opts: StartMonitorOptions): MonitorHandle {
  const intervalMs = opts.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const state = new Map<string, SandboxSessionState>();
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const runCycle = async (): Promise<StuckSessionEvent[]> => {
    if (stopped) return [];
    try {
      return await runMonitorCycle(state, opts.deps);
    } catch (err) {
      opts.onCycleError?.(err);
      return [];
    }
  };

  const scheduleNext = (): void => {
    if (stopped) return;
    timer = setTimeout(async () => {
      await runCycle();
      scheduleNext();
    }, intervalMs);
  };

  // Kick off the first cycle without awaiting so callers don't block startup.
  void runCycle().then(scheduleNext);

  return {
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
    triggerCycle: runCycle,
  };
}
