// Public surface of the hooks substrate.

export type {
  CanonicalHookName,
  CustomHookName,
  HookName,
  VetoableHookName,
  HookCapability,
  HookCapabilityKind,
  VetoResult,
  HookFireMode,
  HookHandler,
  HookHandlerReturn,
  HookContext,
  HookScope,
  RegisteredHook,
  HookFireResult,
  HookHandlerFailure,
} from "./types";

export {
  CANONICAL_HOOK_NAMES,
  VETOABLE_HOOK_NAMES,
  HOOK_CAPABILITY_KINDS,
  isCustomHookName,
  isCanonicalHookName,
  isVetoableHook,
  VETO,
  isVetoResult,
} from "./types";

export {
  DEFAULT_CAPABILITY_KINDS,
  defaultCapabilityKindsFor,
} from "./default-capabilities";

export {
  HookNameSchema,
  CanonicalHookNameSchema,
  HookFireModeSchema,
  HookScopeSchema,
  HookCapabilitySchema,
  HookManifestEntrySchema,
} from "./schemas";

export type { RegisterInput } from "./registry";
export { HookRegistry } from "./registry";

export type { HookRunnerOptions } from "./runner";
export { HookRunner } from "./runner";
