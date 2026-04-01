import type { ChatMode } from "@/lib/openclaw/ag-ui/types";

export type ForgeAgentMode = "building" | "live";

export function resolveCreatePageChatMode(agentMode: ForgeAgentMode): ChatMode {
  return agentMode === "live" ? "agent" : "builder";
}
