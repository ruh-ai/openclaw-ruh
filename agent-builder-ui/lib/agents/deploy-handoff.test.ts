import { describe, expect, test } from "bun:test";

import {
  buildCreateDeployHref,
  resolveImproveAgentCompletionHref,
  shouldAutoStartCreateDeploy,
  buildReflectHref,
} from "./deploy-handoff";

describe("deploy handoff helpers", () => {
  test("builds a create-source deploy route that autostarts only when ready", () => {
    expect(buildCreateDeployHref("agent-ready", true)).toBe(
      "/agents/agent-ready/deploy?source=create&autoStart=1",
    );
    expect(buildCreateDeployHref("agent-blocked", false)).toBe(
      "/agents/agent-blocked/deploy?source=create",
    );
  });

  test("autostarts only for create-source handoffs that explicitly request it", () => {
    expect(shouldAutoStartCreateDeploy("create", "1")).toBe(true);
    expect(shouldAutoStartCreateDeploy("create", null)).toBe(false);
    expect(shouldAutoStartCreateDeploy("list", "1")).toBe(false);
  });

  test("buildReflectHref encodes agentId into reflect stage URL", () => {
    expect(buildReflectHref("agent-123")).toBe(
      "/agents/create?stage=reflect&agentId=agent-123",
    );
    expect(buildReflectHref("special/agent")).toContain("agentId=special%2Fagent");
  });

  test("routes undeployed existing agents into deploy and deployed agents back to the list", () => {
    expect(resolveImproveAgentCompletionHref("agent-empty", [], true)).toBe(
      "/agents/agent-empty/deploy?source=create&autoStart=1",
    );
    expect(resolveImproveAgentCompletionHref("agent-empty", [], false)).toBe(
      "/agents/agent-empty/deploy?source=create",
    );
    expect(resolveImproveAgentCompletionHref("agent-live", ["sandbox-1"], true)).toBe("/agents");
  });
});
