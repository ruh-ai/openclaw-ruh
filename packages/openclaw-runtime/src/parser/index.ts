// Public surface of the parser module.

export type {
  MarkerToken,
  TokenizerState,
  FeedResult,
} from "./marker-tokenizer";
export {
  createTokenizerState,
  feedDelta,
  parseJsonAttribute,
} from "./marker-tokenizer";

export type {
  ParsedMarkerEvent,
  ParserDiagnostic,
  OutputValidationFailedDiagnostic,
  ParserFallbackDiagnostic,
  StreamingParser,
  StreamingParserOptions,
  MarkerSchemaBinding,
  ValidationResult,
} from "./structured-output-parser";
export {
  MarkerSchemaRegistry,
  validateOutput,
  createStreamingParser,
  parseAllMarkers,
  tryJsonParse,
} from "./structured-output-parser";

export type {
  Reveal,
  ThinkStep,
  ThinkResearchFinding,
  ThinkDocumentReady,
  PlanSkill,
  PlanWorkflow,
  PlanWorkflowStep,
} from "./canonical-schemas";
export {
  RevealSchema,
  ThinkStepSchema,
  ThinkResearchFindingSchema,
  ThinkDocumentReadySchema,
  PlanSkillSchema,
  PlanWorkflowSchema,
  PlanWorkflowStepSchema,
  CANONICAL_BINDINGS,
  registerCanonicalBindings,
} from "./canonical-schemas";
