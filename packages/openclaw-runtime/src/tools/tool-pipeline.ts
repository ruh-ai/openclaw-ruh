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
import { classifyToolError } from "../error/error-taxonomy";
import type { ErrorCategory } from "../error/error-taxonomy";

// ─── Pipeline result ───────────────────────────────────────────────────

/**
 * The pipeline distinguishes:
 *   - 'success'        — pipeline ran cleanly AND tool returned success:true
 *   - 'tool_failed'    — pipeline ran cleanly BUT tool returned success:false
 *                         (structured app-level failure, not an exception)
 *   - 'execution_error' — tool threw an exception during call()
 *   - 'validation_error' — input failed inputSchema
 *   - 'output_validation_error' — output failed outputSchema
 *   - 'permission_denied' — checkPermissions denied (with or without approval gate)
 *   - 'unavailable'    — tool not available in current stage or mode
 *   - 'not_found'      — tool not registered
 *
 * Forcing 'tool_failed' as a separate status prevents the foot-gun where
 * downstream code treats `status === "success"` as "the operation worked"
 * when actually the tool reported a structured failure. Callers MUST handle
 * both 'success' and 'tool_failed' explicitly.
 */
export type PipelineResult<TOutput = unknown> =
  | { readonly status: "success"; readonly toolName: string; readonly result: ToolResult<TOutput>; readonly events: ReadonlyArray<AgUiCustomEvent> }
  | { readonly status: "tool_failed"; readonly toolName: string; readonly result: ToolResult<TOutput>; readonly errorCategory: ErrorCategory; readonly userMessage: string; readonly retryable: boolean; readonly events: ReadonlyArray<AgUiCustomEvent> }
  | { readonly status: "not_found"; readonly toolName: string }
  | { readonly status: "unavailable"; readonly toolName: string; readonly reason: string }
  | { readonly status: "validation_error"; readonly toolName: string; readonly error: string }
  | { readonly status: "output_validation_error"; readonly toolName: string; readonly error: string; readonly events: ReadonlyArray<AgUiCustomEvent> }
  | { readonly status: "permission_denied"; readonly toolName: string; readonly reason: string; readonly requiresApproval: boolean }
  | { readonly status: "execution_error"; readonly toolName: string; readonly error: string; readonly errorCategory: ErrorCategory; readonly userMessage: string; readonly retryable: boolean; readonly events: ReadonlyArray<AgUiCustomEvent> };

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
    if (permission.requiresApproval) {
      // Spec 013 §veto-handlers: tool_approval_required can replace the
      // local approval callback with the handler's decision. A VETO from
      // any handler is final (denied); otherwise the local callback (if
      // any) decides. If no approval mechanism is configured at all, the
      // pipeline surfaces requiresApproval: true so the caller knows it
      // needs to wire one up — the original Phase 1a behaviour.
      let approvalVetoed = false;
      let approvalVetoReason = "";

      if (ctx.hooks) {
        const hookResult = await ctx.hooks.fire("tool_approval_required", {
          tool_name: toolName,
          reason: permission.reason,
          requires_approval: true,
          execution_mode: ctx.mode,
          dev_stage: ctx.devStage,
        });
        if (hookResult.veto) {
          approvalVetoed = true;
          approvalVetoReason = hookResult.veto.reason;
        }
      }

      if (approvalVetoed) {
        if (ctx.decisionLog) {
          await ctx.decisionLog.emit({
            type: "permission_denied",
            description: `Tool "${toolName}" denied by hook veto`,
            metadata: {
              tool_name: toolName,
              reason: approvalVetoReason,
              requires_approval: false,
              vetoed_by_hook: "tool_approval_required",
            },
          });
        }
        return {
          status: "permission_denied",
          toolName,
          reason: approvalVetoReason,
          requiresApproval: false,
        };
      }

      if (options?.onApprovalRequired) {
        const approved = await options.onApprovalRequired(toolName, permission.reason);
        if (!approved) {
          if (ctx.decisionLog) {
            await ctx.decisionLog.emit({
              type: "permission_denied",
              description: `Tool "${toolName}" denied by reviewer`,
              metadata: {
                tool_name: toolName,
                reason: permission.reason,
                requires_approval: false,
              },
            });
          }
          return {
            status: "permission_denied",
            toolName,
            reason: permission.reason,
            requiresApproval: false,
          };
        }
        // Approved — log + fall through to execution
        if (ctx.decisionLog) {
          await ctx.decisionLog.emit({
            type: "permission_approved",
            description: `Tool "${toolName}" approved by reviewer`,
            metadata: { tool_name: toolName, reason: permission.reason },
          });
        }
      } else {
        // No approval mechanism configured — surface requiresApproval:true
        // so the caller knows the tool needs approval but none was wired.
        if (ctx.decisionLog) {
          await ctx.decisionLog.emit({
            type: "permission_denied",
            description: `Tool "${toolName}" denied — approval required but no approver configured`,
            metadata: {
              tool_name: toolName,
              reason: permission.reason,
              requires_approval: true,
            },
          });
        }
        return {
          status: "permission_denied",
          toolName,
          reason: permission.reason,
          requiresApproval: true,
        };
      }
    } else {
      if (ctx.decisionLog) {
        await ctx.decisionLog.emit({
          type: "permission_denied",
          description: `Tool "${toolName}" denied by policy`,
          metadata: {
            tool_name: toolName,
            reason: permission.reason,
            requires_approval: permission.requiresApproval,
          },
        });
      }
      return {
        status: "permission_denied",
        toolName,
        reason: permission.reason,
        requiresApproval: permission.requiresApproval,
      };
    }
  }

  // 5b. pre_tool_execution hook — last gate before the tool runs. A VETO
  // from any handler aborts with permission_denied (spec 013 §veto-handlers).
  if (ctx.hooks) {
    const preResult = await ctx.hooks.fire("pre_tool_execution", {
      tool_name: toolName,
      input,
      execution_mode: ctx.mode,
      dev_stage: ctx.devStage,
    });
    if (preResult.veto) {
      if (ctx.decisionLog) {
        await ctx.decisionLog.emit({
          type: "permission_denied",
          description: `Tool "${toolName}" vetoed by pre_tool_execution handler`,
          metadata: {
            tool_name: toolName,
            reason: preResult.veto.reason,
            requires_approval: false,
            vetoed_by_hook: "pre_tool_execution",
          },
        });
      }
      return {
        status: "permission_denied",
        toolName,
        reason: preResult.veto.reason,
        requiresApproval: false,
      };
    }
  }

  // 6. Emit TOOL_EXECUTION_START — both the AG-UI event AND a decision-log entry.
  const events: AgUiCustomEvent[] = [];
  const executionId = `${toolName}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const startedAtMs = Date.now();

  // post_tool_execution hook — fires at every terminal point. Not veto-able
  // per spec; observation-only. Helper closes over ctx, toolName, input,
  // startedAtMs so each return site is one call.
  const firePost = async (
    success: boolean,
    finalResult: ToolResult<TOutput> | null,
    errorCategory?: ErrorCategory,
  ): Promise<void> => {
    if (!ctx.hooks) return;
    await ctx.hooks.fire("post_tool_execution", {
      tool_name: toolName,
      input,
      result: finalResult,
      success,
      latency_ms: Date.now() - startedAtMs,
      ...(errorCategory !== undefined ? { error_category: errorCategory } : {}),
    });
  };

  events.push({
    type: "CUSTOM",
    name: TOOL_EXECUTION_START,
    value: { toolName, executionId, readOnly: tool.isReadOnly() },
  });

  // Emit tool_execution_start to the decision log (Phase 1d) if a log is available.
  // We don't await this — decision emission shouldn't block the tool call.
  let parentDecisionId: string | undefined;
  if (ctx.decisionLog) {
    const startDecision = await ctx.decisionLog.emit({
      type: "tool_execution_start",
      description: `Tool "${toolName}" started`,
      metadata: {
        tool_name: toolName,
        execution_id: executionId,
        read_only: tool.isReadOnly(),
        destructive: tool.isDestructive(),
        concurrency_safe: tool.isConcurrencySafe(),
        mode: ctx.mode,
        dev_stage: ctx.devStage,
      },
    });
    parentDecisionId = startDecision.id;
  }

  // 7. Execute
  let result: ToolResult<TOutput>;
  try {
    result = (await tool.call(input, ctx)) as ToolResult<TOutput>;
  } catch (err) {
    // Classify the thrown exception per spec 014 — every error in OpenClaw
    // classifies into exactly one category with retry/recovery guidance.
    const classified = classifyToolError(toolName, err);
    // Spec 014: originalMessage may contain credentials/internal paths.
    // The event is forwarded to AG-UI/dashboard — only userMessage is safe.
    // originalMessage stays in the typed PipelineResult for server-side
    // logging (decision-log writer redacts at write time).
    events.push({
      type: "CUSTOM",
      name: TOOL_EXECUTION_END,
      value: {
        toolName,
        executionId,
        success: false,
        userMessage: classified.userMessage,
        errorCategory: classified.category,
        retryable: classified.retryable,
      },
    });

    // Emit error_classified + tool_execution_end to the decision log.
    if (ctx.decisionLog) {
      await ctx.decisionLog.emit({
        type: "error_classified",
        description: `Tool "${toolName}" threw — category: ${classified.category}`,
        metadata: {
          tool_name: toolName,
          execution_id: executionId,
          category: classified.category,
          retryable: classified.retryable,
          // The decision log redacts at write time — passing the original is safe
          // because redaction strips credentials before storage.
          original_message_redacted: classified.originalMessage,
          user_message: classified.userMessage,
        },
        ...(parentDecisionId !== undefined ? { parent_id: parentDecisionId } : {}),
      });
      await ctx.decisionLog.emit({
        type: "tool_execution_end",
        description: `Tool "${toolName}" failed (${classified.category})`,
        metadata: {
          tool_name: toolName,
          execution_id: executionId,
          success: false,
          user_message: classified.userMessage,
          error_category: classified.category,
          retryable: classified.retryable,
        },
        ...(parentDecisionId !== undefined ? { parent_id: parentDecisionId } : {}),
      });
    }

    await firePost(false, null, classified.category);
    return {
      status: "execution_error",
      toolName,
      error: classified.originalMessage,
      errorCategory: classified.category,
      userMessage: classified.userMessage,
      retryable: classified.retryable,
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
      if (ctx.decisionLog) {
        await ctx.decisionLog.emit({
          type: "output_validation_failed",
          description: `Tool "${toolName}" output failed validation`,
          metadata: {
            marker_name: toolName,
            schema: `${toolName}.outputSchema`,
            error: errorMsg,
            raw_redacted: result.output,
            layer: 1,
          },
          ...(parentDecisionId !== undefined ? { parent_id: parentDecisionId } : {}),
        });
        await ctx.decisionLog.emit({
          type: "tool_execution_end",
          description: `Tool "${toolName}" failed output validation`,
          metadata: {
            tool_name: toolName,
            execution_id: executionId,
            success: false,
            error: `output_validation: ${errorMsg}`,
          },
          ...(parentDecisionId !== undefined ? { parent_id: parentDecisionId } : {}),
        });
      }
      await firePost(false, result, "tool_execution_failure");
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

  // 11. Distinguish tool_failed (structured app-level failure) from success.
  // When the tool returns success:false, classify the error string per spec 014
  // so the calling pipeline can apply retry policy and surface a sanitized
  // userMessage. Spec 014 anti-example forbids tools from classifying their own
  // errors — the pipeline owns classification.
  if (!result.success) {
    const classified = classifyToolError(toolName, result.error ?? "tool returned success:false");

    // Emit sanitized TOOL_EXECUTION_END (use userMessage, not raw error)
    events.push({
      type: "CUSTOM",
      name: TOOL_EXECUTION_END,
      value: {
        toolName,
        executionId,
        success: false,
        userMessage: classified.userMessage,
        errorCategory: classified.category,
        retryable: classified.retryable,
      },
    });

    if (ctx.decisionLog) {
      // Spec 014/005: every classification — including the success:false
      // path — emits error_classified before the tool_execution_end so
      // the audit log captures category + retryable + redacted-original
      // alongside the higher-level lifecycle event.
      await ctx.decisionLog.emit({
        type: "error_classified",
        description: `Tool "${toolName}" returned success:false — category: ${classified.category}`,
        metadata: {
          tool_name: toolName,
          execution_id: executionId,
          category: classified.category,
          retryable: classified.retryable,
          // The decision log redacts at write time — passing the original
          // is safe because redaction strips credentials before storage.
          original_message_redacted: classified.originalMessage,
          user_message: classified.userMessage,
        },
        ...(parentDecisionId !== undefined ? { parent_id: parentDecisionId } : {}),
      });
      await ctx.decisionLog.emit({
        type: "tool_execution_end",
        description: `Tool "${toolName}" returned success:false (${classified.category})`,
        metadata: {
          tool_name: toolName,
          execution_id: executionId,
          success: false,
          user_message: classified.userMessage,
          error_category: classified.category,
          retryable: classified.retryable,
        },
        ...(parentDecisionId !== undefined ? { parent_id: parentDecisionId } : {}),
      });
    }

    await firePost(false, result, classified.category);
    return {
      status: "tool_failed",
      toolName,
      result,
      errorCategory: classified.category,
      userMessage: classified.userMessage,
      retryable: classified.retryable,
      events,
    };
  }

  // Success path — emit TOOL_EXECUTION_END
  events.push({
    type: "CUSTOM",
    name: TOOL_EXECUTION_END,
    value: { toolName, executionId, success: true },
  });

  if (ctx.decisionLog) {
    await ctx.decisionLog.emit({
      type: "tool_execution_end",
      description: `Tool "${toolName}" completed`,
      metadata: {
        tool_name: toolName,
        execution_id: executionId,
        success: true,
      },
      ...(parentDecisionId !== undefined ? { parent_id: parentDecisionId } : {}),
    });
  }

  await firePost(true, result);
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
 * Execute multiple tools while preserving queue order. Adjacent runs of
 * concurrency-safe tools fan out in parallel; non-concurrent tools run
 * one at a time. Per spec 003: only sequential (non-concurrent) calls
 * may apply contextModifier — concurrent tools that return one have it
 * stripped from the returned result with a warning event.
 *
 * Order matters: a concurrent run that follows a sequential `mode`
 * mutation MUST see the mutated mode, not the original. We honour that
 * by walking calls in declared order and grouping adjacent concurrency-
 * safe calls into a parallel batch.
 */
export async function executeTools(
  registry: ToolRegistry,
  calls: ReadonlyArray<ToolCall>,
  ctx: ToolContext,
  options?: PipelineOptions,
): Promise<ReadonlyArray<PipelineResult>> {
  const results: PipelineResult[] = [];
  let currentCtx: ToolContext = ctx;

  let i = 0;
  while (i < calls.length) {
    const call = calls[i];
    if (!call) {
      i++;
      continue;
    }
    const tool = registry.get(call.toolName);

    // Group adjacent concurrency-safe tools into a parallel batch.
    if (tool && tool.isConcurrencySafe()) {
      const batch: ToolCall[] = [call];
      let j = i + 1;
      while (j < calls.length) {
        const next = calls[j];
        if (!next) break;
        const nextTool = registry.get(next.toolName);
        if (!nextTool || !nextTool.isConcurrencySafe()) break;
        batch.push(next);
        j++;
      }

      const batchResults = await Promise.all(
        batch.map((c) => executeTool(registry, c.toolName, c.input, currentCtx, options)),
      );

      // Strip contextModifier from concurrent results — concurrent tools
      // are not allowed to return one. We sanitize the inner result AND
      // surface the warning in the PipelineResult.events stream so AG-UI
      // and the decision log see it at the same level as other lifecycle
      // events.
      for (const result of batchResults) {
        if (
          (result.status === "success" || result.status === "tool_failed") &&
          result.result.contextModifier
        ) {
          const warningEvent: AgUiCustomEvent = {
            type: "CUSTOM",
            name: "CONCURRENT_CONTEXT_MODIFIER_STRIPPED",
            value: {
              toolName: result.toolName,
              reason: "Concurrency-safe tools cannot return contextModifier; modifier ignored.",
            },
          };
          const sanitizedResult: ToolResult = {
            success: result.result.success,
            output: result.result.output,
            ...(result.result.error !== undefined ? { error: result.result.error } : {}),
            events: [...(result.result.events ?? []), warningEvent],
          };
          // Surface in top-level events too so consumers reading
          // PipelineResult.events at the AG-UI/decision-log layer see it.
          const topLevelEvents = [...result.events, warningEvent];
          results.push({
            ...result,
            result: sanitizedResult as ToolResult<unknown>,
            events: topLevelEvents,
          });
        } else {
          results.push(result);
        }
      }

      i = j;
      continue;
    }

    // Non-concurrent: run one, apply contextModifier, advance.
    const result = await executeTool(registry, call.toolName, call.input, currentCtx, options);
    results.push(result);

    if (result.status === "success" && result.result.contextModifier) {
      currentCtx = { ...currentCtx, ...result.result.contextModifier };
    }
    i++;
  }

  return results;
}
