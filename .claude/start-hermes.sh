#!/bin/bash
# Start Hermes Backend + Mission Control
# Usage: ./start-hermes.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/hermes-backend"
FRONTEND_DIR="$SCRIPT_DIR/hermes-mission-control"

echo "[hermes] Starting Hermes infrastructure..."

# Ensure PostgreSQL is running
echo "[hermes] Checking PostgreSQL..."
docker exec pg pg_isready -U openclaw >/dev/null 2>&1 || {
  echo "[hermes] Starting PostgreSQL..."
  docker start pg 2>/dev/null || docker run -d --name pg -e POSTGRES_USER=openclaw -e POSTGRES_PASSWORD=changeme -e POSTGRES_DB=openclaw -p 5432:5432 postgres:16-alpine
  sleep 2
}

# Ensure hermes database exists
echo "[hermes] Checking database..."
docker exec pg psql -U openclaw -d openclaw -tc "SELECT 1 FROM pg_database WHERE datname = 'hermes'" 2>/dev/null | grep -q 1 || {
  echo "[hermes] Creating hermes database..."
  docker exec pg psql -U openclaw -d openclaw -c "CREATE DATABASE hermes" 2>/dev/null
}

# Ensure Redis is running
echo "[hermes] Checking Redis..."
redis-cli ping >/dev/null 2>&1 || {
  echo "[hermes] Starting Redis..."
  docker start hermes-redis 2>/dev/null || docker run -d --name hermes-redis -p 6379:6379 redis:7-alpine
  sleep 1
}

# Kill any existing processes on our ports
lsof -ti:8100 2>/dev/null | xargs kill 2>/dev/null || true
lsof -ti:3333 2>/dev/null | xargs kill 2>/dev/null || true

# Start backend
echo "[hermes] Starting backend (port 8100)..."
cd "$BACKEND_DIR"
bun run src/index.ts &
BACKEND_PID=$!

# Wait for backend to be ready
for i in $(seq 1 10); do
  if curl -s http://localhost:8100/health > /dev/null 2>&1; then
    echo "[hermes] Backend ready"
    break
  fi
  sleep 1
done

# Start mission control
echo "[hermes] Starting mission control (port 3333)..."
cd "$FRONTEND_DIR"
npx next dev -p 3333 &
FRONTEND_PID=$!

echo ""
echo "[hermes] ================================================"
echo "[hermes]   Hermes Backend:    http://localhost:8100"
echo "[hermes]   Mission Control:   http://localhost:3333"
echo "[hermes]   Redis:             localhost:6379"
echo "[hermes]   Task Queue:        BullMQ (5 queues)"
echo "[hermes]   Workers:           autonomous mode"
echo "[hermes] ================================================"
echo ""
echo "[hermes] Submit tasks:  curl -X POST localhost:8100/api/queue/tasks -H 'Content-Type: application/json' -d '{\"description\":\"your task\"}'"
echo "[hermes] Queue stats:   curl localhost:8100/api/queue/stats"
echo "[hermes] Queue health:  curl localhost:8100/api/queue/health"
echo ""
echo "[hermes] Press Ctrl+C to stop"

# Handle shutdown
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo '[hermes] Stopped'" EXIT

wait
