import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";
import { sendToArchitectStreaming } from "@/lib/openclaw/api";
import {
  ChatMessage,
  ArchitectResponse,
  SkillGraphNode,
  WorkflowDefinition,
} from "@/lib/openclaw/types";

/** Delay before first poll, then between retries */
const POLL_INITIAL_DELAY = 8000;
const POLL_RETRY_DELAY = 5000;
const POLL_MAX_RETRIES = 3;

interface OpenClawChatState {
  sessionId: string;
  messages: ChatMessage[];
  isLoading: boolean;
  statusMessage: string;
  skillGraph: SkillGraphNode[] | null;
  workflow: WorkflowDefinition | null;
  systemName: string | null;
  error: string | null;
  /** Tracks whether we're waiting for a long-running build/deploy */
  awaitingCompletion: "build" | "deploy" | null;

  sendMessage: (text: string, displayContent?: string) => Promise<void>;
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

// Track poll timer outside zustand to avoid serialization issues
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let pollRetryCount = 0;

function clearPollTimer() {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
  pollRetryCount = 0;
}

/**
 * Detect if a response text contains build_started or deploy (github_push) markers.
 * Checks both raw JSON markers and human-readable text patterns.
 */
function detectAwaitingPhase(content: string): "build" | "deploy" | null {
  if (!content) return null;
  // Check for deploy markers first — more specific
  if (
    (content.includes('"type": "build_progress"') &&
      content.includes('"phase": "github_push"')) ||
    content.includes("Deploying to GitHub")
  ) {
    return "deploy";
  }
  // Check for build markers — both JSON and human-readable
  if (
    content.includes('"type": "build_started"') ||
    content.includes("Build started") ||
    content.includes("Waiting for builder to complete")
  ) {
    return "build";
  }
  return null;
}

/**
 * Check if a response indicates completion of a build/deploy.
 */
function isCompletionResponse(
  content: string,
  phase: "build" | "deploy"
): boolean {
  if (phase === "build") {
    return (
      content.includes("Build complete") ||
      content.includes("build_complete") ||
      content.includes("is ready") ||
      content.includes("What I Built") ||
      content.includes("Build complete!")
    );
  }
  if (phase === "deploy") {
    return (
      content.includes("It's done") ||
      content.includes("is live at") ||
      content.includes("deploy_complete") ||
      // Match actual GitHub URLs like github.com/user/repo, not just "github.com" in text
      /github\.com\/[\w-]+\/[\w-]+/.test(content)
    );
  }
  return false;
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
  awaitingCompletion: null,

  sendMessage: async (text: string, displayContent?: string) => {
    const { sessionId, isLoading } = get();
    if (isLoading || !text.trim()) return;

    // Add user message — use displayContent for chat bubble if provided
    const userMessage: ChatMessage = {
      id: uuidv4(),
      role: "user",
      content: displayContent || text.trim(),
      timestamp: new Date().toISOString(),
    };

    set((state) => ({
      messages: [...state.messages, userMessage],
      isLoading: true,
      statusMessage: "Processing your inputs...",
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

      // Detect if this response indicates a build/deploy in progress
      const contentToCheck = response.content || architectMessage.content;
      const awaitingPhase = detectAwaitingPhase(contentToCheck);
      set((state) => ({
        messages: [...state.messages, architectMessage],
        isLoading: false,
        statusMessage: "",
        awaitingCompletion: awaitingPhase,
      }));

      // If build/deploy detected, start auto-polling
      if (awaitingPhase) {
        startPolling(awaitingPhase);
      }
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
    clearPollTimer();
    set({
      sessionId: uuidv4(),
      messages: createInitialMessages(),
      isLoading: false,
      statusMessage: "",
      skillGraph: null,
      workflow: null,
      systemName: null,
      error: null,
      awaitingCompletion: null,
    });
  },
}));

/**
 * Start auto-polling the agent for build/deploy completion.
 * Shows a loading spinner with hourglass status while waiting.
 */
function startPolling(phase: "build" | "deploy") {
  clearPollTimer();
  pollRetryCount = 0;
  const statusLabel =
    phase === "build"
      ? "Waiting for build to complete..."
      : "Waiting for deployment to finish...";

  // Set awaiting state with loading indicator
  useOpenClawChat.setState({
    awaitingCompletion: phase,
    statusMessage: statusLabel,
  });

  const poll = () => {
    pollRetryCount++;

    if (pollRetryCount > POLL_MAX_RETRIES) {
      // Max attempts reached — show error and stop
      const errorMessage: ChatMessage = {
        id: uuidv4(),
        role: "architect",
        content:
          phase === "build"
            ? "Build is taking longer than expected. Please ask me to check again."
            : "Deployment is taking longer than expected. Please ask me to check again.",
        timestamp: new Date().toISOString(),
      };
      useOpenClawChat.setState((state) => ({
        messages: [...state.messages, errorMessage],
        awaitingCompletion: null,
        statusMessage: "",
      }));
      clearPollTimer();
      return;
    }

    const checkMessage =
      phase === "build"
        ? "Check if the build is complete"
        : "Check if the deployment is complete";

    const { sessionId, isLoading } = useOpenClawChat.getState();
    if (isLoading) {
      // User-initiated request in progress, retry later
      pollTimer = setTimeout(poll, POLL_RETRY_DELAY);
      return;
    }

    // Don't set isLoading — keep showing the hourglass, not the Ruh spinner
    sendToArchitectStreaming(sessionId, checkMessage)
      .then((response) => {
        const content = response.content || "";

        const architectMessage: ChatMessage = {
          id: uuidv4(),
          role: "architect",
          content: content || "Checking...",
          timestamp: new Date().toISOString(),
        };

        // Handle specific response types
        if (response.type === "build_complete" || response.type === "deploy_complete") {
          useOpenClawChat.setState((state) => ({
            messages: [...state.messages, architectMessage],
            statusMessage: "",
            awaitingCompletion: null,
          }));
          clearPollTimer();
          return;
        }

        // Check content for completion signals
        if (isCompletionResponse(content, phase)) {
          useOpenClawChat.setState((state) => ({
            messages: [...state.messages, architectMessage],
            statusMessage: "",
            awaitingCompletion: null,
          }));
          clearPollTimer();
          return;
        }

        // Not complete yet — schedule next poll (keep hourglass showing)
        pollTimer = setTimeout(poll, POLL_RETRY_DELAY);
      })
      .catch(() => {
        // Error polling — retry (keep hourglass showing)
        pollTimer = setTimeout(poll, POLL_RETRY_DELAY);
      });
  };

  // First poll after initial delay
  pollTimer = setTimeout(poll, POLL_INITIAL_DELAY);
}
