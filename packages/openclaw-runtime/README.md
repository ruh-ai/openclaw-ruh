# `@ruh/openclaw-runtime`

The runtime substrate for OpenClaw pipelines. This package implements the contracts defined in [`docs/spec/openclaw-v1/`](../../docs/spec/openclaw-v1/).

## Status

`0.1.0` — Phase 1a → 1f landed (tool harness, error taxonomy, output validator, decision log, memory model, config substrate). Phase 1g (checkpoint) next. Implementation tracks the spec sub-phase by sub-phase; a single Codex (GPT-5.5) validation pass runs after Phase 1 is complete.

## Spec mapping

| Spec section | This package |
|---|---|
| 003 Tool contract | `src/tools/` |
| 004 Memory model | `src/memory/` (Phase 1e) |
| 005 Decision log | `src/decision-log/` (Phase 1d) |
| 009 Config substrate | `src/config/` (Phase 1f) |
| 012 Checkpoint | `src/checkpoint/` (Phase 1g) |
| 013 Hooks | `src/hooks/` (Phase 1h) |
| 014 Error taxonomy | `src/error/` (Phase 1b) |
| 015 Output validator | `src/parser/` (Phase 1c) |

## Running tests

```bash
bun install
bun test
bun run typecheck
```

## Spec version

This package targets **OpenClaw Spec `1.0.0-rc.1`** as published in `docs/spec/openclaw-v1/`. The `spec_version` constant in `src/index.ts` is the source of truth at runtime.
