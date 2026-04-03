// Parses agent response content to extract embedded JSON from markdown code blocks.
// Agent responses arrive as `type: "agent_response"` with JSON inside ```json ... ``` blocks.

export interface ClarificationQuestion {
  id: string;
  question: string;
  options?: string[];
  type?: string;
  example?: string;
  required?: boolean;
  multiple?: boolean;
}

export interface ParsedClarification {
  type: "clarification";
  questions: ClarificationQuestion[];
}

export interface AgentMetadata {
  agent_name: string;
  agent_id: string;
  avatar: string;
  tone?: string;
  domain?: string;
  primary_users?: string;
  automation_type?: string;
  schedule_description?: string;
  cron_expression?: string;
}

export interface ReviewSkillNode {
  skill_id: string;
  name: string;
  source: string;
  status: string;
  depends_on: string[];
  description?: string;
}

export interface ReviewOutput {
  type: string;
  description?: string;
  example?: string;
  schedule?: string;
}

export interface ParsedReviewData {
  type: "ready_for_review";
  agent_metadata: AgentMetadata;
  skill_graph: {
    system_name: string;
    description?: string;
    nodes: ReviewSkillNode[];
    workflow: {
      name?: string;
      description?: string;
      steps: Array<string | { id: string; action: string; skill: string; wait_for: string[] }>;
    };
    agents?: Array<{ id: string; skills: string[] }>;
  };
  adapter_availability?: Record<
    string,
    { source_type: string; has_adapter: boolean; access_method: string }
  >;
  required_env_vars?: string[];
  outputs?: ReviewOutput[];
  implementation?: Record<string, string>;
}

export type ParsedJSON = ParsedClarification | ParsedReviewData;

export interface ParsedContent {
  before: string;
  json: ParsedJSON | null;
  after: string;
}

const JSON_BLOCK_REGEX = /```json\s*\n([\s\S]*?)```/;

export function parseAgentContent(content: string): ParsedContent {
  const match = content.match(JSON_BLOCK_REGEX);

  if (!match) {
    return { before: content, json: null, after: "" };
  }

  const rawJSON = match[1].trim();
  const matchIndex = match.index!;
  const before = content.slice(0, matchIndex).trim();
  const after = content.slice(matchIndex + match[0].length).trim();

  try {
    const parsed = JSON.parse(rawJSON);

    if (
      parsed &&
      typeof parsed === "object" &&
      (parsed.type === "clarification" || parsed.type === "ready_for_review")
    ) {
      return { before, json: parsed as ParsedJSON, after };
    }

    // Valid JSON but not a recognized type — treat as plain text
    return { before: content, json: null, after: "" };
  } catch {
    // Invalid JSON — render as plain markdown
    return { before: content, json: null, after: "" };
  }
}
