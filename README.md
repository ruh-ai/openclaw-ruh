<p align="center">
  <img src="https://ruh.ai/logo.svg" alt="Ruh.ai" width="120" />
</p>

<h1 align="center">Ruh</h1>

<p align="center">
  <strong>Open-source platform for creating AI employees with a soul.</strong><br/>
  Not bots. Not automations. Digital teammates who understand you, remember you, and grow with you.
</p>

<p align="center">
  <a href="https://ruh.ai">Website</a> &middot;
  <a href="#quickstart">Quickstart</a> &middot;
  <a href="docs/knowledge-base/001-architecture.md">Architecture</a> &middot;
  <a href="#contributing">Contributing</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-5.x-blue?logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Bun-1.3-black?logo=bun" alt="Bun" />
  <img src="https://img.shields.io/badge/Next.js-15%2F16-white?logo=next.js&logoColor=black" alt="Next.js" />
  <img src="https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Docker-required-2496ED?logo=docker&logoColor=white" alt="Docker" />
  <img src="https://img.shields.io/badge/License-Apache%202.0-green" alt="License" />
</p>

---

## What is Ruh?

Ruh is an open-source platform for building **AI employees**. Not chatbots. Not workflow automations. Agents that have personality, context, judgment, and memory. Digital colleagues you actually want to work with.

Each agent gets its own Docker container from day one. You shape its identity through conversation with an Architect agent, and what you build is what runs. No deploy step. No config export. The container IS the agent.

```
You describe what the agent should do
    |
    v
Architect agent asks the right questions
    |
    v
Writes SOUL.md, skills, tools, triggers into the container
    |
    v
You test it in the same container
    |
    v
Ship to GitHub. Agent is live.
```

### Why Ruh?

