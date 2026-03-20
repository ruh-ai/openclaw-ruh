# OpenClaw Deploy

Full-stack deployment of the OpenClaw gateway manager — TypeScript/Bun backend, Next.js frontend, PostgreSQL database, and Nginx reverse proxy.

---

## Stack

| Layer | Technology |
|---|---|
| Backend | TypeScript, Bun, Express |
| Frontend (Developer) | Next.js 16, TypeScript, Tailwind CSS |
| Agent Builder UI | Next.js 15, TypeScript, Tailwind CSS, shadcn/ui |
| Database | PostgreSQL 16 |
| Proxy | Nginx |
| Sandbox runtime | Daytona (`@daytonaio/sdk`) |

---

## Project Structure

```
.
├── ruh-backend/         # TypeScript/Bun REST API
│   ├── src/
│   │   ├── index.ts           # Express app + all routes
│   │   ├── db.ts              # PostgreSQL connection pool
│   │   ├── store.ts           # Sandbox CRUD
│   │   ├── conversationStore.ts  # Conversations + messages
│   │   ├── channelManager.ts  # Telegram/Slack config via Daytona
│   │   └── sandboxManager.ts  # Sandbox creation + SSE streaming
│   ├── .env.example
│   ├── Dockerfile
│   └── package.json
├── ruh-frontend/        # Next.js developer UI (port 3001)
├── agent-builder-ui/    # Next.js agent builder UI (port 3000)
├── nginx/               # Reverse proxy config
├── k8s/                 # Kubernetes deployment manifests
├── docker-compose.yml   # Production stack
├── start.sh             # Local development helper
└── .env.example         # Root env template for docker-compose
```

---

## Quick Start (Local Development)

### Prerequisites

- [Bun](https://bun.sh) `>= 1.0`
- Node.js `>= 18` (for the frontend)
- PostgreSQL running locally, **or** spin one up with Docker:

```bash
docker run -d --name pg \
  -e POSTGRES_USER=openclaw \
  -e POSTGRES_PASSWORD=changeme \
  -e POSTGRES_DB=openclaw \
  -p 5432:5432 \
  postgres:16-alpine
```

### 1. Configure environment

```bash
cp .env.example .env
# Edit .env and set DAYTONA_API_KEY and at least one LLM key
```

### 2. Run both servers

```bash
./start.sh
```

| Service | URL |
|---|---|
| Backend API | http://localhost:8000 |
| Agent Builder UI | http://localhost:3000 |
| Frontend (Developer) | http://localhost:3001 |

### Run backend only

```bash
cd backend-ts
bun install
bun run dev        # hot-reload
# or
bun run start      # production
```

---

## Environment Variables

Copy `backend-ts/.env.example` to `backend-ts/.env` and fill in the values.

| Variable | Required | Description |
|---|---|---|
| `DAYTONA_API_KEY` | Yes | Daytona platform API key |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `POSTGRES_USER` | docker-compose | PG username |
| `POSTGRES_PASSWORD` | docker-compose | PG password |
| `POSTGRES_DB` | docker-compose | PG database name |
| `ANTHROPIC_API_KEY` | One LLM key required | Anthropic API key |
| `OPENAI_API_KEY` | One LLM key required | OpenAI API key |
| `OPENROUTER_API_KEY` | One LLM key required | OpenRouter API key (highest priority) |
| `GEMINI_API_KEY` | One LLM key required | Gemini API key |
| `TELEGRAM_BOT_TOKEN` | No | Telegram bot token for channel integration |
| `DISCORD_BOT_TOKEN` | No | Discord bot token for channel integration |
| `PORT` | No | Backend port (default: `8000`) |
| `ALLOWED_ORIGINS` | No | Comma-separated CORS origins (default: `http://localhost:3000`) |

---

## Production (Docker Compose)

### 1. Configure environment

```bash
cp .env.example .env
# Edit .env — set DAYTONA_API_KEY, LLM keys, and update ALLOWED_ORIGINS
```

### 2. Start the stack

```bash
docker compose up -d
```

The stack starts:
1. **postgres** — database
2. **backend** — waits for postgres health check
3. **frontend** — waits for backend health check
4. **nginx** — reverse proxy on port `80`

Access the app at `http://localhost`.

### Useful commands

```bash
# View logs
docker compose logs -f backend

# Restart a single service
docker compose restart backend

# Stop and remove everything
docker compose down

# Stop and also remove the database volume
docker compose down -v
```

---

## API Overview

### Health

```
GET  /health
```

### Sandboxes

```
POST   /api/sandboxes/create
GET    /api/sandboxes/stream/:stream_id    (SSE)
GET    /api/sandboxes
GET    /api/sandboxes/:id
DELETE /api/sandboxes/:id
```

### Gateway Proxy

```
GET  /api/sandboxes/:id/models
GET  /api/sandboxes/:id/status
POST /api/sandboxes/:id/chat
```

### Conversations

```
GET    /api/sandboxes/:id/conversations
POST   /api/sandboxes/:id/conversations
GET    /api/sandboxes/:id/conversations/:conv/messages
POST   /api/sandboxes/:id/conversations/:conv/messages
PATCH  /api/sandboxes/:id/conversations/:conv
DELETE /api/sandboxes/:id/conversations/:conv
```

### Cron Jobs

```
GET    /api/sandboxes/:id/crons
POST   /api/sandboxes/:id/crons
PATCH  /api/sandboxes/:id/crons/:job
DELETE /api/sandboxes/:id/crons/:job
POST   /api/sandboxes/:id/crons/:job/toggle
POST   /api/sandboxes/:id/crons/:job/run
GET    /api/sandboxes/:id/crons/:job/runs
```

### Channels (Telegram / Slack)

```
GET  /api/sandboxes/:id/channels
PUT  /api/sandboxes/:id/channels/telegram
PUT  /api/sandboxes/:id/channels/slack
GET  /api/sandboxes/:id/channels/:channel/status
GET  /api/sandboxes/:id/channels/:channel/pairing
POST /api/sandboxes/:id/channels/:channel/pairing/approve
```
