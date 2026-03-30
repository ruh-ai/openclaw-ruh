#!/bin/bash
# =============================================================================
# sandbox-agent-runtime — Start the per-agent backend + dashboard
# =============================================================================
# Runs inside the sandbox container. Starts the Next.js standalone server
# on port 8080 with the agent's SQLite database.
# Idempotent: safe to call multiple times.
# =============================================================================

set -euo pipefail

RUNTIME_DIR="/opt/agent-runtime"
DATA_DIR="${AGENT_DATA_DIR:-/root/.agent-runtime}"
PORT="${AGENT_RUNTIME_PORT:-8080}"

# Check if already running
if pgrep -f "node.*agent-runtime.*server.js" > /dev/null 2>&1; then
  echo "[agent-runtime] Already running on port ${PORT}"
  exit 0
fi

# Initialize database if needed
mkdir -p "$DATA_DIR"
if [ ! -f "$DATA_DIR/agent.db" ]; then
  echo "[agent-runtime] Initializing database..."
  cd "$RUNTIME_DIR" && node src/db-init.mjs
fi

# Start the standalone Next.js server
echo "[agent-runtime] Starting dashboard on port ${PORT}..."
cd "$RUNTIME_DIR"
HOSTNAME=0.0.0.0 PORT="$PORT" AGENT_DATA_DIR="$DATA_DIR" \
  nohup node server.js > /tmp/agent-runtime.log 2>&1 &

# Wait for startup
for i in $(seq 1 10); do
  if curl -sf "http://127.0.0.1:${PORT}" > /dev/null 2>&1; then
    echo "[agent-runtime] Dashboard ready at http://0.0.0.0:${PORT}"
    exit 0
  fi
  sleep 1
done

echo "[agent-runtime] Warning: dashboard may not be ready yet (check /tmp/agent-runtime.log)"
