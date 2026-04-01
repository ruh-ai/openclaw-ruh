import { randomUUID } from "crypto";

import type { OpenClawRequestMode } from "./test-mode";
import type { ApprovalEvent } from "./types";

type ApprovalPayload = Record<string, unknown>;

export type ApprovalEvaluation =
  | {
      decision: "allow";
      toolName: string;
      autoAllowedEvent: ApprovalEvent;
    }
  | {
      decision: "deny";
      toolName: string;
      requiredEvent: ApprovalEvent;
      deniedEvent: ApprovalEvent;
    };

interface ApprovalEvaluationOptions {
  mode: OpenClawRequestMode;
  idFactory?: () => string;
}

export function evaluateApprovalRequest(
  payload: ApprovalPayload,
  options: ApprovalEvaluationOptions,
): ApprovalEvaluation {
  if (options.mode === "agent") {
    return evaluateAgentApprovalRequest(payload, options.idFactory);
  }

  if (options.mode === "copilot") {
    return evaluateCopilotApprovalRequest(payload, options.idFactory);
  }

  return evaluateBuildApprovalRequest(payload, options.idFactory);
}

export function summarizeApprovalRequest(payload: ApprovalPayload): string | undefined {
  const candidates = [payload.command, payload.summary, payload.justification];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim().slice(0, 160);
    }
  }

  return undefined;
}

export function isSafeInspectionRequest(
  toolName: string,
  summary?: string,
  justification?: string,
): boolean {
  const combined = `${toolName} ${summary || ""} ${justification || ""}`.toLowerCase();

  const dangerousPattern =
    /\b(apply_patch|write|edit|delete|remove|rm\b|mv\b|cp\b|chmod|chown|git\b|npm\b|bun\b|pip\b|curl\b|wget\b|ssh\b|docker\b|kill\b|deploy|push|commit|truncate)\b/;
  if (dangerousPattern.test(combined)) {
    return false;
  }

  const safePattern = /\b(list|read|search|find|inspect|status|show|view|ls\b|cat\b|pwd\b|head\b)\b/;
  return safePattern.test(combined);
}

export function isCopilotSafeRequest(
  toolName: string,
  summary?: string,
  justification?: string,
): boolean {
  const combined = `${toolName} ${summary || ""} ${justification || ""}`.toLowerCase();

  const denyPattern = /\b(deploy|push|commit|publish|ssh\b|docker\b|kill\b|truncate)\b|--force\b|--hard\b/;
  const dangerousRm = /\brm\s+(-rf?\s+)?[/~]/;
  if (denyPattern.test(combined) || dangerousRm.test(combined)) {
    return false;
  }

  const allowPattern =
    /\b(list|read|search|find|inspect|status|show|view|ls\b|cat\b|pwd\b|head\b|write|edit|apply_patch|create_file|save_file|npm\b|bun\b|pip\b|node\b|python\b|bash\b|sh\b|curl\b|wget\b|fetch\b|cp\b|mv\b|mkdir\b|touch\b|chmod\b|rm\b|cd\b|echo\b|env\b|which\b|test\b|git\b|open\b|browse|navigate|screenshot|click|type|selenium|playwright|puppeteer)\b/;
  return allowPattern.test(combined);
}

function evaluateCopilotApprovalRequest(
  payload: ApprovalPayload,
  idFactory?: () => string,
): ApprovalEvaluation {
  const approvalId =
    (payload.id as string) || (payload.request_id as string) || (idFactory ?? randomUUID)();
  const toolName = (payload.tool as string) || (payload.name as string) || "tool";
  const summary = summarizeApprovalRequest(payload);
  const justification =
    typeof payload.justification === "string" ? payload.justification : undefined;
  const policyReason =
    "Copilot mode allows dev operations but blocks deployment, system, and destructive commands.";

  if (isCopilotSafeRequest(toolName, summary, justification)) {
    return {
      decision: "allow",
      toolName,
      autoAllowedEvent: {
        approvalId,
        toolName,
        decision: "allow",
        message: `Auto-allowed copilot tool request for ${toolName}.`,
        summary,
        justification,
        policyReason,
      },
    };
  }

  return {
    decision: "deny",
    toolName,
    requiredEvent: {
      approvalId,
      toolName,
      decision: "pending",
      message: `Approval required for ${toolName}.`,
      summary,
      justification,
      policyReason,
    },
    deniedEvent: {
      approvalId,
      toolName,
      decision: "deny",
      message: `Denied ${toolName}. Deployment, system, and destructive operations are blocked in copilot mode.`,
      summary,
      justification,
      policyReason,
    },
  };
}

function evaluateAgentApprovalRequest(
  payload: ApprovalPayload,
  idFactory?: () => string,
): ApprovalEvaluation {
  const approvalId =
    (payload.id as string) || (payload.request_id as string) || (idFactory ?? randomUUID)();
  const toolName = (payload.tool as string) || (payload.name as string) || "tool";
  const summary = summarizeApprovalRequest(payload);

  return {
    decision: "allow",
    toolName,
    autoAllowedEvent: {
      approvalId,
      toolName,
      decision: "allow",
      message: `Auto-allowed agent tool: ${toolName}.`,
      summary,
      policyReason: "Agent mode allows all tool executions in the user's sandbox.",
    },
  };
}

function evaluateBuildApprovalRequest(
  payload: ApprovalPayload,
  idFactory?: () => string,
): ApprovalEvaluation {
  const approvalId =
    (payload.id as string) || (payload.request_id as string) || (idFactory ?? randomUUID)();
  const toolName = (payload.tool as string) || (payload.name as string) || "tool";
  const summary = summarizeApprovalRequest(payload);
  const justification =
    typeof payload.justification === "string" ? payload.justification : undefined;
  const policyReason =
    "Only a narrow set of read-only inspection tools are auto-allowed in the builder bridge.";

  if (isSafeInspectionRequest(toolName, summary, justification)) {
    return {
      decision: "allow",
      toolName,
      autoAllowedEvent: {
        approvalId,
        toolName,
        decision: "allow",
        message: `Auto-allowed safe tool request for ${toolName}.`,
        summary,
        justification,
        policyReason,
      },
    };
  }

  return {
    decision: "deny",
    toolName,
    requiredEvent: {
      approvalId,
      toolName,
      decision: "pending",
      message: `Approval required for ${toolName}.`,
      summary,
      justification,
      policyReason,
    },
    deniedEvent: {
      approvalId,
      toolName,
      decision: "deny",
      message: `Denied ${toolName}. Only narrow read-only inspection tools are auto-allowed in the builder bridge.`,
      summary,
      justification,
      policyReason,
    },
  };
}
