export type SkillSource = "clawhub" | "skills_sh" | "custom" | "data_ingestion";
export type SkillNodeStatus =
  | "found"
  | "generating"
  | "generated"
  | "approved"
  | "rejected"
  | "always_included";

export interface SkillGraphNode {
  skill_id: string;
  name: string;
  source: SkillSource;
  status: SkillNodeStatus;
  depends_on: string[];
  description?: string;
}

export interface WorkflowStep {
  id: string;
  action: string;
  skill: string;
  wait_for: string[];
}

export interface WorkflowDefinition {
  name: string;
  description: string;
  steps: WorkflowStep[];
}

export interface ArchitectResponse {
  type:
    | "clarification"
    | "ready_for_review"
    | "agent_response"
    | "deploy_complete"
    | "build_complete"
    | "error";
  content?: string;
  questions?: string[];
  skill_graph?: {
    system_name: string;
    nodes: SkillGraphNode[];
    workflow: WorkflowDefinition;
  };
  deployment?: { repo_url: string };
  error?: string;
  adapter_availability?: Record<
    string,
    { source_type: string; has_adapter: boolean; access_method: string }
  >;
}

export interface ChatMessage {
  id: string;
  role: "user" | "architect";
  content: string;
  timestamp: string;
}

export interface LifecycleEvent {
  phase: string;
  message: string;
  detail?: string;
}
