# LEARNING: Repo-Wide Testability Audit

[[000-INDEX|← Index]] | [[001-architecture]] | [[002-backend-overview]] | [[008-agent-builder-ui]] | [[009-ruh-frontend]] | [[013-agent-learning-system]]

## Context

A repo-wide static audit looked for the parts of the codebase that make new tests disproportionately expensive to add or maintain. The problem is not that the repo has no tests; it is that several important flows are implemented in modules that collapse transport, persistence, orchestration, and UI state into one runtime boundary.

## What Makes The Repo Less Testable

### 1. Monolithic backend route and orchestration files force module-level mocking

- `ruh-backend/src/app.ts` owns most of the HTTP surface, in-memory SSE stream state, gateway proxying, audit writes, and conversation persistence in one module.
- `ruh-backend/src/sandboxManager.ts` combines provider catalogs, config reads, filesystem access, Docker command assembly, bootstrap verification scripts, retry loops, and the sandbox-create async generator.
- Because those modules import concrete collaborators directly and export singleton state, route tests commonly patch whole modules before import rather than constructing smaller subject-under-test objects.

### 2. Builder transport and workflow state are spread across large, stateful client boundaries

- `agent-builder-ui/app/api/openclaw/route.ts` combines auth checks, forge-gateway lookup, retry policy, WebSocket transport, approval policy, SSE encoding, and response normalization.
- `agent-builder-ui/lib/openclaw/ag-ui/use-agent-chat.ts` combines conversation history fetches, AG-UI agent orchestration, event reduction, builder autosave, browser/task/code workspace state, and persisted transcript shaping inside one hook.
- `agent-builder-ui/app/(platform)/agents/create/page.tsx` coordinates multiple stores plus duplicate completion flows for advanced and Co-Pilot paths, which makes behavior depend on effect ordering instead of one explicit state transition model.

### 3. State stores mix API client, persistence, and business rules

- `agent-builder-ui/hooks/use-agents-store.ts` combines backend shape mapping, fetch calls, optimistic local updates, local-storage persistence, derived fields, and forge SSE streaming.
- This forces tests to stub `fetch` and browser storage even when the real unit under test is a small merge or projection rule.

### 4. Developer UI panels embed protocol logic directly in components

- `ruh-frontend/components/ChatPanel.tsx` handles model loading, conversation creation, history pagination, WebSocket-style SSE parsing, auto-naming, and view behavior in one component.
- `ruh-frontend/components/ChannelsPanel.tsx` keeps probe, pairing, save/restart, and per-channel form state inside the rendered component tree instead of behind reusable hooks or client services.
- The result is that frontend tests must drive the component through large UI scenarios to cover protocol behavior that could otherwise be tested as pure reducers or small client helpers.

### 5. Global runtime dependencies are read directly instead of being injected

- Many modules read `process.env`, `fetch`, `WebSocket`, `localStorage`, time, or random identifiers directly at module scope or deep inside runtime logic.
- This raises setup cost, makes tests order-sensitive, and encourages broad monkeypatching instead of narrow dependency substitution.

### 6. `agent-builder-ui` has real unit tests but no first-class execution contract

- The package includes many `*.test.ts` files and a local `bun:test` type shim, but `agent-builder-ui/package.json` only documents Playwright test scripts.
- That makes unit-test execution non-obvious for future contributors and weakens the default feedback loop compared with `ruh-backend` and `ruh-frontend`.

## Reuse Guidance

- Prefer factories over singleton modules for HTTP apps, gateway bridges, and stores.
- Push network, clock, id, storage, and shell execution behind explicit interfaces.
- Move create-flow and chat-flow business rules into pure reducers or state-machine transitions, then keep React components as thin adapters.
- Extract protocol parsers and projection helpers from UI components before adding more end-to-end-only coverage.
- When a test needs more than one or two module-wide mocks, treat that as a design smell and cut a smaller seam before adding more behavior.

## Related Notes

- [[001-architecture]] — system-level view of the runtime boundaries this audit evaluated
- [[002-backend-overview]] — backend module map and the current `app.ts` / `sandboxManager.ts` concentration
- [[008-agent-builder-ui]] — builder transport, autosave, and create-flow orchestration surfaces
- [[009-ruh-frontend]] — developer UI panels whose networking and rendering are still tightly coupled
