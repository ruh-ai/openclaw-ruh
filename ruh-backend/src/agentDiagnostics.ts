/**
 * Agent diagnostics — one-shot view of "what is happening with this agent."
 *
 * Surfaced via GET /api/agents/:id/diagnostics so debugging a stuck agent is
 * a single request instead of: query Postgres for forge_stage, docker exec for
 * gateway log, walk three workspace paths, list processes, etc. (Today's pain.)
 *
 * The report combines:
 *   - DB state: agent.forge_stage, sandbox row (if any).
 *   - Container exec: workspace artifact listing + last N lines of the gateway
 *     log + parsed stuck-session diagnostics.
 *   - DB query: recent system_events for the agent.
 *
 * Parsing functions are pure (testable). I/O orchestration lives in the route
 * handler.
 */

export interface AgentLike {
  id: string;
  name: string | null;
  forge_stage: string | null;
  forge_sandbox_id: string | null;
  status: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface SandboxLike {
  sandbox_id: string;
  gateway_port: number | null;
  standard_url: string | null;
  approved: boolean;
  created_at: Date | string;
}

export interface SystemEventLike {
  event_id: string;
  occurred_at: Date | string;
  level: string;
  category: string;
  action: string;
  status: string;
  message: string;
}

export interface StuckSession {
  session_id: string;
  session_key: string;
  state: string;
  age_seconds: number;
  queue_depth: number;
}

export interface WorkspaceListing {
  discovery: string[];
  plan: string[];
  root: string[];
}

export interface AgentDiagnosticsReport {
  agent: {
    id: string;
    name: string | null;
    forge_stage: string | null;
    status: string | null;
    created_at: string;
    updated_at: string;
  };
  sandbox: {
    id: string;
    gateway_port: number | null;
    standard_url: string | null;
    approved: boolean;
    container_running: boolean | null;
    uptime_seconds: number | null;
  } | null;
  workspace_artifacts: {
    workspace: WorkspaceListing | null;
    workspace_copilot: WorkspaceListing | null;
    workspace_architect: WorkspaceListing | null;
  };
  stuck_sessions: StuckSession[];
  gateway_log_tail: string[];
  recent_system_events: Array<{
    occurred_at: string;
    level: string;
    category: string;
    action: string;
    status: string;
    message: string;
  }>;
  errors: string[];
}

/**
 * Parse `[diagnostic] stuck session:` log lines into structured records.
 * Example input line:
 *   2026-05-09T06:27:35.952+00:00 [diagnostic] stuck session: sessionId=copilot
 *   sessionKey=agent:copilot:copilot-plan:abc state=processing age=215s queueDepth=1
 */
export function parseStuckSessions(lines: string[]): StuckSession[] {
  const found: StuckSession[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    if (!line.includes('[diagnostic] stuck session')) continue;
    const sessionId = line.match(/sessionId=(\S+)/)?.[1] ?? '';
    const sessionKey = line.match(/sessionKey=(\S+)/)?.[1] ?? '';
    const state = line.match(/state=(\S+)/)?.[1] ?? 'unknown';
    const age = Number.parseInt(line.match(/age=(\d+)s/)?.[1] ?? '0', 10);
    const queueDepth = Number.parseInt(line.match(/queueDepth=(\d+)/)?.[1] ?? '0', 10);
    if (!sessionKey) continue;
    // Keep only the most recent (highest age) entry per session_key.
    const existingIdx = found.findIndex((s) => s.session_key === sessionKey);
    if (existingIdx >= 0) {
      if (age > found[existingIdx].age_seconds) {
        found[existingIdx] = { session_id: sessionId, session_key: sessionKey, state, age_seconds: age, queue_depth: queueDepth };
      }
      continue;
    }
    seen.add(sessionKey);
    found.push({ session_id: sessionId, session_key: sessionKey, state, age_seconds: age, queue_depth: queueDepth });
  }
  return found.sort((a, b) => b.age_seconds - a.age_seconds);
}

/**
 * Parse `ls` listing into a categorized listing per directory.
 * Input is the raw stdout of `ls /path/.openclaw/<dir>` (or `ls -1`).
 * Empty input -> empty list. ENOENT in the output -> empty list (the dir
 * doesn't exist yet on a fresh agent).
 */
export function parseLsListing(output: string): string[] {
  if (!output || output.includes('No such file or directory')) return [];
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('total ') && line !== '.' && line !== '..');
}

