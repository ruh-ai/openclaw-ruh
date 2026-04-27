// Public surface of the memory module.

export type {
  MemoryTier,
  MemoryType,
  MemoryStatus,
  MemorySourceChannel,
  MemoryEntryContent,
  MemoryEntry,
  MemoryAuthorityRow,
  MemoryAuthority,
  ClientMemoryWriteSubmission,
  AttestedMemoryWriteRequest,
  MemoryQueryFilter,
  MemoryStoreAdapter,
  AuthorityResolution,
} from "./types";

export {
  MemoryTierSchema,
  MemoryTypeSchema,
  MemoryStatusSchema,
  MemorySourceChannelSchema,
  MemoryEntryContentSchema,
  MemoryEntrySchema,
  MemoryAuthorityRowSchema,
  MemoryAuthoritySchema,
  ClientMemoryWriteSubmissionSchema,
  AttestedMemoryWriteRequestSchema,
  MemoryQueryFilterSchema,
  parseClientSubmission,
  parseAttestedRequest,
  parseMemoryAuthority,
} from "./schemas";

export type { ResolveInput } from "./authority";
export { resolveEffectiveTier, listAuthorityFor } from "./authority";

export { InMemoryMemoryStore } from "./in-memory-store";

export type { MemoryOptions } from "./memory";
export {
  Memory,
  MemoryAuthorityError,
  MemoryNotFoundError,
  MemoryReviewError,
} from "./memory";
