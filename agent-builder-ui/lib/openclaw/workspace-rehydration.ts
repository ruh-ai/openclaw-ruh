export function shouldApplyWorkspaceRehydration({
  requestedSandboxId,
  currentSandboxId,
}: {
  requestedSandboxId: string | null | undefined;
  currentSandboxId: string | null | undefined;
}): boolean {
  return Boolean(requestedSandboxId && currentSandboxId && requestedSandboxId === currentSandboxId);
}
