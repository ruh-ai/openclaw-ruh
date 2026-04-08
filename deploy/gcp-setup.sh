#!/bin/bash
# =============================================================================
# gcp-setup.sh — Provision a GCE VM for openclaw-ruh-enterprise
#
# Run this on a fresh Ubuntu 24.04 VM:
#   curl -fsSL https://raw.githubusercontent.com/ruh-ai/openclaw-ruh/main/deploy/gcp-setup.sh | bash
#   # OR: scp this file to the VM and run it
#
# After running, edit /opt/ruh/.env with your LLM API keys, then:
#   cd /opt/ruh && docker compose up -d
# =============================================================================

set -euo pipefail

APP_DIR="/opt/ruh"
REPO_URL="https://github.com/ruh-ai/openclaw-ruh.git"

echo "============================================"
echo " openclaw-ruh GCP Setup"
echo "============================================"
echo ""

# ── 1. Install Docker CE ─────────────────────────────────────────────────────
if command -v docker &>/dev/null; then
  echo "[1/5] Docker already installed: $(docker --version)"
else
  echo "[1/5] Installing Docker CE..."
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$USER"
  echo "  Docker installed: $(docker --version)"
fi

# Ensure docker compose plugin is available
if docker compose version &>/dev/null; then
  echo "  Docker Compose: $(docker compose version --short)"
else
  echo "ERROR: docker compose plugin not found. Install it manually."
  exit 1
fi

# ── 2. Clone the repository ──────────────────────────────────────────────────
if [ -d "$APP_DIR" ]; then
  echo "[2/5] Repo already cloned at $APP_DIR — pulling latest..."
  cd "$APP_DIR"
  sudo -u "$USER" git pull origin main || git pull origin dev || true
else
  echo "[2/5] Cloning repository..."
  sudo git clone "$REPO_URL" "$APP_DIR"
  sudo chown -R "$USER:$USER" "$APP_DIR"
fi
cd "$APP_DIR"

# ── 3. Create .env from template ─────────────────────────────────────────────
if [ -f "$APP_DIR/.env" ]; then
  echo "[3/5] .env already exists — skipping (edit manually if needed)"
else
  echo "[3/5] Creating .env from template..."
  cp .env.example .env

  # Generate random secrets for JWT
  JWT_ACCESS=$(openssl rand -hex 32)
  JWT_REFRESH=$(openssl rand -hex 32)
  PG_PASSWORD=$(openssl rand -hex 16)
  CRED_KEY=$(openssl rand -hex 32)

  # Patch defaults with generated secrets
  sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${PG_PASSWORD}|" .env
  sed -i "s|^DATABASE_URL=.*|DATABASE_URL=postgresql://openclaw:${PG_PASSWORD}@postgres:5432/openclaw|" .env
  sed -i "s|^JWT_ACCESS_SECRET=.*|JWT_ACCESS_SECRET=${JWT_ACCESS}|" .env
  sed -i "s|^JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=${JWT_REFRESH}|" .env
  sed -i "s|^AGENT_CREDENTIALS_KEY=.*|AGENT_CREDENTIALS_KEY=${CRED_KEY}|" .env

  # Set ALLOWED_ORIGINS to the VM's external IP
  EXTERNAL_IP=$(curl -sf http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip -H "Metadata-Flavor: Google" || echo "localhost")
  sed -i "s|^ALLOWED_ORIGINS=.*|ALLOWED_ORIGINS=http://${EXTERNAL_IP}|" .env

  echo "  .env created with generated secrets"
  echo ""
  echo "  ┌─────────────────────────────────────────────────────────┐"
  echo "  │  IMPORTANT: Edit .env to add your LLM API keys!        │"
  echo "  │                                                         │"
  echo "  │  nano /opt/ruh/.env                                     │"
  echo "  │                                                         │"
  echo "  │  Set at least one of:                                   │"
  echo "  │    ANTHROPIC_API_KEY=sk-ant-...                         │"
  echo "  │    OPENAI_API_KEY=sk-...                                │"
  echo "  │    OPENROUTER_API_KEY=sk-or-...                         │"
  echo "  └─────────────────────────────────────────────────────────┘"
  echo ""
fi

# ── 4. Build the sandbox image ────────────────────────────────────────────────
if docker images ruh-sandbox:latest --format "{{.ID}}" | grep -q .; then
  echo "[4/5] Sandbox image already built — skipping"
  echo "  (To rebuild: bash ruh-backend/scripts/build-sandbox-image.sh)"
else
  echo "[4/5] Building sandbox image (this takes 10-15 minutes)..."
  bash ruh-backend/scripts/build-sandbox-image.sh
fi

# ── 5. Build and start all services ──────────────────────────────────────────
echo "[5/5] Building and starting services..."
docker compose build
docker compose up -d

echo ""
echo "============================================"
echo " Waiting for services to start..."
echo "============================================"

# Wait for backend health
for i in $(seq 1 30); do
  if curl -sf http://localhost/health &>/dev/null; then
    echo "  Backend healthy!"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "  WARNING: Backend not healthy after 5 minutes. Check logs:"
    echo "    docker compose logs backend"
  fi
  sleep 10
done

EXTERNAL_IP=$(curl -sf http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip -H "Metadata-Flavor: Google" || echo "localhost")

echo ""
echo "============================================"
echo " openclaw-ruh is running!"
echo "============================================"
echo ""
echo "  Frontend:       http://${EXTERNAL_IP}/"
echo "  Agent Builder:  http://${EXTERNAL_IP}/builder/"
echo "  Admin UI:       http://${EXTERNAL_IP}/admin/"
echo "  Flutter App:    http://${EXTERNAL_IP}/app/"
echo "  API Health:     http://${EXTERNAL_IP}/health"
echo "  API Docs:       http://${EXTERNAL_IP}/docs"
echo ""
echo "  Logs:           docker compose logs -f"
echo "  Stop:           docker compose down"
echo "  Restart:        docker compose restart"
echo ""
