# Shared Codex OAuth Bootstrap Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make new OpenClaw sandboxes prefer shared Codex/OpenClaw OAuth state over API-key onboarding, using the validated non-interactive skip-plus-probe flow.

**Architecture:** Extend sandbox creation with host auth-file detection and container seeding. Keep gateway bearer auth unchanged. After non-interactive onboarding with `--auth-choice skip`, set the default model to `openai-codex/gpt-5.4` and require a successful `models status --probe`.

**Tech Stack:** Bun, TypeScript, Docker, OpenClaw CLI, repo KB/docs.

---

### Task 1: Add failing backend tests for shared-auth bootstrap

**Files:**
- Modify: `ruh-backend/tests/unit/sandboxManager.test.ts`

**Step 1: Write the failing test**

Add tests covering:
- fallback to shared `~/.codex/auth.json` when OpenClaw OAuth state is absent
- preference for OpenClaw OAuth state when both files exist

**Step 2: Run test to verify it fails**

Run: `bun test ruh-backend/tests/unit/sandboxManager.test.ts`

**Step 3: Implement minimal sandbox bootstrap**

Modify `ruh-backend/src/sandboxManager.ts` to:
- detect shared auth seed files
- copy them into the container
- use `--auth-choice skip`
- set `openai-codex/gpt-5.4`
- probe auth

**Step 4: Run test to verify it passes**

Run: `bun test ruh-backend/tests/unit/sandboxManager.test.ts`

### Task 2: Update runtime wiring and docs

**Files:**
- Modify: `ruh-backend/src/app.ts`
- Modify: `.env.example`
- Modify: `ruh-backend/.env.example`
- Modify: `docs/knowledge-base/000-INDEX.md`
- Modify: `docs/knowledge-base/001-architecture.md`
- Modify: `docs/knowledge-base/003-sandbox-lifecycle.md`
- Modify: `docs/knowledge-base/008-agent-builder-ui.md`
- Modify: `docs/knowledge-base/010-deployment.md`
- Modify: `docs/knowledge-base/specs/SPEC-shared-codex-oauth-bootstrap.md`

**Step 1: Wire env-backed path defaults**

Pass shared auth path options into sandbox creation.

**Step 2: Document the contract**

Record:
- host auth-file precedence
- builder gateway caveat
- separate gateway-token requirement

**Step 3: Verify**

Run:
- `bun test ruh-backend/tests/unit/sandboxManager.test.ts`
- `npx tsc --noEmit` in `agent-builder-ui/` only if docs/code there change materially

