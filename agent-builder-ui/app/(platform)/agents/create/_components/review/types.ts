import type { AgentImprovement } from "@/lib/agents/types";
import type { AgentToolConnectionStatus, AgentTriggerKind, AgentTriggerStatus } from "@/lib/agents/types";

export type TriggerItem = {
  id?: string;
  icon: "calendar" | "heart";
  text: string;
  kind?: AgentTriggerKind;
  status?: AgentTriggerStatus;
  statusLabel?: string;
  detail?: string;
};

export type ToolConnectionItem = {
  id: string;
  name: string;
  description: string;
  status: AgentToolConnectionStatus;
  statusLabel: string;
  detail: string;
  planNotes?: string[];
  sources?: { title: string; url: string }[];
};

export interface AgentData {
  name: string;
  rules: string[];
  skills: string[];
  toolConnections: ToolConnectionItem[];
  triggers: TriggerItem[];
  improvements: AgentImprovement[];
  accessTeams: string[];
}
