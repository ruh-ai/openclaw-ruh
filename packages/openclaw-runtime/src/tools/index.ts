// Public surface of the tool harness.

export type {
  OpenClawTool,
  ToolContext,
  ToolResult,
  PermissionDecision,
  AgUiCustomEvent,
} from "./tool-interface";
export { BaseTool } from "./tool-interface";

export { ToolRegistry, getDefaultRegistry, resetDefaultRegistry } from "./tool-registry";

export type { PipelineResult, PipelineOptions, ToolCall } from "./tool-pipeline";
export { executeTool, executeTools, TOOL_EXECUTION_START, TOOL_EXECUTION_END } from "./tool-pipeline";

export type {
  ToolDeclaration,
  PermissionConfig,
  BuiltInToolKind,
  ParseResult,
  CrossCheckMismatch,
} from "./tool-declaration";
export {
  ToolDeclarationSchema,
  BUILT_IN_TOOL_KINDS,
  parseToolDeclaration,
  crossCheckDeclaration,
} from "./tool-declaration";
