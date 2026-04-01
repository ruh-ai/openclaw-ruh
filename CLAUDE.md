# openclaw-ruh — CLAUDE.md

> Project-specific instructions for Claude Code and AI agents working on this codebase.
> Always read this before starting any task.
>
> **Repo:** https://github.com/ruh-ai/openclaw-ruh
> **Prerequisites:** Docker, Bun >= 1.3, Node.js >= 20, at least one LLM API key
>
> **Quick start:**
> ```bash
> docker run -d --name pg -e POSTGRES_USER=openclaw -e POSTGRES_PASSWORD=changeme -e POSTGRES_DB=openclaw -p 5432:5432 postgres:16-alpine
> cp ruh-backend/.env.example ruh-backend/.env  # add your LLM key
> ./start.sh                                     # starts backend:8000, builder:3000, client:3001
> ```

---

## What Is This Project?

**openclaw-ruh-enterprise** is the core platform for [Ruh.ai](https://ruh.ai) — the place where enterprises create **digital employees with a soul**.

Not bots. Not automations. AI assistants you love to work with — who understand you, remember you, and feel like real teammates. They have personality, context, and judgment. They grow with you.

### Product Shape

- **Agent Builder** (`agent-builder-ui`) — where you create and shape your assistant's soul: personality, skills, tools, triggers, memory.
- **Client Application** (`ruh-frontend`) — where end users work with their assistants daily. Direction: may become a desktop application.
- **Backend Infrastructure** (`ruh-backend`) — sandbox orchestration, agent lifecycle, persistence, deployment. Each sandbox is a Docker container running the `openclaw` CLI gateway.

### Proving Case: Google Ads Agent

The **Google Ads agent** is the first assistant being built on the platform. Every creation-flow feature, configuration step, deployment path, and improvement loop is validated against this single agent. When we say "create an agent," we mean the Google Ads agent. See `docs/project-focus.md` for current priorities.

### Agent Creation Architecture (v2 — approved)

**The container IS the agent from day one.** When a user creates a new agent:

1. Name + description submitted → new Docker container spins up immediately
2. The **Architect** (our own purpose-built OpenClaw agent) runs inside that container and guides creation through conversation
3. Architect writes the workspace directly: `SOUL.md`, `skills/`, `tools/`, `triggers/`, `.openclaw/`
4. **Test** → container switches mode from Architect → Agent (no new container, no deploy step)
5. **Ship** → workspace pushed to GitHub via OAuth

This replaces the old shared architect sandbox. Do not implement any feature that routes builder chat to a shared container — every agent gets its own.

**Full spec:** `docs/plans/agent-creation-architecture-v2.md` — read it before touching any agent creation code.

### Brand & Design Guidelines

**Always reference `DESIGN.md` before making any UI changes.** It defines the complete brand system: color palette, typography, spacing, components, and the "Alive Additions" — subtle animations that make the agent creation experience feel like bringing a colleague to life, not filling out a form. Key alive elements: soul pulse, gradient drift, spark moments, warmth hover, breathing focus, stage transitions, and the "soul born" celebration.

---

## Knowledge Base (Obsidian)

**Always check the knowledge base first before working on any task.**
**Always update the knowledge base after implementing any new functionality.**

- Location: `docs/knowledge-base/`
- Entry point: `docs/knowledge-base/000-INDEX.md`
- Durable task learnings: `docs/knowledge-base/learnings/`
- Format: Obsidian-compatible Markdown with `[[wikilinks]]` for graph navigation
- Use the "Quick Navigation for Agents" table to find the right note for any task

### Navigation

| Task | Knowledge Base Note |
|---|---|
| Understand the full system | `001-architecture.md` |
| Add/modify a backend API endpoint | `004-api-reference.md` + `002-backend-overview.md` |
| Change sandbox creation behavior | `003-sandbox-lifecycle.md` |
| Work on database schema | `005-data-models.md` |
| Fix/extend Telegram or Slack logic | `006-channel-manager.md` |
| Work on conversations or chat | `007-conversation-store.md` |
| Work on the agent builder chat UI | `008-agent-builder-ui.md` |
| Work on the developer dashboard UI | `009-ruh-frontend.md` |
| Change deployment config | `010-deployment.md` |
| Understand a user journey end-to-end | `011-key-flows.md` |
| Understand agent learnings and journaling workflow | `013-agent-learning-system.md` |
| Work on authentication | `014-auth-system.md` |
| Work on admin panel | `015-admin-panel.md` |
| Work on marketplace | `016-marketplace.md` |
| Work on Flutter customer app | `018-ruh-app.md` |
| Read a feature spec | `docs/knowledge-base/specs/` |

### Mandatory Documentation Rules

1. **Every new feature, endpoint, or behavioral change MUST have a spec** in the knowledge base before or during implementation. No feature ships undocumented.
2. **Feature specs** go in `docs/knowledge-base/specs/` with the naming pattern `SPEC-<short-name>.md` (e.g., `SPEC-agent-deploy-flow.md`).
3. **All KB notes MUST use Obsidian `[[wikilinks]]`** to connect to related notes. This powers the Obsidian graph view — isolated notes with no links are considered incomplete.
4. **Every spec must link to:**
   - The relevant architecture/module notes it touches (e.g., `[[004-api-reference]]`, `[[003-sandbox-lifecycle]]`)
   - The `[[000-INDEX]]` (via the backlink header at the top)
   - Any other specs it depends on or extends
5. **Every existing KB note that is affected by a new feature** must be updated with a `[[wikilink]]` back to the new spec. Links must be bidirectional.
6. **`000-INDEX.md` must be updated** whenever a new standard KB note or spec is added — add it to the appropriate section and the Quick Navigation table. Individual `LEARNING-*` notes are indexed through backlinks and `013-agent-learning-system.md`, not one-by-one in the index.
7. **Use the `/document-release` skill** after shipping to verify all KB notes are current and properly linked.

### Spec Template

New specs should follow this structure:
```markdown
# SPEC: <Feature Name>

[[000-INDEX|← Index]] | [[<related-note>|Related Note]]

## Status
<!-- draft | approved | implemented | deprecated -->

## Summary
<!-- 2-3 sentences: what this feature does and why -->

## Related Notes
- [[<note>]] — <why it's related>

## Specification
<!-- Full spec: endpoints, data models, UI behavior, flows -->

## Implementation Notes
<!-- Key files changed, patterns used, gotchas -->

## Test Plan
<!-- What tests cover this spec -->
```

---

## Service Map

| Service | Path | Port | Stack |
|---|---|---|---|
| `ruh-backend` | `ruh-backend/` | 8000 | TypeScript + Bun + Express + PostgreSQL — sandbox orchestration, agent lifecycle |
| `ruh-frontend` | `ruh-frontend/` | 3001 | Next.js 16 — customer web application (org admins + members) |
| `agent-builder-ui` | `agent-builder-ui/` | 3000 | Next.js 15 — agent builder (create, configure, deploy assistants) |
| `admin-ui` | `admin-ui/` | 3002 | Next.js 15 — admin panel (platform management, user/agent oversight, moderation) |
| `ruh_app` | `ruh_app/` | N/A | Flutter customer app for web-equivalent org/member access across mobile and desktop targets |
| `@ruh/marketplace-ui` | `packages/marketplace-ui/` | N/A | Shared React component library for marketplace UI |
| `postgres` | docker/k8s | 5432 | PostgreSQL 16 |
| `nginx` | `nginx/` | 80 | Reverse proxy |

---

## Task Tracking (TODOS.md)

`TODOS.md` at the repo root is the canonical record of current and recent agent work.

### Required Workflow

1. **Before any non-trivial task, read `TODOS.md`.** Use it to understand ongoing work, recent decisions, blockers, and handoff context before making substantial changes.
2. **Create or update a todo entry when starting substantial work.** Do this before broad edits so the current task is visible to future agents.
3. **Keep the entry current while you work.** Update it when scope changes, a blocker appears, the task is paused, ownership changes, or the task is completed.
4. **Write entries for the next agent, not just the current one.** A future agent should be able to read `TODOS.md` and understand what task was being worked on, why it mattered, what changed, and what should happen next.
5. **Each active-work entry must include:** task title, status, owner/agent, started date, updated date, affected files/areas, current summary, next step, and blockers.
6. **Keep recent completed context long enough to be useful.** Move long-term ideas into deferred/backlog sections instead of deleting context immediately.

If the working tree and `TODOS.md` diverge, update `TODOS.md` so it reflects reality before handing work off.

---

## Agent Learnings And Journal

This repo requires a repo-visible work journal in addition to `TODOS.md`.

1. **Every non-trivial task or automation run must append an entry to `docs/journal/YYYY-MM-DD.md`.**
2. **If the run produced durable knowledge another agent should reuse, create or update `docs/knowledge-base/learnings/LEARNING-YYYY-MM-DD-<task-slug>.md`.**
3. **Keep core KB notes canonical.** Do not turn architecture or API notes into chronological run logs; link learning notes from those notes when the learning materially changes how the area should be understood.
4. **Automation memory does not replace the repo journal or KB learning notes.** It is private continuity for one automation.
5. **Read `docs/knowledge-base/013-agent-learning-system.md`** when working on repo process, automation behavior, or historical learnings.

---

## Automation Architecture

This repo may be maintained by recurring Codex automations in addition to interactive agents.

- Read `docs/knowledge-base/012-automation-architecture.md` before creating or modifying a repo automation.
- Reuse the canonical feature-add/backlog-curation prompt stored in `docs/knowledge-base/012-automation-architecture.md` instead of inventing a new automation prompt from scratch.
- Reuse the canonical test-coverage automation prompt from `docs/knowledge-base/012-automation-architecture.md` when creating or modifying the repo's test-improvement automation.
- When a scheduled automation shares a repo-local role name (`Analyst-1`, `Worker-1`, `Tester-1`), make the live prompt read the matching file under `agents/` or `.agents/agents/` before choosing work so runtime behavior stays aligned with the repo contract.
- `docs/project-focus.md` is the human-owned steering document for focus-aware maintainer automations. When it is active and has focus areas, `Analyst-1` must prioritize missing feature packages that advance that focus, and `Tester-1` must prioritize bounded coverage or bounded Playwright verification that stabilizes that focus; when it is missing, inactive, or empty, they fall back to their normal repo-wide selection behavior.
- For `Analyst-1` and `Worker-1`, the unit of work is one complete feature package per run rather than one isolated task. Analyst runs should add feature-oriented TODO entries with testable outcomes, and worker runs should finish one feature end-to-end unless blocked.
- Treat automations as an operator layer over the repo, not as product runtime services.
- Automation config lives in `$CODEX_HOME/automations/<automation_id>/automation.toml`.
- Automation memory lives in `$CODEX_HOME/automations/<automation_id>/memory.md` and must be read first if present, then updated before the run ends.
- Automation runs should still follow the normal repo workflow: read the KB, read/update `TODOS.md`, append `docs/journal/YYYY-MM-DD.md`, write a KB learning note when the run produced durable insight, make bounded file edits, and leave enough context for the next agent.
- When documenting or proposing a new automation, store or update its canonical prompt pattern in the KB note so future agents can reuse it instead of inventing a new one.
- If the automation prompt contract or repo-wide learning/journal workflow changes, update `docs/knowledge-base/012-automation-architecture.md`, `docs/knowledge-base/013-agent-learning-system.md`, and this instruction file in the same change. `agents.md` mirrors this file.

---

## Critical Design Decisions

1. **Sandbox = Docker container.** Each sandbox is `node:22-bookworm` with `openclaw` installed. The backend interacts via `docker exec`, not network API.

2. **SSE for sandbox creation.** `POST /api/sandboxes/create` returns a `stream_id` immediately. Progress flows via `GET /api/sandboxes/stream/:stream_id` (Server-Sent Events). Creation takes ~2–5 min.

3. **Two separate frontends.** `agent-builder-ui` is where enterprises create and configure their digital employees (WebSocket bridge to OpenClaw architect agent). `ruh-frontend` is the client application where end users work alongside their deployed assistants (direct REST). `ruh-frontend` is a candidate for desktop app conversion.

4. **OpenClaw architect agent.** `agent-builder-ui` has no LLM logic of its own. It routes messages to an OpenClaw agent running in a sandbox via the bridge at `agent-builder-ui/app/api/openclaw/route.ts`.

5. **LLM provider priority:** OpenRouter → OpenAI → Anthropic → Gemini → Ollama (fallback). Set in `sandboxManager.ts:createOpenclawSandbox()`.

6. **Session keys.** Each conversation has `openclaw_session_key = "agent:main:<conv_uuid>"`. Forwarded as `x-openclaw-session-key` header to preserve agent context.

7. **Message persistence is frontend responsibility.** The backend does NOT auto-persist messages after chat. The frontend must call `POST .../messages` after each exchange.

8. **Auth is disabled.** `agent-builder-ui/middleware.ts` returns `NextResponse.next()` unconditionally. Auth redirect logic is dead code.

9. **Auth uses custom JWT.** Passwords hashed with bcrypt (12 rounds). Access tokens are 15-min JWTs, refresh tokens are raw UUIDs rotated on each use. Both stored in httpOnly cookies. Three roles: admin, developer, end_user.

10. **Employee Marketplace is a shared package.** `@ruh/marketplace-ui` contains React components consumed by agent-builder-ui (publish), ruh-frontend (browse/install), and admin-ui (moderate). Backend at `/api/marketplace/*`.

11. **Customer app direction is Flutter.** `ruh_app` is the active native client path for org admins and members across mobile and desktop targets.

12. **Three user tiers.** Admin (platform management via admin-ui), Developer (build+publish agents via agent-builder-ui), End User (browse+use agents via ruh-frontend or `ruh_app`).

---

## Backend: Adding a New Endpoint

1. Add route handler in `app.ts` using `asyncHandler(async (req, res) => { ... })`
2. Use `getRecord(sandbox_id)` to validate the sandbox exists (throws 404 if not)
3. Use `sandboxExec(sandbox_id, cmd, timeoutSec)` to run commands in the container
4. Use `parseJsonOutput(output)` for JSON output from CLI commands
5. Throw `httpError(status, message)` for expected errors
6. Add unit + integration tests in `ruh-backend/tests/`

> Routes that modify data should use `requireAuth` middleware. Admin-only routes use `requireRole('admin')`. Public read routes can use `optionalAuth`.

---

## Gateway URL Resolution

`utils.ts:gatewayUrlAndHeaders()` resolves gateway URL in priority order:
1. `signed_url` (no extra auth header needed)
2. `standard_url`
3. `dashboard_url` (fallback)

If `preview_token` is set and `signed_url` is not, adds `X-Daytona-Preview-Token` header.
Always adds `Authorization: Bearer <gateway_token>` if token is set.

---

## Environment Variables (Dev)

### Backend (`ruh-backend/.env`)
- `DATABASE_URL` — required
- `PORT` — default 8000
- `ALLOWED_ORIGINS` — default `http://localhost:3000`
- `JWT_ACCESS_SECRET` — JWT signing secret for access tokens (dev default provided)
- `JWT_REFRESH_SECRET` — JWT signing secret for refresh tokens (dev default provided)
- LLM keys (at least one): `OPENROUTER_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`
- Optional: `OLLAMA_BASE_URL`, `TELEGRAM_BOT_TOKEN`, `DISCORD_BOT_TOKEN`

### Agent Builder UI (`agent-builder-ui/.env`)
- `OPENCLAW_GATEWAY_URL` — WebSocket URL of architect agent gateway
- `OPENCLAW_GATEWAY_TOKEN` — Bearer token from sandbox record
- `OPENCLAW_GATEWAY_ORIGIN` — default `https://clawagentbuilder.ruh.ai`
- `OPENCLAW_TIMEOUT_MS` — default 180000ms

### Ruh Frontend (`ruh-frontend/.env`)
- `NEXT_PUBLIC_API_URL` — default `http://localhost:8000`

### Admin UI (`admin-ui/.env`)
- `NEXT_PUBLIC_API_URL` — default `http://localhost:8000`

---

## Local Development

```bash
# Start PostgreSQL
docker run -d --name pg \
  -e POSTGRES_USER=openclaw \
  -e POSTGRES_PASSWORD=changeme \
  -e POSTGRES_DB=openclaw \
  -p 5432:5432 postgres:16-alpine

# Configure backend env
cp ruh-backend/.env.example ruh-backend/.env

# Run all services
./start.sh
```

Backend only:
```bash
cd ruh-backend && bun run dev
```

---

## Testing

> Full testing strategy documented in `TESTING.md` at repo root.

### Quick Commands (from repo root)

```bash
npm run test:all          # Unit + contract tests across all 5 services
npm run test:integration  # Integration tests against real Postgres (needs Docker)
npm run test:contract     # API shape validation only
npm run typecheck:all     # TypeScript check all services
npm run coverage:all      # Coverage with threshold enforcement
```

### Per-Service Commands

| Service | Unit Tests | E2E | Coverage |
|---------|-----------|-----|----------|
| `ruh-backend` | `bun test tests/unit/` | `bun test tests/e2e/` | `bun run test:coverage` (75% threshold) |
| `agent-builder-ui` | `bun test lib/ hooks/ app/` | `npx playwright test` | `bun test --coverage` (60% threshold) |
| `ruh-frontend` | `npx jest` | `npx playwright test` | `npx jest --coverage` (60% threshold) |
| `admin-ui` | `bun test` | `npx playwright test` | `bun test --coverage` (50% threshold) |
| `marketplace-ui` | `cd packages/marketplace-ui && bun test` | — | `bun test --coverage` (80% threshold) |

### Test Structure

| Type | Location | When to Run | What It Catches |
|------|----------|-------------|-----------------|
| **Unit** | `tests/unit/` or inline `__tests__/` | Every push (pre-push hook) | Logic bugs, regressions |
| **Contract** | `ruh-backend/tests/contract/` | Every PR (CI) | API shape drift between frontend/backend |
| **Integration** | `ruh-backend/tests/integration/` | CI only (needs Postgres) | Schema bugs, FK violations, data flow |
| **E2E** | `*/e2e/*.spec.ts` (Playwright) | main/dev merges (CI) | Full user flow regressions |
| **Security** | `ruh-backend/tests/security/` | Every PR (CI) | Injection, auth bypass |
| **Smoke** | `ruh-backend/tests/smoke/` | main only (CI) | Real server boot |

### Test Runners

- **ruh-backend, agent-builder-ui, admin-ui, marketplace-ui**: bun:test
- **ruh-frontend**: Jest (jsdom) + MSW for mocking
- **E2E (all frontends)**: Playwright (Chromium)

### Pre-commit Hooks (Husky)

- **Pre-commit**: TypeScript typecheck for changed services (fast, <10s)
- **Pre-push**: Unit tests for changed services
- **Bypass**: `git commit --no-verify` / `git push --no-verify` (use sparingly)

### Coverage Enforcement

Each service has `scripts/check-coverage.ts` that reads LCOV output and fails if below threshold. Backend currently at **82% lines, 85% functions**.

### Writing New Tests

Every new feature, endpoint, or behavioral change must include tests:
- **Backend route**: Unit test (mock store) + contract test (response shape)
- **React component**: Unit test (bun:test + happy-dom)
- **Critical flow**: E2E spec (Playwright)
- **Database change**: Integration test (real Postgres)

---

## Common Debugging

| Problem | Check |
|---|---|
| Gateway unreachable | `docker ps` — is container running? `docker exec openclaw-<id> openclaw gateway status` |
| Chat returns 503 | `standard_url` / `gateway_port` in DB correct? |
| Cron not running | `docker exec openclaw-<id> openclaw cron list --json` |
| Channel not connecting | Check bot token, run `openclaw channels status --probe` in container |
| SSE stream hangs | Check `/tmp/openclaw-gateway.log` inside container |
| Agent builder no response | Check `OPENCLAW_GATEWAY_URL` + `OPENCLAW_GATEWAY_TOKEN` env vars |

---

## Development Process

Follow the gstack sprint pipeline defined in `agents.md`:
**Think → Plan → Build → Review → Test → Ship → Reflect**

- Never skip phases. Each phase feeds the next.
- Use atomic commits — one logical change per commit, bisect-friendly.
- Every bug fix must produce a regression test.
- Maintain `TODOS.md` as you work so task state and handoff context stay current.
- Append the daily journal and write a KB learning note whenever the run produced durable insight.
- Update `docs/knowledge-base/` when adding new modules, endpoints, or flows.
- Use `/document-release` after shipping to keep READMEs and KB in sync.

---

## gstack

gstack is the development process used on this project. Use `/browse` from gstack for all web browsing. Never use `mcp__claude-in-chrome__*` tools.

**Sprint skills** (run in order):

| Phase | Skill | When to use |
|---|---|---|
| Think | `/kb read` | **Run first.** Orient agent on what the KB knows about the current task |
| Think | `/office-hours` | Starting a new feature or unclear on problem framing |
| Plan | `/kb spec <name>` | Create a feature spec with wikilinks before building |
| Plan | `/plan-ceo-review` | Validate product scope before building |
| Plan | `/plan-eng-review` | Lock architecture, data flow, edge cases, test matrix |
| Plan | `/plan-design-review` | Design audit before building UI changes |
| Build | `/careful` | Before any destructive command (DROP TABLE, rm -rf, force-push) |
| Build | `/freeze` | Lock edits to one service/directory while debugging |
| Review | `/review` | Before every PR — catches production bugs that pass CI |
| Review | `/investigate` | Systematic root-cause debugging. Run before any fix attempt. |
| Review | `/codex` | Second opinion from OpenAI Codex — cross-model review |
| Test | `/qa` | Open real browser, click through flows, fix bugs with regression tests |
| Test | `/qa-only` | Same as /qa but report-only (no code changes) |
| Ship | `/kb update` | Update KB notes to match code changes |
| Ship | `/kb audit` | Verify KB health before PR — orphans, broken links, stale specs |
| Ship | `/ship` | Sync main, run tests, push, open PR |
| Ship | `/document-release` | Update README and docs after shipping |
| Reflect | `/retro` | Weekly retrospective — shipping stats, test health, growth gaps |
| Reflect | `/kb audit` | KB health check as part of weekly retro |

**Project skills:**

| Tool | Use |
|---|---|
| `/kb` | Knowledge base maintenance — 5 modes: `read`, `spec`, `link`, `audit`, `update` |

**Power tools:**

| Tool | Use |
|---|---|
| `/guard` | `/careful` + `/freeze` combined — full safety for prod work |
| `/unfreeze` | Remove the `/freeze` boundary |
| `/browse` | Headless browser — real Chromium, real clicks |
| `/design-consultation` | Build or extend the design system |
| `/design-review` | Designer-eye audit + fix loop for UI changes |
| `/gstack-upgrade` | Upgrade gstack to latest |

If gstack skills aren't working, run: `cd ~/.claude/skills/gstack && ./setup`

---

## Ecosystem Integrations

### Paperclip (AI company orchestration)

[Paperclip](https://github.com/paperclipai/paperclip) manages teams of AI agents as a "zero-human company." It provides org charts, goals, budgets, heartbeats, and governance.

- Install: `npx paperclipai onboard --yes && npx paperclipai run`
- Server: `http://localhost:3100` (or next available port)
- CLI: `npx paperclipai company|agent|issue|dashboard|activity`
- Adapter: `claude_local` — spawns Claude Code CLI for each agent heartbeat
- Agent skills are injected via `--add-dir` in adapter `extraArgs`
- MCP servers injected via `--mcp-config` in adapter `extraArgs`

### OpenSpace (self-evolving skill engine)

[OpenSpace](https://github.com/HKUDS/OpenSpace) gives agents self-improving skills. Skills evolve through use — when a task succeeds, the winning workflow gets captured as a reusable skill.

- Install: `cd ~/OpenSpace && pip install -e .`
- MCP server: configure in `~/.claude/.mcp.json` or via `--mcp-config`
- Tools: `execute_task`, `search_skills`, `fix_skill`, `upload_skill`
- Backends: shell, MCP, system (configurable via `OPENSPACE_BACKEND_SCOPE`)

### OpenClaw (agent runtime)

Each Ruh agent sandbox is a Docker container running [OpenClaw](https://github.com/openclaw). The OpenClaw gateway provides the chat API, cron scheduling, and channel integrations (Telegram, Slack, Discord).

- Sandbox image: `ruh-sandbox:latest` (or `node:22-bookworm` fallback)
- Gateway port: 18789 (inside container)
- Workspace: `~/.openclaw/workspace/` (SOUL.md, skills/, tools/, triggers/)
- CLI: `openclaw gateway status`, `openclaw cron list --json`, `openclaw channels status`
