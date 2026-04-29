import type { ArchitectSandboxInfo } from "@/hooks/use-architect-sandbox";
import { isForgeSandboxForAgent } from "@/hooks/use-forge-sandbox";

interface AgentSandboxSelectionAgent {
  id?: string | null;
  forgeSandboxId?: string | null;
}

interface AgentSandboxSelectionInput {
  workingAgent?: AgentSandboxSelectionAgent | null;
  createdAgentId?: string | null;
  forgeSandbox?: ArchitectSandboxInfo | null;
  architectSandbox?: ArchitectSandboxInfo | null;
}

export function requiresDedicatedForgeSandbox(
  workingAgent: AgentSandboxSelectionAgent | null | undefined,
  createdAgentId: string | null | undefined,
): boolean {
  return Boolean(workingAgent?.id || createdAgentId);
}

export function resolveCreatePageSandbox({
  workingAgent,
  createdAgentId,
  forgeSandbox,
  architectSandbox,
}: AgentSandboxSelectionInput): {
  effectiveSandbox: ArchitectSandboxInfo | null;
  forgeSandboxForAgent: ArchitectSandboxInfo | null;
  forgeSandboxPending: boolean;
} {
  const requiresForgeSandbox = requiresDedicatedForgeSandbox(workingAgent, createdAgentId);
  const forgeSandboxForAgent = isForgeSandboxForAgent(forgeSandbox, workingAgent?.forgeSandboxId)
    ? forgeSandbox
    : null;

  return {
    effectiveSandbox: requiresForgeSandbox ? forgeSandboxForAgent : architectSandbox ?? null,
    forgeSandboxForAgent,
    forgeSandboxPending: requiresForgeSandbox && !forgeSandboxForAgent,
  };
}
