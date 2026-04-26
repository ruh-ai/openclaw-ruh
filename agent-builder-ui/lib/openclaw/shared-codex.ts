export interface SharedCodexSandboxLike {
  sandbox_id: string;
  shared_codex_enabled?: boolean;
  shared_codex_model?: string | null;
}

const DEFAULT_SHARED_CODEX_MODEL = "openai-codex/gpt-5.5";

export function isSharedCodexSandbox(
  sandbox: SharedCodexSandboxLike | null | undefined,
): boolean {
  return Boolean(sandbox?.shared_codex_enabled);
}

export function isSharedCodexModel(model: string | undefined): boolean {
  return Boolean(model && model.startsWith("openai-codex/"));
}

export function sanitizeAgentModelForSandbox(
  model: string | undefined,
  sandbox: SharedCodexSandboxLike | null | undefined,
): string | undefined {
  if (!isSharedCodexSandbox(sandbox)) return model;
  if (!model) return undefined;
  return isSharedCodexModel(model) ? model : undefined;
}

export function getEffectiveChatModel(
  model: string | undefined,
  sandbox: SharedCodexSandboxLike | null | undefined,
): string {
  if (isSharedCodexSandbox(sandbox)) return "openclaw-default";
  return model ?? "openclaw-default";
}

export function getSharedCodexDisplayModel(
  sandbox: SharedCodexSandboxLike | null | undefined,
): string | null {
  if (!isSharedCodexSandbox(sandbox)) return null;
  return sandbox?.shared_codex_model ?? DEFAULT_SHARED_CODEX_MODEL;
}
