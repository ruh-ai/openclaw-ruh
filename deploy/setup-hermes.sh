#!/bin/bash
# =============================================================================
# setup-hermes.sh — One-time Hermes setup on GCP VM
#
# Installs Redis, both CLI runners (Codex + Claude Code), creates the Hermes
# database, configures Codex for headless execution, and installs the systemd
# service. Run this once on a fresh VM after the main gcp-setup.sh.
#
# Usage:
#   ssh deploy@<vm-ip> 'bash /opt/ruh/deploy/setup-hermes.sh'
#
# Prerequisites:
#   - /opt/ruh checked out and deploy.sh has run at least once
#   - Docker + PostgreSQL container running
#   - /opt/ruh/secrets/hermes.env created with API keys
# =============================================================================

set -euo pipefail

APP_DIR="${SSH_DEPLOY_PATH:-/opt/ruh}"
HERMES_CODEX_HOME="/opt/ruh/.hermes-codex-home"
SECRETS_DIR="/opt/ruh/secrets"

echo "============================================"
echo " Hermes Setup $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "============================================"

# ── 1. Install Redis ─────────────────────────────────────────────────────────
echo "[1/7] Installing Redis..."
if command -v redis-server &>/dev/null; then
  echo "  Redis already installed"
else
  sudo apt-get update -qq
  sudo apt-get install -y --no-install-recommends redis-server
  sudo systemctl enable redis-server
  sudo systemctl start redis-server
fi
redis-cli ping | grep -q PONG && echo "  Redis OK" || { echo "  Redis failed to start"; exit 1; }

# ── 2. Install Bun ──────────────────────────────────────────────────────────
echo "[2/7] Installing Bun..."
if command -v bun &>/dev/null; then
  echo "  Bun already installed: $(bun --version)"
else
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:$PATH"
  echo 'export PATH="$HOME/.bun/bin:$PATH"' >> ~/.bashrc
  echo "  Bun installed: $(bun --version)"
fi

# ── 3. Install Codex CLI (default runner) ─────────────────────────────────────
echo "[3/7] Installing Codex CLI..."
if command -v codex &>/dev/null; then
  echo "  Codex already installed: $(codex --version 2>/dev/null || echo 'installed')"
else
  npm install -g @openai/codex
  echo "  Codex installed"
fi

# ── 4. Install Claude Code CLI (fallback runner) ─────────────────────────────
echo "[4/7] Installing Claude Code CLI..."
if command -v claude &>/dev/null; then
  echo "  Claude Code already installed"
else
  curl -fsSL https://cli.claude.com/install.sh | sh
  echo "  Claude Code installed"
fi

# ── 5. Configure Codex for headless execution ─────────────────────────────────
echo "[5/7] Configuring Codex for headless execution..."
mkdir -p "$HERMES_CODEX_HOME/.codex"

cat > "$HERMES_CODEX_HOME/.codex/config.toml" << 'TOML'
# Hermes-specific Codex config — headless, no approvals, workspace-safe
model = "o4-mini"
approval_policy = "never"
sandbox_mode = "workspace-write"
personality = "concise"

instructions = """
You are a specialist agent running inside Hermes on the openclaw-ruh-enterprise project.
Follow your agent contract instructions precisely.
Work in the /opt/ruh project directory.
"""
TOML

echo "  Codex config written to $HERMES_CODEX_HOME/.codex/config.toml"

# ── 6. Create Hermes database ────────────────────────────────────────────────
echo "[6/7] Creating Hermes database..."
# Find the running postgres container
PG_CONTAINER=$(docker ps --filter "name=postgres" --format "{{.Names}}" | head -1)
if [ -z "$PG_CONTAINER" ]; then
  echo "  WARNING: No PostgreSQL container found. Hermes DB must be created manually."
else
  docker exec "$PG_CONTAINER" psql -U openclaw -tc \
    "SELECT 1 FROM pg_database WHERE datname = 'hermes'" | grep -q 1 \
    && echo "  Hermes database already exists" \
    || { docker exec "$PG_CONTAINER" psql -U openclaw -c "CREATE DATABASE hermes;" && echo "  Hermes database created"; }
fi

# ── 7. Install and start systemd service ──────────────────────────────────────
echo "[7/7] Installing Hermes systemd service..."

# Create secrets file if it doesn't exist
if [ ! -f "$SECRETS_DIR/hermes.env" ]; then
  sudo mkdir -p "$SECRETS_DIR"
  sudo chmod 700 "$SECRETS_DIR"
  cat > "$SECRETS_DIR/hermes.env" << 'ENV'
# Hermes secrets — fill in before starting the service
# At least one of OPENAI_API_KEY or ANTHROPIC_API_KEY is required
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
LINEAR_WEBHOOK_SECRET=
LINEAR_API_KEY=
ENV
  echo "  Created $SECRETS_DIR/hermes.env — FILL IN API KEYS before starting"
fi

# Install Hermes dependencies
cd "$APP_DIR/.claude/hermes-backend"
bun install --production

# Install systemd service
sudo cp "$APP_DIR/deploy/hermes-backend.service" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable hermes-backend

echo ""
echo "============================================"
echo " Hermes Setup Complete"
echo "============================================"
echo ""
echo " Next steps:"
echo "   1. Edit $SECRETS_DIR/hermes.env with your API keys"
echo "   2. Start Hermes: sudo systemctl start hermes-backend"
echo "   3. Check health: curl http://localhost:8100/health"
echo "   4. Register Linear webhook at:"
echo "      https://api.codezero2pi.com/hermes/api/queue/webhooks/linear"
echo ""
echo " Runner management:"
echo "   Check:  curl localhost:8100/api/queue/health"
echo "   Switch: curl -X PATCH localhost:8100/api/queue/runner -H 'Content-Type: application/json' -d '{\"runner\": \"claude\"}'"
echo "   Logs:   journalctl -u hermes-backend -f"
echo ""
