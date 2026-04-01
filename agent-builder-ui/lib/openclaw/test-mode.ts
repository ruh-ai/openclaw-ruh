export type OpenClawRequestMode = "build" | "test" | "copilot" | "agent";

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

  return `agent:${agentId}:${sessionId}`;
}

export function buildGatewayUserMessage(
  message: string,
  { mode = "build", soulOverride }: OpenClawTestOptions = {}
): string {
  if (mode !== "test" || !soulOverride?.trim()) {
    return message;
  }

  return `[SYSTEM]\n${soulOverride.trim()}\n\n[USER]\n${message}`;
}
