# Shared Codex OAuth Bootstrap Design

User-approved direction: use the unsafe shortcut and make new OpenClaw sandboxes reuse one shared Codex identity.

## Recommended approach

1. Prefer seeding host OpenClaw OAuth state when available.
2. Fall back to host `~/.codex/auth.json` because this machine already has it and OpenClaw can sync credentials from that file at runtime.
3. Do not try to force `openai-codex` through non-interactive onboarding, because the installed OpenClaw CLI rejects that flow.
4. Instead, skip provider setup during onboarding, then set the default model to `openai-codex/gpt-5.4` and run a live auth probe.

## Why this design

- It matches the successful disposable-container smoke test.
- It keeps gateway auth separate from model auth.
- It minimizes code churn by reusing the existing sandbox creation flow.
- It gives a hard failure signal if the shared auth seed is stale or invalid.

## Risks accepted

- Every sandbox shares the same Codex identity.
- Refresh/logout issues can affect many sandboxes at once.
- Compromise of the seeded auth file has a wide blast radius.
