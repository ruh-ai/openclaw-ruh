/**
 * tab-settings.test.ts — Verify TabSettings component exports.
 */
import { describe, expect, test, mock } from "bun:test";

mock.module("@/hooks/use-agents-store", () => ({
  useAgentsStore: () => ({
    agents: [],
    updateAgent: mock(() => Promise.resolve()),
  }),
}));

mock.module("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => null,
}));

mock.module("@/components/ui/input", () => ({
  Input: (props: any) => null,
}));

mock.module("@/lib/openclaw/shared-codex", () => ({
  getSharedCodexDisplayModel: () => "gpt-4",
  isSharedCodexSandbox: () => false,
  sanitizeAgentModelForSandbox: (m: string) => m,
}));

mock.module("@/lib/auth/backend-fetch", () => ({
  fetchBackendWithAuth: mock(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) })),
}));

describe("TabSettings", () => {
  test("exports TabSettings as a named export", async () => {
    const mod = await import("../_components/TabSettings");
    expect(mod.TabSettings).toBeDefined();
    expect(typeof mod.TabSettings).toBe("function");
  });
});
