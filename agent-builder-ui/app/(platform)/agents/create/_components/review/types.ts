export type TriggerItem = { icon: "calendar" | "heart"; text: string };

export interface AgentData {
  name: string;
  rules: string[];
  skills: string[];
  triggers: TriggerItem[];
  accessTeams: string[];
}
