// Public surface of the pipeline-manifest substrate (Phase 2d).

export type {
  PipelineDevStage,
  AgentRef,
  DashboardRef,
  DashboardBranding,
  CustomToolKind,
  CustomToolEgressScope,
  RuntimeRequirements,
  RuntimeTenancy,
  RuntimeEgress,
  RuntimeLlmProvider,
  RuntimeSandbox,
  RuntimeSandboxResources,
  RuntimeDatabase,
  HookHandlerRegistration,
  HookCapabilityMode,
  CustomHookDeclaration,
  ManifestDecisionMetadataBinding,
  OutputValidatorLayer,
  OutputValidatorSchemaRef,
  OutputValidatorConfig,
  PipelineRetryOverride,
  PipelineRetryOverrides,
  PipelineManifest,
} from "./types";

export { PIPELINE_DEV_STAGES } from "./types";

export {
  PipelineDevStageSchema,
  AgentRefSchema,
  DashboardRefSchema,
  CustomToolKindSchema,
  RuntimeRequirementsSchema,
  HookHandlerRegistrationSchema,
  HookCapabilityModeSchema,
  CustomHookDeclarationSchema,
  ManifestDecisionMetadataBindingSchema,
  OutputValidatorConfigSchema,
  PipelineRetryOverrideSchema,
  PipelineManifestSchema,
} from "./schemas";

export type {
  ValidationSeverity,
  ValidationFinding,
  ValidationReport,
} from "./validation";
export {
  validatePipelineManifest,
  assertValidPipelineManifest,
  PipelineManifestInvalidError,
} from "./validation";
