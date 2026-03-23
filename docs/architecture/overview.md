# Architecture Overview

OpenClaw is a full-stack platform for deploying and managing AI agent sandboxes. Each sandbox is a Daytona-managed container running the `openclaw` gateway, which proxies LLM requests and manages agent state.

## System Diagram

```
                        ┌──────────────────────────────────────┐
                        │            Nginx (port 80)           │
                        │                                      │
                        │  /api/*      → backend:8000          │
                        │  /builder/*  → agent-builder-ui:3000 │
                        │  /           → frontend:3001         │
                        └──────────────┬───────────────────────┘
                                       │
              ┌────────────────────────┼────────────────────────┐
              ▼                        ▼                         ▼
   ┌─────────────────┐     ┌─────────────────────┐   ┌──────────────────────┐
   │  ruh-frontend   │     │    ruh-backend       │   │  agent-builder-ui    │
   │  Next.js 16     │     │    Bun + Express     │   │  Next.js 15          │
   │  port 3001      │     │    port 8000         │   │  port 3000           │
   └─────────────────┘     └────────┬────────────┘   └──────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
           ┌──────────────┐  ┌──────────┐  ┌──────────────────┐
           │  PostgreSQL  │  │  Daytona │  │  AI Sandboxes    │
           │  port 5432   │  │  Platform│  │  (openclaw CLI)  │
           └──────────────┘  └──────────┘  └──────────────────┘
```

## Services

| Service | Technology | Port | Purpose |
|---|---|---|---|
| nginx | nginx 1.27-alpine | 80 | Reverse proxy and routing |
| ruh-backend | TypeScript + Bun + Express | 8000 | REST API, sandbox management |
| ruh-frontend | Next.js 16 | 3001 | Developer UI |
| agent-builder-ui | Next.js 15 + shadcn/ui | 3000 | Agent creation wizard |
| postgres | PostgreSQL 16 | 5432 | Persistence |

## Data Flow

### Sandbox Creation
1. User triggers sandbox creation in frontend
2. Backend calls Daytona API to provision a container (2 vCPU, 2GB RAM, node:22-bookworm)
3. Backend installs `openclaw@latest` inside the container and runs `openclaw onboard`
4. Gateway starts on port 18789 inside the sandbox
5. Backend polls for device pairing approval (5-min timeout)
6. Sandbox metadata (gateway URL, token, ssh command) saved to PostgreSQL

### Chat Request
1. Frontend sends message to `POST /api/sandboxes/:id/chat`
2. Backend attaches `x-openclaw-session-key` header (conversation context)
3. Backend proxies to sandbox gateway at `/v1/chat/completions`
4. Response streamed back to frontend via SSE

### Cron Execution
1. Backend executes `openclaw cron` CLI commands inside sandbox via Daytona process executor
2. Supports three schedule types: standard cron expressions, interval (ms), or specific time

## Database Schema

### sandboxes
| Column | Type | Notes |
|---|---|---|
| sandbox_id | TEXT PK | Daytona sandbox ID |
| sandbox_name | TEXT | Default: `openclaw-gateway` |
| sandbox_state | TEXT | Current lifecycle state |
| dashboard_url | TEXT | Daytona dashboard link |
| signed_url | TEXT | Signed preview URL |
| standard_url | TEXT | Standard access URL |
| preview_token | TEXT | Preview auth token |
| gateway_token | TEXT | Gateway auth token |
| gateway_port | INTEGER | Default: 18789 |
| ssh_command | TEXT | SSH access command |
| created_at | TIMESTAMPTZ | |
| approved | BOOLEAN | Device pairing approved |

### conversations
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | UUID |
| sandbox_id | TEXT | FK → sandboxes |
| name | TEXT | Default: `New Conversation` |
| model | TEXT | Default: `openclaw-default` |
| openclaw_session_key | TEXT | Gateway session key |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |
| message_count | INTEGER | |

### messages
| Column | Type | Notes |
|---|---|---|
| id | SERIAL PK | |
| conversation_id | TEXT | FK → conversations (CASCADE DELETE) |
| role | TEXT | `user` or `assistant` |
| content | TEXT | |
| created_at | TIMESTAMPTZ | |

## External Dependencies

| Dependency | Purpose |
|---|---|
| Daytona SDK (`@daytonaio/sdk`) | Sandbox lifecycle management |
| OpenClaw CLI | Installed in sandbox; manages gateway, crons, channels |
| OpenRouter / OpenAI / Anthropic / Gemini | LLM providers (priority order) |
| Telegram / Slack | Optional channel integrations |
