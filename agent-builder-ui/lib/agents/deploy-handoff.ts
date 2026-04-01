export function buildCreateDeployHref(agentId: string, shouldAutoStart: boolean): string {
  const params = new URLSearchParams({ source: "create" });
  if (shouldAutoStart) {
    params.set("autoStart", "1");
  }
  return `/agents/${agentId}/deploy?${params.toString()}`;
}

export function resolveImproveAgentCompletionHref(
  agentId: string,
  sandboxIds: string[] | undefined,
  shouldAutoStart: boolean,
): string {
  return (sandboxIds?.length ?? 0) > 0
    ? "/agents"
    : buildCreateDeployHref(agentId, shouldAutoStart);
}

export function shouldAutoStartCreateDeploy(
  source: string | null,
  autoStart: string | null,
): boolean {
  return source === "create" && autoStart === "1";
}

export function buildReflectHref(agentId: string): string {
  return `/agents/create?stage=reflect&agentId=${encodeURIComponent(agentId)}`;
}
