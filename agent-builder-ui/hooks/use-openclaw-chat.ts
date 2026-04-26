import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";
import { sendToArchitectStreaming } from "@/lib/openclaw/api";
import {
  ApprovalEvent,
  ChatMessage,
  ClarificationQuestion,
  ArchitectResponse,
  SkillGraphNode,
  WorkflowDefinition,
} from "@/lib/openclaw/types";

interface InitializeAgentData {
  name: string;
  skillGraph?: SkillGraphNode[] | null;
  workflow?: WorkflowDefinition | null;
  agentRules?: string[];
}

interface OpenClawChatState {
  sessionId: string;
  messages: ChatMessage[];
  approvalEvents: ApprovalEvent[];
  isLoading: boolean;
  statusMessage: string;
  skillGraph: SkillGraphNode[] | null;
  workflow: WorkflowDefinition | null;
  systemName: string | null;
  agentRules: string[];
  error: string | null;

  sendMessage: (text: string) => Promise<void>;
  initialize: (agent: InitializeAgentData) => void;
  reset: () => void;
}

const GREETING =
  "Hi! I'm the Ruh AI agent builder. Tell me what you'd like your agent to do — I'll ask follow-up questions to understand your requirements, then generate a complete skill graph for your agent.";

function createInitialMessages(): ChatMessage[] {
  return [
    {
      id: uuidv4(),
      role: "architect",
      content: GREETING,
      timestamp: new Date().toISOString(),
    },
  ];
}

// ---------------------------------------------------------------------------
// Normalize the workflow field — gateway may return null or a WorkflowDefinition.
// ---------------------------------------------------------------------------
function normalizeWorkflow(
  rawWorkflow: WorkflowDefinition | null | undefined,
  nodes: SkillGraphNode[],
  systemName: string | null
): WorkflowDefinition {
  if (!rawWorkflow) {
    // Gateway didn't provide a workflow — build a sequential one from the nodes
    return {
      name: "main-workflow",
      description: `${systemName || "agent"} workflow`,
      steps: nodes.map((node, i) => ({
        id: `step-${i}`,
        action: "execute",
        skill: node.skill_id,
        wait_for: i > 0 ? [nodes[i - 1].skill_id] : [],
      })),
    };
  }

  return rawWorkflow;
}