/**
 * Build the full per-workspace listing from a single combined ls output that
 * lists root + discovery + plan dirs. The shell command in the route handler
 * is expected to print three sections separated by `===<dir>===` markers.
 */
export function parseWorkspaceListing(output: string): WorkspaceListing | null {
  if (!output || output.trim() === '' || output.includes('No such file or directory')) {
    // Caller will distinguish "doesn't exist" (null) vs empty by seeing if
    // ANY section returned data.
    if (output.includes('No such file or directory') && !output.includes('===')) return null;
  }
  const root = extractSection(output, 'root');
  const discovery = extractSection(output, 'discovery');
  const plan = extractSection(output, 'plan');
  if (root === null && discovery === null && plan === null) return null;
  return {
    root: root ?? [],
    discovery: discovery ?? [],
    plan: plan ?? [],
  };
}

function extractSection(output: string, name: string): string[] | null {
  const startMarker = `===${name}===`;
  const startIdx = output.indexOf(startMarker);
  if (startIdx < 0) return null;
  const afterStart = output.slice(startIdx + startMarker.length);
  // Stop at next marker
  const nextMarkerIdx = afterStart.indexOf('===');
  const section = nextMarkerIdx >= 0 ? afterStart.slice(0, nextMarkerIdx) : afterStart;
  return parseLsListing(section);
}

/**
 * Shell command executed inside the sandbox to enumerate workspace artifacts.
 * Returns ls output for root + discovery + plan in each of the three workspace
 * paths, separated by `===<dir>===` markers parseable by parseWorkspaceListing.
 */
export function buildWorkspaceListingCommand(workspaceDir: string): string {
  const base = `/root/.openclaw/${workspaceDir}/.openclaw`;
  return [
    `echo "===root==="`,
    `ls -1 ${base}/ 2>&1 | grep -v -E "^(discovery|plan)$" || true`,
    `echo "===discovery==="`,
    `ls -1 ${base}/discovery/ 2>&1 || true`,
    `echo "===plan==="`,
    `ls -1 ${base}/plan/ 2>&1 || true`,
  ].join('; ');
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

/** Inputs the route handler gathers and hands to the report builder. */
export interface BuildDiagnosticsInputs {
  agent: AgentLike;
  sandbox: SandboxLike | null;
  containerInspect: { running: boolean; uptimeSeconds: number | null } | null;
  workspaceListings: {
    workspace: string | null;
    workspace_copilot: string | null;
    workspace_architect: string | null;
  };
  gatewayLogTail: string;
  systemEvents: SystemEventLike[];
  errors: string[];
}

export function buildAgentDiagnosticsReport(inputs: BuildDiagnosticsInputs): AgentDiagnosticsReport {
  const { agent, sandbox, containerInspect, workspaceListings, gatewayLogTail, systemEvents, errors } = inputs;
  const tailLines = gatewayLogTail
    ? gatewayLogTail.split('\n').filter((line) => line.length > 0)
    : [];
  return {
    agent: {
      id: agent.id,
      name: agent.name,
      forge_stage: agent.forge_stage,
      status: agent.status,
      created_at: toIsoString(agent.created_at),
      updated_at: toIsoString(agent.updated_at),
    },
    sandbox: sandbox
      ? {
          id: sandbox.sandbox_id,
          gateway_port: sandbox.gateway_port,
          standard_url: sandbox.standard_url,
          approved: sandbox.approved,
          container_running: containerInspect?.running ?? null,
          uptime_seconds: containerInspect?.uptimeSeconds ?? null,
        }
      : null,
    workspace_artifacts: {
      workspace: workspaceListings.workspace ? parseWorkspaceListing(workspaceListings.workspace) : null,
      workspace_copilot: workspaceListings.workspace_copilot ? parseWorkspaceListing(workspaceListings.workspace_copilot) : null,
      workspace_architect: workspaceListings.workspace_architect ? parseWorkspaceListing(workspaceListings.workspace_architect) : null,
    },
    stuck_sessions: parseStuckSessions(tailLines),
    gateway_log_tail: tailLines.slice(-50),
    recent_system_events: systemEvents.map((ev) => ({
      occurred_at: toIsoString(ev.occurred_at),
      level: ev.level,
      category: ev.category,
      action: ev.action,
      status: ev.status,
      message: ev.message,
    })),
    errors,
  };
}
