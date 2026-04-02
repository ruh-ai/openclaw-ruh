# LEARNING: Live agent creation needs a long forge wait, and the sandbox image must build native runtime deps with install scripts enabled

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[008-agent-builder-ui]] | [[011-key-flows]] | [[003-sandbox-lifecycle]]

## Context

During a live Playwright pass against the local `agent-builder-ui`, the full `/agents/create` flow was exercised with the seeded developer fixture `prasanjit@ruh.ai`. The goal was to record the real browser-visible event contract for future E2E coverage and to fix the first runtime issue that surfaced during sandbox provisioning.

## What Was Learned

- The live create flow is more stateful than the existing mocked browser specs imply.
  - Local builder access still begins at `/authenticate?redirect_url=/agents/create`, using the local fallback email/password form.
  - Submitting the init form (`name`, `description`, `Bring to life`) calls `POST /api/agents/create` and immediately rewrites the URL to `/agents/create?agentId=<uuid>`.
  - The browser then stays on the onboarding/provisioning screen until the forge SSE stream reaches its terminal `result`. In the initial failing-image pass this took roughly 2.5 minutes; after rebuilding the sandbox image with the runtime fix, the same path reached Co-Pilot within about 40 seconds locally.
  - Only after that forge `result` handoff does the UI transition into the Co-Pilot builder workspace with `Draft saved`, suggested prompts, the Agent's Computer tabs, and the stage stepper.
- The first architect turn after provisioning currently enters a visible `Connecting` / `Thinking` state before documents begin to generate.
  - In local development, the forge bridge can reject the direct WebSocket auth path with `control ui requires device identity`, and `agent-builder-ui/app/api/openclaw/route.ts` falls back to the HTTP chat proxy after about 30 seconds.
  - Future E2E should treat that fallback as a real observed event today, not assume immediate WebSocket streaming on localhost.
- The sandbox image had a real runtime defect unrelated to the builder page itself.
  - Forge provisioning logs consistently showed `Warning: Agent dashboard startup failed (non-fatal)` during `sandbox-agent-runtime`.
  - Inside the live sandbox container, rerunning `sandbox-agent-runtime` failed with `ERR_DLOPEN_FAILED` and `invalid ELF header` for `/opt/agent-runtime/node_modules/better-sqlite3/build/Release/better_sqlite3.node`.
  - The first root cause was `ruh-backend/Dockerfile.sandbox` building `agent-runtime` with `npm ci --ignore-scripts`, which skips the native install/build step required by `better-sqlite3`.
  - The second root cause was the repo `.dockerignore` omitting `agent-runtime/node_modules/` and `agent-runtime/.next/`, so the later `COPY agent-runtime/ ./` step overwrote the Linux-built dependency tree with host macOS artifacts. The rebuilt image contained a `Mach-O 64-bit arm64` `better_sqlite3.node`, which confirmed that overwrite path.
  - The fix is to build `agent-runtime` with install scripts enabled and to exclude host `agent-runtime` build artifacts from the Docker context. Keep regression coverage for both constraints.

## Evidence

- Live browser checkpoints captured via Playwright:
  - auth page title: `Log In & Start Building`
  - init form: `Who are you bringing to life?`
  - provisioning URL rewrite: `/agents/create?agentId=<uuid>`
  - post-forge builder shell: `Improve Agent`, `Draft saved`, `Co-Pilot Mode`, `Think → Plan → Build → Review → Test → Ship`
  - first architect turn state: `Connecting`, `Thinking`, `Preparing requirements documents...`
- Backend/browser event evidence:
  - `POST /api/agents/create`
  - `GET /api/agents/:id/forge/stream/:stream_id`
  - repeated `GET /api/agents/:id` until forge completion
  - first post-forge architect prompt eventually logged `POST /api/openclaw 200 in 30025ms` after `Forge WS failed, falling back to HTTP`
- Runtime root-cause evidence:
  - `docker exec <forge-container> sandbox-agent-runtime`
  - output included `Error: /opt/agent-runtime/node_modules/better-sqlite3/build/Release/better_sqlite3.node: invalid ELF header`
  - `docker run --rm ruh-sandbox:latest bash -lc 'file /opt/agent-runtime/node_modules/better-sqlite3/build/Release/better_sqlite3.node'`
  - before the `.dockerignore` fix, the rebuilt image still reported `Mach-O 64-bit arm64 bundle`
  - after the `.dockerignore` fix, the rebuilt image reported `ELF 64-bit LSB shared object, ARM aarch64`
- Regression coverage:
  - [`ruh-backend/tests/unit/sandboxDockerfile.test.ts`](/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/ruh-backend/tests/unit/sandboxDockerfile.test.ts)
  - [`ruh-backend/Dockerfile.sandbox`](/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/ruh-backend/Dockerfile.sandbox)
  - [`.dockerignore`](/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/.dockerignore)

## Implications For Future Agents

- Future Playwright coverage for live `/agents/create` should assert the real milestone sequence, not only the mocked architect response path:
  1. auth redirect and local login success
  2. init-form submission
  3. URL rewrite to `?agentId=...`
  4. forge provisioning log stream
  5. transition into Co-Pilot with `Draft saved`
  6. first architect prompt entering `Connecting` / `Thinking`
  7. eventual Think-stage PRD/TRD generation
- Browser tests that exercise the real forge path should budget for forge provisioning variability instead of assuming mock-speed transitions. The fixed prebuilt-image path is much faster locally, but the test contract still needs an explicit long timeout and milestone-based waits.
- The dashboard startup warning should disappear after the sandbox image is rebuilt from the fixed Dockerfile. If it reappears, inspect the built image first rather than the builder UI.
- The forge WebSocket auth fallback is a separate local transport issue from the dashboard runtime fix. Treat it as an observed local-dev behavior until the gateway auth path is explicitly hardened or made fully secure-context compatible.

## Links

- [[008-agent-builder-ui]]
- [[011-key-flows]]
- [[003-sandbox-lifecycle]]
- [Journal entry](../../journal/2026-04-02.md)
