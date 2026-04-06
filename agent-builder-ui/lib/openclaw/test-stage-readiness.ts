export interface TestStageContainerState {
  hasRealContainer: boolean;
  state: "ready" | "container-not-ready";
  label: string;
  description: string;
  emptyStateMessage: string;
}

export const TEST_STAGE_CONTAINER_READY_LABEL = "Container ready";
export const TEST_STAGE_CONTAINER_NOT_READY_LABEL = "Container not ready";
export const TEST_STAGE_CONTAINER_NOT_READY_MESSAGE = "Agent workspace is not ready yet.";
export const TEST_STAGE_CONTAINER_NOT_READY_DETAIL =
  "Test runs stay blocked until the dedicated agent sandbox finishes provisioning; the shared architect fallback is disabled.";
export const TEST_STAGE_CONTAINER_NOT_READY_REASON =
  `${TEST_STAGE_CONTAINER_NOT_READY_MESSAGE} ${TEST_STAGE_CONTAINER_NOT_READY_DETAIL}`;

export function getTestStageContainerState(
  agentSandboxId: string | null | undefined,
): TestStageContainerState {
  if (agentSandboxId) {
    return {
      hasRealContainer: true,
      state: "ready",
      label: TEST_STAGE_CONTAINER_READY_LABEL,
      description: "Tests run against your real agent container.",
      emptyStateMessage: "Tests will run against your real agent container.",
    };
  }

  return {
    hasRealContainer: false,
    state: "container-not-ready",
    label: TEST_STAGE_CONTAINER_NOT_READY_LABEL,
    description: TEST_STAGE_CONTAINER_NOT_READY_REASON,
    emptyStateMessage:
      "Container not ready — test runs stay blocked until the agent sandbox finishes provisioning.",
  };
}
