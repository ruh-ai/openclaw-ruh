export type OpenClawRequestMode = "build" | "test" | "copilot" | "agent" | "reveal";

export interface OpenClawTestOptions {
  mode?: OpenClawRequestMode;
  soulOverride?: string;
}

export function buildGatewaySessionKey(
  agentId: string,
  sessionId: string,
  mode: OpenClawRequestMode = "build"
): string {
  if (mode === "test") {
    return `agent:test:${sessionId}`;
  }

  if (mode === "copilot") {
    return `agent:copilot:${sessionId}`;
  }

  if (mode === "agent") {
    return `agent:main:${sessionId}`;
  }

  if (mode === "reveal") {
    // Per-session key so concurrent reveals don't share context.
    return `agent:reveal:${sessionId}`;
  }

  return `agent:${agentId}:${sessionId}`;
}

export function buildGatewayUserMessage(
  message: string,
  { mode = "build", soulOverride }: OpenClawTestOptions = {}
): string {
  // In test + reveal modes, a caller-supplied SOUL override is injected ahead
  // of the user prompt so the sandbox architect follows a per-turn system
  // instruction instead of its persistent SOUL.md. Outside these modes,
  // soul_override is ignored.
  // Note: the Reveal stage itself no longer relies on this path — it uses
  // the lifecycle-aware SOUL.md (see ruh-backend/src/sandboxManager.ts) with
  // a [PHASE: reveal] header on the user message. This escape hatch remains
  // for eval/test harnesses that still need per-turn system overrides.
  const acceptsSystemOverride = mode === "test" || mode === "reveal";
  if (!acceptsSystemOverride || !soulOverride?.trim()) {
    return message;
  }

  return `[SYSTEM]\n${soulOverride.trim()}\n\n[USER]\n${message}`;
}
