/**
 * Tool registry.
 *
 * Implements: docs/spec/openclaw-v1/003-tool-contract.md#tool-registry
 *
 * Single source of truth for "what tools exist." Consulted at:
 *   1. Manifest validation (every tool_kind referenced must be registered)
 *   2. Pipeline execution (every tool call resolves through here)
 *   3. Architect listing (which tools are valid in the current stage/mode)
 */

import type { OpenClawTool } from "./tool-interface";
import type { AgentDevStage, ExecutionMode } from "../types/lifecycle";

export class ToolRegistry {
  readonly #tools = new Map<string, OpenClawTool>();

  /** Register a tool. Throws if a tool with the same name already exists. */
  register(tool: OpenClawTool): void {
    if (this.#tools.has(tool.name)) {
      throw new Error(`OpenClawTool "${tool.name}" is already registered.`);
    }
    this.#tools.set(tool.name, tool);
  }

  /** Look up a tool by name. */
  get(name: string): OpenClawTool | undefined {
    return this.#tools.get(name);
  }

  /** True if a tool with this name is registered. */
  has(name: string): boolean {
    return this.#tools.has(name);
  }

  /** Number of registered tools. */
  get size(): number {
    return this.#tools.size;
  }

  /** All registered tools. */
  list(): ReadonlyArray<OpenClawTool> {
    return Array.from(this.#tools.values());
  }

  /**
   * Tools available for a given lifecycle stage.
   * Tools with `availableStages: null` are available in all stages.
   */
  listForStage(stage: AgentDevStage): ReadonlyArray<OpenClawTool> {
    return this.list().filter(
      (tool) => tool.availableStages === null || tool.availableStages.includes(stage),
    );
  }

  /**
   * Tools available for a given execution mode.
   * Tools with `availableModes: null` are available in all modes.
   */
  listForMode(mode: ExecutionMode): ReadonlyArray<OpenClawTool> {
    return this.list().filter(
      (tool) => tool.availableModes === null || tool.availableModes.includes(mode),
    );
  }

  /**
   * Tools available for a (stage, mode) combination — intersection of both filters.
   */
  listForStageAndMode(stage: AgentDevStage, mode: ExecutionMode): ReadonlyArray<OpenClawTool> {
    return this.list().filter((tool) => {
      const stageOk = tool.availableStages === null || tool.availableStages.includes(stage);
      const modeOk = tool.availableModes === null || tool.availableModes.includes(mode);
      return stageOk && modeOk;
    });
  }
}

// ─── Default registry singleton ────────────────────────────────────────

/**
 * In production the runtime constructs a ToolRegistry per pipeline session.
 * The default singleton is for convenience in tests and scripts; production
 * code should pass an explicit registry through context, not reach for the
 * singleton.
 */
let defaultRegistry: ToolRegistry | null = null;

export function getDefaultRegistry(): ToolRegistry {
  if (!defaultRegistry) {
    defaultRegistry = new ToolRegistry();
  }
  return defaultRegistry;
}

export function resetDefaultRegistry(): void {
  defaultRegistry = null;
}
