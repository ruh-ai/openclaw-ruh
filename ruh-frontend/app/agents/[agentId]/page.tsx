import { AgentWorkspaceClient } from "./AgentWorkspaceClient";

export default function AgentWorkspacePage({
  params,
}: {
  params: { agentId: string };
}) {
  return <AgentWorkspaceClient agentId={params.agentId} />;
}
