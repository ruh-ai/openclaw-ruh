export type CreateAgentMode = "copilot" | "chat";

export const CREATE_AGENT_MODE_OPTIONS = [
  { id: "copilot", label: "Co-Pilot" },
  { id: "chat", label: "Advanced" },
] as const;

export function normalizeCreateMode(mode: string | null | undefined): CreateAgentMode {
  return mode === "chat" ? "chat" : "copilot";
}
