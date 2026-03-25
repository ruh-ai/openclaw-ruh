export type SkillSource = "clawhub" | "skills_sh" | "custom" | "data_ingestion" | "native_tool" | "existing";
export type SkillNodeStatus =
  | "found"
  | "generating"
  | "generated"
  | "approved"
  | "rejected"
  | "always_included"
  | "pending_approval";

export interface SkillGraphNode {
  skill_id: string;
  name: string;
  source: SkillSource;
  status: SkillNodeStatus;
  depends_on: string[];
  description?: string;
  native_tool?: string | null;
  requires_env?: string[];
  external_api?: string;
  note?: string;
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

export interface AgentMetadata {
  agent_name?: string;
  agent_id?: string;
  avatar?: string;
  tone?: string;
  domain?: string;
  primary_users?: string;
  automation_type?: string;
  schedule_description?: string;
  cron_expression?: string;
}

export interface AgentRequirements {
  description?: string;
  automation_type?: string;
  data_sources?: Array<{ source_type: string; access_method: string; skill_id?: string }>;
  outputs?: Array<{ type: string; format?: string }>;
  schedule?: string;
  required_env_vars?: string[];
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
  // Top-level fields (real architect JSON response)
  system_name?: string;
  description?: string;
  agent_metadata?: AgentMetadata;
  requirements?: AgentRequirements;
  skill_graph?: {
    system_name?: string; // present only in YAML-normalized path
    nodes: SkillGraphNode[];
    workflow: WorkflowDefinition | { steps: string[] };
    agents?: Array<{ id: string; skills: string[] }>;
  };
  deployment?: { repo_url: string };
  error?: string;
  adapter_availability?: Record<
    string,
    { source_type: string; has_adapter: boolean; access_method: string }
  >;
}

export interface ClarificationQuestion {
  id: string;
  question: string;
  type: "text" | "select" | "multiselect" | "boolean";
  placeholder?: string;
  options?: string[];
  required?: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "architect";
  content: string;
  timestamp: string;
  responseType?: ArchitectResponse["type"];
  questions?: ClarificationQuestion[];
  clarificationContext?: string;
}

export interface LifecycleEvent {
  phase: string;
  message: string;
  detail?: string;
}
