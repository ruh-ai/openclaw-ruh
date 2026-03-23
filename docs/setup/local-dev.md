# Local Development Setup

## Prerequisites

- [Bun](https://bun.sh) (backend runtime)
- Node.js 22+ (frontend)
- npm + yarn (frontend package managers)
- Docker + Docker Compose (for production-like local runs)
- A [Daytona](https://app.daytona.io) account and API key
- At least one LLM API key (OpenRouter, OpenAI, Anthropic, or Gemini)

## 1. Clone and configure environment

```bash
git clone https://github.com/ruh-ai/openclaw-ruh-enterprise
cd openclaw-ruh-enterprise
cp .env.example .env
```

Edit `.env` and fill in:

```env
# Required
DAYTONA_API_KEY=your_daytona_api_key
DATABASE_URL=postgresql://openclaw:changeme@localhost:5432/openclaw

# At least one LLM key (OpenRouter preferred)
OPENROUTER_API_KEY=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GEMINI_API_KEY=

# Optional
TELEGRAM_BOT_TOKEN=
DISCORD_BOT_TOKEN=

# CORS — match your frontend origin
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
```

## 2. Start with the dev script

```bash
./start.sh
```

This installs dependencies and starts all three services concurrently:
- Backend on `http://localhost:8000`
- Agent Builder UI on `http://localhost:3000`
- Developer UI on `http://localhost:3001`

> You'll need PostgreSQL running locally or swap `DATABASE_URL` to point at a remote instance.

## 3. Start with Docker Compose (recommended)

Starts everything including PostgreSQL and Nginx:

```bash
docker compose up -d
```

Access the app at `http://localhost`.

- `/` → Developer UI
- `/builder/` → Agent Builder UI
- `/api/` → Backend API
- `/health` → Health check

To stop:
```bash
docker compose down
```

To rebuild after code changes:
```bash
docker compose up -d --build
```

## Service Ports (local dev)

| Service | URL |
|---|---|
| Backend API | http://localhost:8000 |
| Developer UI | http://localhost:3001 |
| Agent Builder | http://localhost:3000 |
| Nginx (Docker only) | http://localhost:80 |
| PostgreSQL | localhost:5432 |

## Running tests

**Backend:**
```bash
cd ruh-backend
bun test
```

**Frontend:**
```bash
cd ruh-frontend
npm test           # Unit tests (Jest)
npx playwright test  # E2E tests
```

## Common issues

**Backend won't start:** Check `DATABASE_URL` is reachable. The backend initializes tables on startup.

**Sandbox creation fails:** Verify `DAYTONA_API_KEY` is valid. Check sandbox logs in the SSE stream.

**CORS errors in browser:** Make sure your frontend origin is in `ALLOWED_ORIGINS`.

**Gateway unreachable after sandbox creation:** Sandbox may still be booting. The frontend polls status — wait for `approved` event.
