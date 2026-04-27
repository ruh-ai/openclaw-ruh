// Public surface of the conformance substrate (Phase 3b).

export type {
  ConformanceSeverity,
  ConformanceFinding,
  ConformanceReport,
} from "./types";

export {
  pipelineManifestFindingToConformance,
  dashboardFindingToConformance,
} from "./types";

export type { CrossCheckInput } from "./cross-checks";
export { runCrossArtifactChecks } from "./cross-checks";

export type { ConformanceInput } from "./runner";
export { runConformance, assertConformant, ConformanceError } from "./runner";
