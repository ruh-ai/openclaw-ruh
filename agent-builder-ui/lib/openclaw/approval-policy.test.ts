import { describe, expect, test } from "bun:test";

import { evaluateApprovalRequest } from "./approval-policy";

describe("approval-policy", () => {
  test("build mode auto-allows narrow read-only inspection requests", () => {
    const result = evaluateApprovalRequest(
      {
        id: "approval-read",
        tool: "list_files",
        command: "ls src",
      },
      {
        mode: "build",
        idFactory: () => "generated-id",
      },
    );

    expect(result).toEqual({
      decision: "allow",
      toolName: "list_files",
      autoAllowedEvent: {
        approvalId: "approval-read",
        toolName: "list_files",
        decision: "allow",
        message: "Auto-allowed safe tool request for list_files.",
        summary: "ls src",
        justification: undefined,
        policyReason:
          "Only a narrow set of read-only inspection tools are auto-allowed in the builder bridge.",
      },
    });
  });

  test("build mode denies file-writing requests", () => {
    const result = evaluateApprovalRequest(
      {
        id: "approval-write",
        tool: "apply_patch",
        command: "apply_patch <<'PATCH'",
      },
      {
        mode: "build",
      },
    );

    expect(result).toMatchObject({
      decision: "deny",
      toolName: "apply_patch",
      deniedEvent: {
        approvalId: "approval-write",
        decision: "deny",
      },
    });
  });

  test("copilot mode allows developer file writes but still blocks deploy", () => {
    expect(
      evaluateApprovalRequest(
        {
          id: "approval-copilot-write",
          tool: "apply_patch",
          command: "apply_patch <<'PATCH'",
        },
        { mode: "copilot" },
      ),
    ).toMatchObject({
      decision: "allow",
      toolName: "apply_patch",
    });

    expect(
      evaluateApprovalRequest(
        {
          id: "approval-copilot-deploy",
          tool: "deploy_agent",
          command: "deploy --production",
        },
        { mode: "copilot" },
      ),
    ).toMatchObject({
      decision: "deny",
      toolName: "deploy_agent",
    });
  });

  test("agent mode auto-allows all tool executions inside the user's sandbox", () => {
    expect(
      evaluateApprovalRequest(
        {
          id: "approval-agent",
          tool: "deploy_agent",
          command: "deploy --production",
        },
        { mode: "agent" },
      ),
    ).toMatchObject({
      decision: "allow",
      toolName: "deploy_agent",
    });
  });
});
