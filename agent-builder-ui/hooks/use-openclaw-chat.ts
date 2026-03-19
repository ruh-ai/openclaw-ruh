import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";
import { sendToArchitectStreaming } from "@/lib/openclaw/api";
import {
  ChatMessage,
  ArchitectResponse,
  SkillGraphNode,
  WorkflowDefinition,
} from "@/lib/openclaw/types";

interface OpenClawChatState {
  sessionId: string;
  messages: ChatMessage[];
  isLoading: boolean;
  statusMessage: string;
  skillGraph: SkillGraphNode[] | null;
  workflow: WorkflowDefinition | null;
  systemName: string | null;
  error: string | null;

  sendMessage: (text: string) => Promise<void>;
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

export const useOpenClawChat = create<OpenClawChatState>((set, get) => ({
  sessionId: uuidv4(),
  messages: createInitialMessages(),
  isLoading: false,
  statusMessage: "",
  skillGraph: null,
  workflow: null,
  systemName: null,
  error: null,

  sendMessage: async (text: string) => {
    const { sessionId, isLoading } = get();
    if (isLoading || !text.trim()) return;

    // Add user message
    const userMessage: ChatMessage = {
      id: uuidv4(),
      role: "user",
      content: text.trim(),
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
        text.trim(),
        {
          onStatus: (_phase: string, message: string) => {
            set({ statusMessage: message });
          },
        }
      );

      // Process response based on type
      const architectMessage: ChatMessage = {
        id: uuidv4(),
        role: "architect",
        content: "",
        timestamp: new Date().toISOString(),
      };

      switch (response.type) {
        case "clarification":
          architectMessage.content =
            response.questions?.join("\n\n") ||
            response.content ||
            "Could you provide more details?";
          break;

        case "ready_for_review":
          if (response.skill_graph) {
            set({
              skillGraph: response.skill_graph.nodes,
              workflow: response.skill_graph.workflow,
              systemName: response.skill_graph.system_name,
            });
            architectMessage.content = `I've analyzed your requirements and generated a skill graph with ${response.skill_graph.nodes.length} skills. Click "Proceed to Review" to see the full breakdown.`;
          } else {
            architectMessage.content =
              response.content || "Analysis complete.";
          }
          break;

        case "agent_response":
          architectMessage.content =
            response.content || "I'm processing your request...";
          break;

        case "error":
          architectMessage.content =
            response.content ||
            response.error ||
            "Something went wrong. Please try again.";
          set({ error: response.error || null });
          break;

        default:
          architectMessage.content =
            response.content || "Response received.";
      }

      set((state) => ({
        messages: [...state.messages, architectMessage],
        isLoading: false,
        statusMessage: "",
      }));
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : "Unknown error";

      const errorMessage: ChatMessage = {
        id: uuidv4(),
        role: "architect",
        content: `Unable to reach the architect agent. Please ensure the OpenClaw gateway is running.\n\nError: ${errorMsg}`,
        timestamp: new Date().toISOString(),
      };

      set((state) => ({
        messages: [...state.messages, errorMessage],
        isLoading: false,
        statusMessage: "",
        error: errorMsg,
      }));
    }
  },

  reset: () => {
    set({
      sessionId: uuidv4(),
      messages: createInitialMessages(),
      isLoading: false,
      statusMessage: "",
      skillGraph: null,
      workflow: null,
      systemName: null,
      error: null,
    });
  },
}));
