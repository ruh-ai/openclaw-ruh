export type OpenClawRequestMode = "build" | "test";

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
