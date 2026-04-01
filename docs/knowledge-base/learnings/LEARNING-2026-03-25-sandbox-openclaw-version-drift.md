# LEARNING: Sandbox bootstrap currently depends on floating OpenClaw npm releases

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[003-sandbox-lifecycle]] | [[010-deployment]]

## Context

While reviewing the current repo state for the next highest-leverage missing backlog item, the sandbox creation path, lifecycle docs, deployment notes, and existing backlog were compared after ruling out already-tracked auth, timeout, containment, retry, and create-durability gaps.

## What Was Learned

- New sandboxes currently install OpenClaw from `npm` using `openclaw@latest` rather than a pinned runtime contract.
- The same floating install target is documented in the KB as a normal creation step, so this drift is currently part of the intended repo behavior, not just an implementation accident.
- A fresh upstream OpenClaw publish can therefore change onboarding, gateway, auth-bootstrap, or config behavior for only newly created sandboxes with no corresponding repo diff.
- Existing backlog items already harden request validation, auth, resource caps, Docker timeouts, and gateway policy, but none make sandbox bootstrap reproducible across creation dates.

## Evidence

- [`ruh-backend/src/sandboxManager.ts`](../../../ruh-backend/src/sandboxManager.ts) logs `Installing OpenClaw (npm install -g openclaw@latest)...` and executes:
  - `npm install -g openclaw@latest`
  - retry: `npm install -g --unsafe-perm openclaw@latest`
- [`docs/knowledge-base/003-sandbox-lifecycle.md`](../003-sandbox-lifecycle.md) documents create step 7 as `docker exec: npm install -g openclaw@latest`.
- [`docs/knowledge-base/011-key-flows.md`](../011-key-flows.md) describes sandbox creation as “Installing OpenClaw...” without any pinned-version or intentional-upgrade contract.
- `TODOS.md` already tracks sandbox resource containment, Docker timeout enforcement, startup config validation, gateway hardening, and create-job durability, but had no task for runtime-package determinism.

## Implications For Future Agents

- Treat sandbox runtime package pinning as a separate reliability boundary from Docker hardening or route-layer protections.
- Do not assume “same repo revision” means “same sandbox behavior” while bootstrap still depends on `openclaw@latest`.
- When changing sandbox bootstrap, prefer one explicit version/package contract plus a documented upgrade path rather than hidden drift through npm publish timing.

## Links

- [[003-sandbox-lifecycle]]
- [[010-deployment]]
- [[001-architecture]]
- [Journal entry](../../journal/2026-03-25.md)
