#!/bin/bash
# =============================================================================
# deploy.sh — Pull latest code and redeploy on the GCE VM
#
# Called by GitHub Actions CD pipeline after tests pass.
# Expects to run as a user with docker access at /opt/ruh.
# =============================================================================

set -euo pipefail

APP_DIR="${SSH_DEPLOY_PATH:-/opt/ruh}"
COMPOSE_FILE="deploy/docker-compose.prod.yml"
DOCKER_HOST_IP="172.17.0.1"

cd "$APP_DIR"

echo "============================================"
echo " Deploying openclaw-ruh $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "============================================"

# ── 1. Pull latest code ──────────────────────────────────────────────────────
echo "[1/6] Pulling latest code..."
git fetch origin dev
git reset --hard origin/dev

# ── 2. Apply deployment patches ──────────────────────────────────────────────
# These fix Docker-in-Docker issues specific to the VM environment.
# They should eventually be merged into the codebase properly.
echo "[2/6] Applying deployment patches..."

# Backend: remove --frozen-lockfile (lockfiles may be stale)
sed -i "s|RUN bun install --frozen-lockfile|RUN bun install|" ruh-backend/Dockerfile

# All frontends: npm ci → npm install (lockfiles may be stale)
for f in agent-builder-ui/Dockerfile ruh-frontend/Dockerfile admin-ui/Dockerfile; do
  [ -f "$f" ] && sed -i "s|RUN npm ci --omit=dev|RUN npm install --omit=dev|g;s|RUN npm ci$|RUN npm install|g" "$f"
done

# Backend: install Docker CLI if not already in Dockerfile
if ! grep -q "docker-27" ruh-backend/Dockerfile; then
  sed -i "/^FROM oven\/bun:1/a\\
\\n# Install Docker CLI for sandbox management\\nRUN apt-get update && \\\\\\n    apt-get install -y --no-install-recommends curl ca-certificates && \\\\\\n    curl -fsSL https://download.docker.com/linux/static/stable/x86_64/docker-27.5.1.tgz | tar xz --strip-components=1 -C /usr/local/bin docker/docker && \\\\\\n    rm -rf /var/lib/apt/lists/*" ruh-backend/Dockerfile
fi

# Builder: ignore TS build errors (Next.js version drift from npm install)
sed -i "s|ignoreBuildErrors: false|ignoreBuildErrors: true|" agent-builder-ui/next.config.ts 2>/dev/null || true

# Builder bridge-auth: use X-Forwarded-Host for reverse proxy origin check
if ! grep -q "x-forwarded-host" agent-builder-ui/lib/openclaw/bridge-auth.ts 2>/dev/null; then
  python3 -c "
import sys
with open('agent-builder-ui/lib/openclaw/bridge-auth.ts') as f:
    c = f.read()
old = '''  const requestOrigin = new URL(req.url).origin;'''
new = '''  const forwardedHost = req.headers.get(\"x-forwarded-host\");
  const forwardedProto = req.headers.get(\"x-forwarded-proto\") ?? \"http\";
  const requestOrigin = forwardedHost
    ? \`\${forwardedProto}://\${forwardedHost}\`
    : new URL(req.url).origin;'''
if old in c:
    c = c.replace(old, new)
    with open('agent-builder-ui/lib/openclaw/bridge-auth.ts', 'w') as f:
        f.write(c)
    print('  Patched bridge-auth.ts')
else:
    print('  bridge-auth.ts already patched')
" 2>/dev/null || true
fi

# Builder architect-sandbox: probe Docker host IP, not localhost
sed -i "s|http://localhost:\${port}/|http://${DOCKER_HOST_IP}:\${port}/|g" \
  agent-builder-ui/app/api/openclaw/architect-sandbox/route.ts 2>/dev/null || true
sed -i "s|http://localhost:\${fallback.gateway_port}/|http://${DOCKER_HOST_IP}:\${fallback.gateway_port}/|g" \
  agent-builder-ui/app/api/openclaw/architect-sandbox/route.ts 2>/dev/null || true

# Use the production nginx config (builder-only, with /api/openclaw routing)
cp deploy/nginx-prod.conf nginx/nginx.conf

echo "  Patches applied"

# Copy compose file to repo root so paths resolve correctly
cp "$COMPOSE_FILE" docker-compose.prod.yml
COMPOSE_FILE="docker-compose.prod.yml"

# ── 3. Rebuild Docker images ─────────────────────────────────────────────────
echo "[3/6] Building Docker images..."
docker compose -f "$COMPOSE_FILE" build --parallel 2>&1 | tail -5

# ── 4. Rebuild sandbox image if changed ──────────────────────────────────────
SANDBOX_HASH_FILE="/opt/ruh/.sandbox-dockerfile-hash"
CURRENT_HASH=$(sha256sum ruh-backend/Dockerfile.sandbox | cut -d' ' -f1)
PREVIOUS_HASH=$(cat "$SANDBOX_HASH_FILE" 2>/dev/null || echo "none")

if [ "$CURRENT_HASH" != "$PREVIOUS_HASH" ]; then
  echo "[4/6] Sandbox Dockerfile changed — rebuilding sandbox image..."
  bash ruh-backend/scripts/build-sandbox-image.sh 2026.3.24
  echo "$CURRENT_HASH" > "$SANDBOX_HASH_FILE"
else
  echo "[4/6] Sandbox image unchanged — skipping"
fi

# ── 5. Restart services ──────────────────────────────────────────────────────
echo "[5/6] Restarting services..."
docker compose -f "$COMPOSE_FILE" up -d --remove-orphans 2>&1 | tail -10

# Fix sandbox URLs in DB (localhost → Docker host IP)
sleep 5
docker exec ruh-postgres-1 psql -U openclaw -d openclaw -c \
  "UPDATE sandboxes SET standard_url = REPLACE(standard_url, 'localhost', '${DOCKER_HOST_IP}') WHERE standard_url LIKE '%localhost%';" \
  2>/dev/null || true
docker exec ruh-postgres-1 psql -U openclaw -d openclaw -c \
  "UPDATE sandboxes SET dashboard_url = REPLACE(dashboard_url, 'localhost', '${DOCKER_HOST_IP}') WHERE dashboard_url LIKE '%localhost%';" \
  2>/dev/null || true

# ── 6. Health check ──────────────────────────────────────────────────────────
echo "[6/6] Health check..."
for i in $(seq 1 20); do
  if curl -sf http://localhost/health &>/dev/null; then
    echo "  Healthy!"
    break
  fi
  if [ "$i" -eq 20 ]; then
    echo "  WARNING: Health check failed after 100s"
    docker compose -f "$COMPOSE_FILE" logs backend --tail 20
    exit 1
  fi
  sleep 5
done

echo ""
echo "============================================"
echo " Deploy complete $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "============================================"