// ---------------------------------------------------------------------------
// Store — no persistence. The creation flow is a session, not long-term state.
// Persisting it was the root cause of stale-error loops: old crashes from a
// previous session would be rehydrated and the gateway's shared session context
// would keep replaying the broken response on every retry.
// ---------------------------------------------------------------------------
export const useOpenClawChat = create<OpenClawChatState>()((set, get) => ({
  sessionId: uuidv4(),
  messages: createInitialMessages(),
  approvalEvents: [],
  isLoading: false,
  statusMessage: "",
  skillGraph: null,
  workflow: null,
  systemName: null,
  agentRules: [],
  error: null,

  sendMessage: async (text: string) => {
    const trimmedText = text.trim();
    if (!trimmedText) return;

    inFlightRequest.abortController?.abort();

    const { sessionId } = get();
    const requestId = uuidv4();
    const abortController = new AbortController();
    inFlightRequest = { requestId, abortController };

    const userMessage: ChatMessage = {
      id: uuidv4(),
      role: "user",
      content: trimmedText,
      timestamp: new Date().toISOString(),
    };

    set((state) => ({
      messages: [...state.messages, userMessage],
      isLoading: true,
      statusMessage: "Connecting to agent...",
      error: null,
    }));

    try {
      const response: ArchitectResponse = await sendToArchitectStreaming(
        sessionId,
        trimmedText,
        {
          onStatus: (_phase: string, message: string) => {
            if (inFlightRequest.requestId !== requestId) {
              return;
            }

            set({ statusMessage: message });
          },
          onApprovalEvent: (approvalEvent) => {
            if (inFlightRequest.requestId !== requestId) {
              return;
            }

            set((state) => ({
              approvalEvents: [...state.approvalEvents, approvalEvent],
            }));
          },
        },
        {
          requestId,
          signal: abortController.signal,
        }
      );

      if (
        abortController.signal.aborted ||
        inFlightRequest.requestId !== requestId
      ) {
        return;
      }

      const architectMessage: ChatMessage = {
        id: uuidv4(),
        role: "architect",
        content: "",
        timestamp: new Date().toISOString(),
      };

      architectMessage.responseType = response.type;

      switch (response.type) {
        case "clarification": {
          const rawQs = response.questions ?? [];
          const normalised: ClarificationQuestion[] = rawQs.map((q, i) => {
            if (typeof q === "string") {
              return { id: `q-${i}`, question: q, type: "text" as const };
            }
            const qObj = q as Record<string, unknown>;
            return {
              id: (qObj.id as string) || `q-${i}`,
              question: (qObj.question as string) || String(q),
              type: (qObj.type as ClarificationQuestion["type"]) || "text",
              placeholder: qObj.placeholder as string | undefined,
              options: qObj.options as string[] | undefined,
              required: qObj.required as boolean | undefined,
            };
          });
          architectMessage.questions = normalised;
          architectMessage.clarificationContext =
            (response as unknown as Record<string, unknown>).context as string | undefined;
          architectMessage.content =
            normalised.map((q) => q.question).join("\n\n") ||
            response.content ||
            "Could you provide more details?";
          break;
        }

        case "ready_for_review": {
          if (response.skill_graph) {
            const systemName =
              response.system_name ||
              response.skill_graph.system_name ||
              (response.skill_graph.nodes[0]?.skill_id
                ? response.skill_graph.nodes[0].skill_id.replace(/_/g, "-").replace(/-skill$/, "")
                : null) ||
              null;

            const workflow = normalizeWorkflow(
              response.skill_graph.workflow,
              response.skill_graph.nodes,
              systemName
            );

            // Derive behaviour rules from agent_metadata / requirements
            const meta = response.agent_metadata;
            const reqs = response.requirements;
            const rules: string[] = [];
            if (meta?.tone) rules.push(`Communicate in a ${meta.tone} tone`);
            if (meta?.schedule_description) rules.push(`Schedule: ${meta.schedule_description}`);
            else if (meta?.cron_expression) rules.push(`Runs on cron: ${meta.cron_expression}`);
            else if (reqs?.schedule) rules.push(`Schedule: ${reqs.schedule}`);
            if (meta?.primary_users) rules.push(`Intended for: ${meta.primary_users}`);
            if (reqs?.required_env_vars && reqs.required_env_vars.length > 0) {
              rules.push(`Requires env: ${reqs.required_env_vars.join(", ")}`);
            }

            set({ skillGraph: response.skill_graph.nodes, workflow, systemName, agentRules: rules });
            architectMessage.content = `I've analysed your requirements and generated a skill graph with ${response.skill_graph.nodes.length} skills. Click "Proceed to Review" to see the full breakdown.`;
          } else {
            architectMessage.content = response.content || "Analysis complete.";
          }
          break;
        }

        case "agent_response":
          architectMessage.content = response.content || "I'm processing your request...";
          break;

        case "error":
          architectMessage.content =
            response.content || response.error || "Something went wrong. Please try again.";
          set({ error: response.error || null });
          break;

        default: {
          const raw = response as unknown as Record<string, unknown>;
          architectMessage.content =
            response.content ||
            (raw.message as string) ||
            (raw.context as string) ||
            JSON.stringify(response, null, 2);
          break;
        }
      }

      set((state) => ({
        messages: [...state.messages, architectMessage],
        isLoading: false,
        statusMessage: "",
      }));
    } catch (err) {
      if (
        abortController.signal.aborted ||
        inFlightRequest.requestId !== requestId ||
        (err instanceof Error && err.name === "AbortError")
      ) {
        return;
      }

      const errorMsg = err instanceof Error ? err.message : "Unknown error";

      const errorMessage: ChatMessage = {
        id: uuidv4(),
        role: "architect",
        content: `Unable to reach the architect agent. Please ensure the OpenClaw gateway is running.\n\nError: ${errorMsg}`,
        timestamp: new Date().toISOString(),
      };

      // Rotate the sessionId on error so the next message gets a fresh gateway
      // session. This breaks any loop where a broken gateway response keeps
      // replaying because the old session still has that context.
      set((state) => ({
        messages: [...state.messages, errorMessage],
        isLoading: false,
        statusMessage: "",
        error: errorMsg,
        sessionId: uuidv4(),
      }));
    } finally {
      if (inFlightRequest.requestId === requestId) {
        inFlightRequest = {
          requestId: null,
          abortController: null,
        };
      }
    }
  },

  initialize: (agent: InitializeAgentData) => {
    const skillList =
      agent.skillGraph?.map((n) => n.name || n.skill_id).join(", ") ?? "no skills yet";
    const contextMsg: ChatMessage = {
      id: uuidv4(),
      role: "architect",
      content: `I'm ready to help you improve **${agent.name}**. Current skills: ${skillList}.\n\nTell me what you'd like to change — add skills, update the rules, rename it, or anything else.`,
      timestamp: new Date().toISOString(),
    };
    set({
      sessionId: uuidv4(),
      messages: [contextMsg],
      approvalEvents: [],
      skillGraph: agent.skillGraph ?? null,
      workflow: agent.workflow ?? null,
      systemName: agent.name,
      agentRules: agent.agentRules ?? [],
      isLoading: false,
      statusMessage: "",
      error: null,
    });
  },

  reset: () => {
    inFlightRequest.abortController?.abort();
    inFlightRequest = {
      requestId: null,
      abortController: null,
    };

    set({
      sessionId: uuidv4(),
      messages: createInitialMessages(),
      approvalEvents: [],
      isLoading: false,
      statusMessage: "",
      skillGraph: null,
      workflow: null,
      systemName: null,
      agentRules: [],
      error: null,
    });
  },
}));

let inFlightRequest: {
  requestId: string | null;
  abortController: AbortController | null;
} = {
  requestId: null,
  abortController: null,
};
