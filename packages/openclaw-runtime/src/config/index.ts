// Public surface of the config substrate.

export type {
  DocIndexEntry,
  TopLevelManifest,
  Dimension,
  DimensionType,
  DocManifest,
  VersionEnvelope,
  ImportJob,
  ConfigCommitInput,
  ConfigStoreAdapter,
} from "./types";

export {
  DocIndexEntrySchema,
  TopLevelManifestSchema,
  DimensionSchema,
  DimensionTypeSchema,
  DocManifestSchema,
  versionEnvelopeSchema,
  VersionEnvelopeLooseSchema,
  ImportJobSchema,
} from "./schemas";

export { InMemoryConfigStore } from "./in-memory-store";

export type { ConfigOptions, VersionedConfigHandle } from "./config";
export {
  Config,
  ConfigAuthorityError,
  ConfigDocNotFoundError,
  ConfigDocAlreadyExistsError,
  ConfigEntryValidationError,
  ConfigLookupError,
} from "./config";
