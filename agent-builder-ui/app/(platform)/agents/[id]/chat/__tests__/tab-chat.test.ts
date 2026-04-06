/**
 * tab-chat.test.ts — Verify TabChat component exports.
 */
import { describe, expect, test, mock } from "bun:test";

// --- Mocks ---

mock.module("next/navigation", () => ({
  useRouter: () => ({ push: mock(() => {}), replace: mock(() => {}) }),
  usePathname: () => "/agents/123/chat",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ id: "agent-123" }),
}));

mock.module("next/image", () => ({
  default: (props: any) => null,
}));

mock.module("@/hooks/use-agents-store", () => ({
  useAgentsStore: () => ({
    agents: [],
    saveAgentDraft: mock(() => Promise.resolve({})),
  }),
}));

mock.module("@/lib/openclaw/ag-ui/use-agent-chat", () => ({
  useAgentChat: () => ({
    messages: [],
    liveResponse: "",
    isLoading: false,
    sendMessage: mock(() => {}),
    steps: [],
    liveBrowserState: null,
    taskPlan: null,
    editorFile: null,
    recentEditorFiles: [],
    detectedPreviewPorts: [],
    workspaceFilesTick: 0,
    conversationId: null,
    liveSteps: [],
    setConversationId: mock(() => {}),
  }),
}));

mock.module("@/lib/openclaw/browser-workspace", () => ({
  createEmptyBrowserWorkspaceState: () => ({ items: [], takeover: null }),
}));

mock.module("@/lib/openclaw/task-plan-parser", () => ({
  stripPlanTags: (s: string) => s,
}));

mock.module("@/lib/openclaw/copilot-flow", () => ({
  hasPurposeMetadata: () => false,
}));

mock.module("@/lib/openclaw/copilot-state", () => ({
  useCoPilotStore: () => ({
    phase: "purpose",
    devStage: null,
    setPhase: mock(() => {}),
  }),
}));

mock.module("@/lib/openclaw/builder-chat-suggestions", () => ({
  buildBuilderChatSuggestions: () => [],
}));

mock.module("@/app/(platform)/agents/create/_components/MessageContent", () => ({
  default: () => null,
}));

mock.module("@/app/(platform)/agents/create/_components/AgentConfigPanel", () => ({
  AgentConfigPanel: () => null,
}));

mock.module("@/app/(platform)/agents/create/_components/ClarificationMessage", () => ({
  ClarificationMessage: () => null,
}));

mock.module("@/app/(platform)/agents/create/_components/copilot/WizardStepRenderer", () => ({
  WizardStepRenderer: () => null,
}));

mock.module("@/app/(platform)/agents/create/_components/copilot/LifecycleStepRenderer", () => ({
  LifecycleStepRenderer: () => null,
  getStageInputPlaceholder: () => "",
}));

mock.module("@/app/(platform)/agents/create/_components/AnimatedRuhLogo", () => ({
  AnimatedRuhLogo: () => null,
}));

mock.module("../_components/BrowserPanel", () => ({ default: () => null }));
mock.module("../_components/FilesPanel", () => ({ default: () => null }));
mock.module("../_components/PreviewPanel", () => ({ default: () => null }));
mock.module("../_components/TaskPlanPanel", () => ({ default: () => null }));
mock.module("../_components/TaskProgressHeader", () => ({ default: () => null }));
mock.module("../_components/TaskProgressFooter", () => ({ default: () => null }));
mock.module("../_components/CodeEditorPanel", () => ({ default: () => null }));
mock.module("../_components/tab-workspace-autoswitch", () => ({
  shouldAutoSwitchWorkspaceTab: () => null,
}));

describe("TabChat", () => {
  test("exports TabChat as a named export", async () => {
    const mod = await import("../_components/TabChat");
    expect(mod.TabChat).toBeDefined();
    expect(typeof mod.TabChat).toBe("function");
  });
});