- **Agents, not bots.** Each agent has a SOUL.md that defines its personality, purpose, and behavior rules. Not a system prompt. An identity.
- **Container = Agent.** No separate deploy step. Build and run happen in the same Docker container from minute one.
- **Conversational creation.** An Architect agent guides you through building your agent. No forms. No YAML. Just conversation.
- **Skills as files.** Each capability is a `SKILL.md` in the workspace. Portable, version-controlled, human-readable.
- **LLM-agnostic.** OpenRouter, OpenAI, Anthropic, Gemini, Ollama. Priority-ordered fallback chain.
- **Self-improving.** Integrates with [OpenSpace](https://github.com/HKUDS/OpenSpace) for self-evolving skills and [Paperclip](https://github.com/paperclipai/paperclip) for multi-agent orchestration.

---

## Architecture

```
+---------------------------+     +---------------------------+     +------------------+
|   Agent Builder UI        |     |   Client App              |     |   Admin Panel    |
|   (Next.js 15, port 3000) |     |   (Next.js 16, port 3001) |     |   (port 3002)    |
|   Create & shape agents   |     |   Work with agents daily  |     |   Platform mgmt  |
+-------------|-------------+     +-------------|-------------+     +--------|--------+
              |                                 |                            |
              +----------------+----------------+----------------------------+
                               |
                               v
              +---------------------------------------+
              |           ruh-backend                  |
              |      (Bun + Express, port 8000)        |
              |                                        |
              |  REST API | Sandbox Orchestration       |
              |  Auth (JWT) | Marketplace | SSE         |
              +------|------------|----------|---------+
                     |            |          |
                     v            v          v
              +----------+  +---------+  +----------+
              | Postgres |  | Docker  |  | OpenClaw |
              |    16    |  | Sandbox |  | Gateway  |
              +----------+  +---------+  +----------+
```

| Service | Stack | Purpose |
|---|---|---|
| **ruh-backend** | TypeScript, Bun, Express, PostgreSQL | API, sandbox orchestration, auth, marketplace |
| **agent-builder-ui** | Next.js 15, React, Tailwind | Conversational agent creation (7-stage wizard) |
| **ruh-frontend** | Next.js 16, React | Client app for daily agent interaction |
| **admin-ui** | Next.js 15, React | Platform management and moderation |
| **@ruh/marketplace-ui** | React (shared package) | Reusable marketplace components |

---

## Quickstart

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) (PostgreSQL + agent sandboxes)
- [Bun](https://bun.sh/) >= 1.3
- [Node.js](https://nodejs.org/) >= 20
- At least one LLM API key (OpenRouter, OpenAI, Anthropic, or Gemini)

### 1. Clone and configure

```bash
git clone https://github.com/ruh-ai/openclaw-ruh.git
cd openclaw-ruh
cp ruh-backend/.env.example ruh-backend/.env
# Edit ruh-backend/.env and add your LLM API key
```

### 2. Start PostgreSQL

```bash
docker run -d --name pg \
  -e POSTGRES_USER=openclaw \
  -e POSTGRES_PASSWORD=changeme \
  -e POSTGRES_DB=openclaw \
  -p 5432:5432 postgres:16-alpine
```

### 3. Start services

```bash
./start.sh
```

Or individually:

```bash
cd ruh-backend && bun install && bun run dev     # API on :8000
cd agent-builder-ui && bun install && bun run dev # Builder on :3000
cd ruh-frontend && npm install && npm run dev     # Client on :3001
```

### 4. Create your first agent

Open `http://localhost:3000` and describe what your agent should do.

---

## Agent Creation: 7-Stage Lifecycle

| Stage | What happens |
|---|---|
| **Think** | Describe the agent. Architect generates PRD + TRD. |
| **Plan** | Architect designs skills, tools, triggers, workflow. |
| **Build** | Skills written into the container workspace as SKILL.md files. |
| **Review** | Inspect configuration. Modify skills, tools, or triggers. |
| **Test** | Chat with the real agent in its own container. Iterate. |
| **Ship** | Push workspace to GitHub. Agent goes live. |
| **Reflect** | Review build summary and improvement suggestions. |

---

## Agent Workspace

Every agent lives in a Docker container with this workspace structure:

```
~/.openclaw/workspace/
  SOUL.md                  # Identity: personality, purpose, rules
  skills/
    campaign-monitor/
      SKILL.md             # What this skill does, steps, env vars
    budget-manager/
      SKILL.md
  tools/
    google-ads.json        # External service connection config
  triggers/
    schedule.json          # Cron triggers
    on-demand.json         # Chat triggers
  .openclaw/
    workflow.json           # Skill execution order
```

Skills are Markdown files. Tools are JSON configs. Everything is human-readable, version-controlled, and portable.

---

## Key Design Decisions

1. **Container = Agent.** Each sandbox is `node:22-bookworm` with OpenClaw installed. Backend interacts via `docker exec`.
2. **SSE for long-running ops.** Sandbox creation streams progress. No blocking HTTP requests.
3. **Two frontends by design.** Builder (create agents) and Client (use agents) are separate apps with separate concerns.
4. **OpenClaw Architect.** The builder has no LLM logic of its own. It routes to an OpenClaw agent inside the sandbox.
5. **Three user tiers.** Admin (platform management), Developer (build agents), End User (use agents).
6. **Auth built in.** JWT access/refresh tokens, bcrypt, httpOnly cookies, role-based middleware. Disabled in dev.

---

## Testing

```bash
npm run test:all          # Unit + contract tests across all services
npm run test:integration  # Integration tests (needs Docker Postgres)
npm run typecheck:all     # TypeScript check all services
npm run coverage:all      # Coverage with threshold enforcement
```

| Service | Threshold | Runner |
|---|---|---|
| ruh-backend | 75% | bun:test |
| agent-builder-ui | 60% | bun:test |
| ruh-frontend | 60% | Jest |
| admin-ui | 50% | bun:test |
| marketplace-ui | 80% | bun:test |

---

## Project Structure

```
openclaw-ruh/
  ruh-backend/            # Express API + sandbox orchestration
  agent-builder-ui/       # Agent creation wizard (Next.js 15)
  ruh-frontend/           # Customer web application (Next.js 16)
  ruh_app/                # Flutter customer application
  admin-ui/               # Admin panel (Next.js 15)
  packages/
    marketplace-ui/       # Shared marketplace components
  docs/
    knowledge-base/       # Obsidian-compatible wiki
    plans/                # Architecture specs
  k8s/                    # Kubernetes manifests
  nginx/                  # Reverse proxy config
```

---

## Documentation

The knowledge base uses Obsidian-compatible Markdown with `[[wikilinks]]`.

| I want to... | Read |
|---|---|
| Understand the system | [001-architecture.md](docs/knowledge-base/001-architecture.md) |
| Add a backend endpoint | [004-api-reference.md](docs/knowledge-base/004-api-reference.md) |
| Work on the builder UI | [008-agent-builder-ui.md](docs/knowledge-base/008-agent-builder-ui.md) |
| Understand sandboxes | [003-sandbox-lifecycle.md](docs/knowledge-base/003-sandbox-lifecycle.md) |
| Work on auth | [014-auth-system.md](docs/knowledge-base/014-auth-system.md) |
| See the full index | [000-INDEX.md](docs/knowledge-base/000-INDEX.md) |

---

## Integrations

Ruh is designed to work with the broader AI agent ecosystem:

- **[OpenSpace](https://github.com/HKUDS/OpenSpace)** — Self-evolving skill engine. Agents learn from their work and share proven patterns.
- **[Paperclip](https://github.com/paperclipai/paperclip)** — AI company orchestration. Organize agents into teams with budgets, goals, and governance.
- **[OpenClaw](https://github.com/openclaw)** — The agent runtime that powers every Ruh sandbox.

---

## Roadmap

- [ ] Event-driven architecture for real-time tool execution
- [ ] Agent marketplace with community templates
- [ ] Flutter desktop builds for customer app
- [ ] Mobile companion app
- [ ] OpenSpace self-evolving skills integration
- [ ] Multi-agent delegation and coordination
- [ ] Paperclip company orchestration

---

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

```bash
# Fork, clone, branch
git checkout -b feat/my-feature

# Make changes, write tests
npm run test:all
npm run typecheck:all

# Submit PR against dev
```

---

## License

[Apache License 2.0](LICENSE)

---

<p align="center">
  <strong>Built by <a href="https://ruh.ai">Ruh.ai</a></strong><br/>
  Digital employees with a soul.
</p>
