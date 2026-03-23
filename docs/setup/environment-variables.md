# Environment Variables

## Backend (ruh-backend)

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `8000` | Backend HTTP port |
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `DAYTONA_API_KEY` | Yes | — | Daytona platform API key |
| `OPENROUTER_API_KEY` | One required | — | OpenRouter LLM key (highest priority) |
| `OPENAI_API_KEY` | One required | — | OpenAI API key |
| `ANTHROPIC_API_KEY` | One required | — | Anthropic API key |
| `GEMINI_API_KEY` | One required | — | Google Gemini API key |
| `TELEGRAM_BOT_TOKEN` | No | — | Telegram bot token for channel integration |
| `DISCORD_BOT_TOKEN` | No | — | Discord bot token |
| `ALLOWED_ORIGINS` | No | `http://localhost:3000` | Comma-separated CORS allowed origins |

**LLM priority order:** OpenRouter → OpenAI → Anthropic → Gemini. First key found is used.

---

## Developer UI (ruh-frontend)

| Variable | Required | Default | Description |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | No | `""` | Backend base URL. Empty means same-origin (works behind nginx). Set to `http://localhost:8000` for local dev without nginx. |

> `NEXT_PUBLIC_*` vars are baked into the build at compile time.

---

## Agent Builder UI (agent-builder-ui)

| Variable | Required | Default | Description |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | No | — | Backend API URL |
| `NEXT_PUBLIC_AUTH_URL` | No | — | Auth endpoint URL |
| `NEXT_PUBLIC_APP_URL` | No | — | Frontend app URL |
| `NEXT_PUBLIC_COOKIES_DOMAIN` | No | — | Cookie domain for multi-domain setups |
| `OPENCLAW_GATEWAY_URL` | No | — | Gateway URL (server-side only, not exposed to browser) |
| `OPENCLAW_GATEWAY_TOKEN` | No | — | Gateway auth token (server-side only) |
| `SIMPLE_LOGIN_PASSWORD` | No | — | Password for simple login flow |

---

## PostgreSQL

| Variable | Default | Description |
|---|---|---|
| `POSTGRES_USER` | `openclaw` | Database user |
| `POSTGRES_PASSWORD` | `changeme` | Database password — change in production |
| `POSTGRES_DB` | `openclaw` | Database name |
