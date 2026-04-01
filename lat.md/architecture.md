# Architecture

Core system design for openclaw-ruh-enterprise — the platform for creating and deploying AI digital employees.

## Services

Four services compose the platform, each with a distinct responsibility.

### ruh-backend

TypeScript/Bun REST API handling sandbox orchestration, agent lifecycle, and persistence. Runs on port 8000.

- [[ruh-backend/src/app.ts#app]] — Express application with all API routes
- [[ruh-backend/src/sandboxManager.ts#createOpenclawSandbox]] — Container provisioning orchestrator
- [[ruh-backend/src/agentStore.ts]] — Agent CRUD and persistence

### agent-builder-ui

Next.js 15 conversational agent builder where users create and configure their digital employees. Runs on port 3000.

- [[agent-builder-ui/app/(platform)/agents/create/page.tsx]] — Create agent wizard
- [[agent-builder-ui/app/api/openclaw/route.ts]] — Bridge to OpenClaw gateway
- [[agent-builder-ui/lib/openclaw/copilot-state.ts]] — Wizard state management

### ruh-frontend

Next.js 16 client application where end users work alongside their deployed assistants. Runs on port 3001.

### agent-runtime

Per-agent Next.js backend + dashboard that runs inside each sandbox container on port 8080. Provides task management, work reports, activity logging, and a mission control dashboard.

- [[agent-runtime/app/api/tasks/route.ts]] — Task CRUD API
- [[agent-runtime/app/api/stats/route.ts]] — Dashboard statistics
- [[agent-runtime/app/(dashboard)/page.tsx]] — Mission control overview

## Sandbox Model

Each agent sandbox is a Docker container running the OpenClaw CLI gateway with pre-installed tools.

### Container Image

The `ruh-sandbox:latest` Docker image is pre-built with Node.js 22, OpenClaw CLI (pinned to 2026.3.24), Chromium, VNC stack, and the agent-runtime dashboard. Container startup takes ~5 seconds instead of ~3 minutes.

- [[ruh-backend/Dockerfile.sandbox]] — Multi-stage build definition
- [[ruh-backend/scripts/build-sandbox-image.sh]] — Image build script

### Port Mapping

Docker assigns random host ports for each container. Key internal ports: 18789 (OpenClaw gateway), 6080 (VNC websocket), 8080 (agent-runtime dashboard).

## Data Flow

Messages flow: user → agent-builder-ui → /api/openclaw bridge → ruh-backend → Docker container → OpenClaw gateway → LLM provider → response back through the chain.

### Gateway Connection

The bridge resolves the gateway URL from the sandbox record. For forge sandboxes (agent-specific containers), it calls [[ruh-backend/src/utils.ts#gatewayUrlAndHeaders]] to get the WebSocket URL and auth token.

### LLM Provider Priority

OpenRouter → OpenAI → Anthropic → Gemini → Ollama (fallback). Shared Codex OAuth is preferred when configured.
