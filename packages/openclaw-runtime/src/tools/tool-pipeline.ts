/**
 * Tool execution pipeline.
 *
 * Implements: docs/spec/openclaw-v1/003-tool-contract.md#the-execution-pipeline
 *
 * Tools cannot skip steps. Every call goes through:
 *   1. Lookup    — find tool in registry
 *   2. Stage     — check availableStages
 *   3. Mode      — check availableModes
 *   4. Validate  — input schema
 *   5. Permit    — checkPermissions (with optional approval callback)
 *   6. Emit      — TOOL_EXECUTION_START event
 *   7. Execute   — await tool.call
 *   8. Validate  — output schema (if declared)
 *   9. Modify    — apply contextModifier (sequential only)
 *   10. Forward  — append result.events to AG-UI stream
 *   11. Emit     — TOOL_EXECUTION_END event
 *   12. Log      — decision-log entry (added in Phase 1d)
 */

import type { OpenClawTool, ToolContext, ToolResult, AgUiCustomEvent } from "./tool-interface";
import type { ToolRegistry } from "./tool-registry";

// ─── Pipeline result ───────────────────────────────────────────────────

export type PipelineResult<TOutput = unknown> =
  | { readonly status: "success"; readonly toolName: string; readonly result: ToolResult<TOutput>; readonly events: ReadonlyArray<AgUiCustomEvent> }
  | { readonly status: "not_found"; readonly toolName: string }
  | { readonly status: "unavailable"; readonly toolName: string; readonly reason: string }
  | { readonly status: "validation_error"; readonly toolName: string; readonly error: string }
  | { readonly status: "output_validation_error"; readonly toolName: string; readonly error: string; readonly events: ReadonlyArray<AgUiCustomEvent> }
  | { readonly status: "permission_denied"; readonly toolName: string; readonly reason: string; readonly requiresApproval: boolean }
  | { readonly status: "execution_error"; readonly toolName: string; readonly error: string; readonly events: ReadonlyArray<AgUiCustomEvent> };

export interface PipelineOptions {
  /**
   * Called when a tool requires approval before execution.
   * Return true to approve, false to deny.
   * If not provided, tools requiring approval are denied.
   */
  readonly onApprovalRequired?: (toolName: string, reason: string) => Promise<boolean>;
}

// ─── Lifecycle event names ─────────────────────────────────────────────

export const TOOL_EXECUTION_START = "TOOL_EXECUTION_START" as const;
export const TOOL_EXECUTION_END = "TOOL_EXECUTION_END" as const;

// ─── Execute a single tool ─────────────────────────────────────────────

export async function executeTool<TOutput = unknown>(
  registry: ToolRegistry,
  toolName: string,
  rawInput: unknown,
  ctx: ToolContext,
  options?: PipelineOptions,
): Promise<PipelineResult<TOutput>> {
  // 1. Lookup
  const tool = registry.get(toolName);
  if (!tool) {
    return { status: "not_found", toolName };
  }

  // 2. Stage availability
  if (tool.availableStages !== null && !tool.availableStages.includes(ctx.devStage)) {
    return {
      status: "unavailable",
      toolName,
      reason: `Tool "${toolName}" is not available in the "${ctx.devStage}" stage.`,
    };
  }

  // 3. Mode availability
  if (tool.availableModes !== null && !tool.availableModes.includes(ctx.mode)) {
    return {
      status: "unavailable",
      toolName,
      reason: `Tool "${toolName}" is not available in the "${ctx.mode}" mode.`,
    };
  }

  // 4. Input validation
  const parsed = tool.inputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      status: "validation_error",
      toolName,
      error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    };
  }
  const input = parsed.data;

  // 5. Permission check
  const permission = tool.checkPermissions(input, ctx);
  if (!permission.allowed) {
    if (permission.requiresApproval && options?.onApprovalRequired) {
      const approved = await options.onApprovalRequired(toolName, permission.reason);
      if (!approved) {
        return {
          status: "permission_denied",
          toolName,
          reason: permission.reason,
          requiresApproval: false,
        };
      }
      // Approved — fall through to execution
    } else {
      return {
        status: "permission_denied",
        toolName,
        reason: permission.reason,
        requiresApproval: permission.requiresApproval,
      };
    }
  }

  // 6. Emit TOOL_EXECUTION_START
  const events: AgUiCustomEvent[] = [];
  const executionId = `${toolName}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  events.push({
    type: "CUSTOM",
    name: TOOL_EXECUTION_START,
    value: { toolName, executionId, readOnly: tool.isReadOnly() },
  });

  // 7. Execute
  let result: ToolResult<TOutput>;
  try {
    result = (await tool.call(input, ctx)) as ToolResult<TOutput>;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    events.push({
      type: "CUSTOM",
      name: TOOL_EXECUTION_END,
      value: { toolName, executionId, success: false, error: errorMsg },
    });
    return {
      status: "execution_error",
      toolName,
      error: errorMsg,
      events,
    };
  }

  // 8. Output validation (if outputSchema declared)
  if (tool.outputSchema) {
    const outputParsed = tool.outputSchema.safeParse(result.output);
    if (!outputParsed.success) {
      const errorMsg = outputParsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      events.push({
        type: "CUSTOM",
        name: TOOL_EXECUTION_END,
        value: { toolName, executionId, success: false, error: `output_validation: ${errorMsg}` },
      });
      return {
        status: "output_validation_error",
        toolName,
        error: errorMsg,
        events,
      };
    }
  }

  // 9. (Modify is applied by the multi-tool pipeline; single-call doesn't mutate caller's ctx)

  // 10. Forward tool-emitted events
  if (result.events) {
    events.push(...result.events);
  }

  // 11. Emit TOOL_EXECUTION_END
  events.push({
    type: "CUSTOM",
    name: TOOL_EXECUTION_END,
    value: { toolName, executionId, success: result.success, error: result.error },
  });

  return {
    status: "success",
    toolName,
    result,
    events,
  };
}

// ─── Execute multiple tools (concurrency-aware) ────────────────────────

export interface ToolCall {
  readonly toolName: string;
  readonly input: unknown;
}

/**
 * Execute multiple tools, running concurrency-safe tools in parallel and
 * non-concurrent tools sequentially. Per spec 003, only sequential calls
 * may apply contextModifier; concurrent calls cannot.
 */
export async function executeTools(
  registry: ToolRegistry,
  calls: ReadonlyArray<ToolCall>,
  ctx: ToolContext,
  options?: PipelineOptions,
): Promise<ReadonlyArray<PipelineResult>> {
  const concurrent: ToolCall[] = [];
  const sequential: ToolCall[] = [];

  for (const call of calls) {
    const tool = registry.get(call.toolName);
    if (tool && tool.isConcurrencySafe()) {
      concurrent.push(call);
    } else {
      sequential.push(call);
    }
  }

  const results: PipelineResult[] = [];

  // Concurrent fan-out
  if (concurrent.length > 0) {
    const parallelResults = await Promise.all(
      concurrent.map((c) => executeTool(registry, c.toolName, c.input, ctx, options)),
    );
    results.push(...parallelResults);
  }

  // Sequential — apply contextModifier as we go
  let currentCtx: ToolContext = ctx;
  for (const call of sequential) {
    const result = await executeTool(registry, call.toolName, call.input, currentCtx, options);
    results.push(result);

    if (result.status === "success" && result.result.contextModifier) {
      currentCtx = { ...currentCtx, ...result.result.contextModifier };
    }
  }

  return results;
}
