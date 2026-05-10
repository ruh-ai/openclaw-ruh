/**
 * interjectQueue.ts — Per-agent in-memory interject queue.
 *
 * @kb: 008-agent-builder-ui SPEC-pair-programmer-iteration-loop
 *
 * Phase 2.1.f — when the iteration loop is running and the user types a
 * message in the builder chat, the frontend POSTs it to /api/agents/:id/interjects
 * instead of going through the chat session. Each iteration of the loop
 * drains this queue and prepends the messages to the next per-skill prompt
 * as a [USER FEEDBACK] block. This delivers mid-flight steering without
 * needing the architect to expose a new gateway tool — the iteration loop
 * orchestrator (backend code, not LLM) handles the queue.
 *
 * Volatile by design: queues live for the duration of a build and don't
 * survive a backend restart. If the build is interrupted, queued messages
 * are lost — the user can re-type. Worth re-evaluating when telemetry
 * shows the loss rate matters; until then the simpler in-memory shape is
 * easier to reason about.
 */

const queues = new Map<string, string[]>();

/**
 * Append a message to the agent's interject queue. Returns the new queue depth.
 * No-ops on empty/whitespace messages.
 */
export function pushInterject(agentId: string, message: string): number {
  const trimmed = message.trim();
  if (!trimmed) return queues.get(agentId)?.length ?? 0;
  const list = queues.get(agentId) ?? [];
  list.push(trimmed);
  queues.set(agentId, list);
  return list.length;
}

/**
 * Return all queued messages for the agent and clear the queue. Empty
 * array if no messages or the agent has no entry. Safe to call repeatedly.
 */
export function drainInterjects(agentId: string): string[] {
  const list = queues.get(agentId);
  if (!list || list.length === 0) return [];
  queues.delete(agentId);
  return list;
}

/**
 * Read the current queue depth without clearing it. Used by GET endpoints
 * that report status without consuming.
 */
export function peekInterjectCount(agentId: string): number {
  return queues.get(agentId)?.length ?? 0;
}

/** Test-only: discard all queues. Used by unit tests for isolation. */
export function _resetAllInterjectsForTest(): void {
  queues.clear();
}
