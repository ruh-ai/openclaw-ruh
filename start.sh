#!/usr/bin/env bash
# Start backend and frontend concurrently (development)

set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

# ── Check Bun is installed ────────────────────────────────────────────────────
if ! command -v bun &>/dev/null; then
  echo "ERROR: bun is not installed. Install it from https://bun.sh"
  exit 1
fi

# ── Backend ───────────────────────────────────────────────────────────────────
echo "==> Installing backend dependencies..."
cd "$ROOT/ruh-backend"
bun install --silent

if [ ! -f ".env" ]; then
  cp .env.example .env
  echo "    Created ruh-backend/.env — add your DAYTONA_API_KEY and DATABASE_URL before using the app."
fi

echo "==> Starting backend on http://localhost:8000 ..."
bun run --watch src/index.ts &
BACKEND_PID=$!

# ── Frontend ──────────────────────────────────────────────────────────────────
echo "==> Installing frontend dependencies..."
cd "$ROOT/ruh-frontend"
npm install --silent

echo "==> Starting frontend on http://localhost:3000 ..."
npm run dev &
FRONTEND_PID=$!

echo ""
echo "================================================================"
echo "  Backend  : http://localhost:8000"
echo "  Frontend : http://localhost:3000"
echo "================================================================"
echo "Press Ctrl+C to stop both servers."

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM
wait
