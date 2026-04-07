/**
 * Sandbox provider abstraction — defines the interface every infrastructure
 * backend (Docker, Daytona, …) must implement so the rest of the system
 * (sandbox bootstrap, gateway proxying, chat routing) stays provider-agnostic.
 */

import type { SandboxEvent } from '../sandboxManager';

// ── Provider identifiers ────────────────────────────────────────────────────

export type SandboxProviderType = 'docker' | 'daytona';

// ── Infrastructure creation ─────────────────────────────────────────────────

export interface InfraCreateOpts {
  /** Environment variables to forward into the sandbox (LLM keys, bot tokens). */
  envArgs: string[];
  /** Human-readable sandbox name for logging. */
  sandboxName: string;
}

export interface InfrastructureResult {
  sandboxId: string;
  gatewayUrl: string;
  gatewayHostPort: string;
  vncHostPort: number | null;
  dashboardHostPort: number | null;
  /** Daytona preview URL (null for Docker). */
  dashboardUrl: string | null;
  /** Daytona preview token (null for Docker). */
  previewToken: string | null;
  /** SSH / exec command for manual access. */
  sshCommand: string;
  /** Whether the pre-built sandbox image was used (skips legacy install). */
  usingPrebuiltImage: boolean;
}

// ── Managed sandbox listing ─────────────────────────────────────────────────

export interface ManagedSandboxInfo {
  sandbox_id: string;
  container_name: string;
  state: string;
  running: boolean;
  status: string;
}

// ── Provider interface ──────────────────────────────────────────────────────

export interface SandboxProvider {
  /**
   * Create the underlying infrastructure (container, workspace, VM, …).
   * Yields progress events for SSE streaming.
   * The final yield should be `['infra_ready', InfrastructureResult]`.
   */
  createInfrastructure(opts: InfraCreateOpts): AsyncGenerator<
    SandboxEvent | ['infra_ready', InfrastructureResult]
  >;

  /**
   * Execute a shell command inside the sandbox.
   * Returns `[success, combinedOutput]`.
   */
  exec(sandboxId: string, cmd: string, timeoutMs?: number): Promise<[boolean, string]>;

  /** Check whether the sandbox is currently running. */
  isRunning(sandboxId: string): Promise<boolean>;

  /** Force-stop and remove the sandbox. */
  stopAndRemove(sandboxId: string): Promise<void>;

  /** List all sandboxes managed by this provider. */
  listManaged(): Promise<ManagedSandboxInfo[]>;
}
