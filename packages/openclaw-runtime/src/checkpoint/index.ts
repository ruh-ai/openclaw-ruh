// Public surface of the checkpoint substrate.

export type {
  CheckpointReason,
  BuildManifestStatus,
  BuildManifestTask,
  SubAgentSnapshotStatus,
  SubAgentSnapshot,
  VerificationProgress,
  EvalLoopProgress,
  Checkpoint,
  CheckpointInput,
  ResumeInput,
  ResumeRejectReason,
  ResumeOutcome,
  CheckpointQuery,
  CheckpointStoreAdapter,
} from "./types";

export { CHECKPOINT_REASONS } from "./types";

export {
  AgentDevStageSchema,
  CheckpointReasonSchema,
  BuildManifestStatusSchema,
  BuildManifestTaskSchema,
  SubAgentSnapshotStatusSchema,
  SubAgentSnapshotSchema,
  VerificationProgressSchema,
  EvalLoopProgressSchema,
  CheckpointSchema,
} from "./schemas";

export { InMemoryCheckpointStore } from "./in-memory-store";

export type { CheckpointStoreOptions } from "./checkpoint";
export {
  CheckpointStore,
  CheckpointNotFoundError,
  isSpecVersionCompatible,
} from "./checkpoint";
