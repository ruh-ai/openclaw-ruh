#!/bin/bash
# =============================================================================
# init-ssl.sh — First-time SSL setup for codezero2pi.com subdomains
#
# Run this ONCE on the GCE VM after DNS A records are pointing to this IP.
# It will:
#   1. Verify DNS is resolving correctly
#   2. Start nginx in HTTP-only mode (for ACME challenge)
#   3. Get Let's Encrypt certs for all 4 subdomains
#   4. Switch nginx to SSL mode and start all services
#
# Prerequisites:
#   - Cloud DNS zone created with A records (run deploy/setup-dns.sh first)
#   - GoDaddy nameservers changed to Google Cloud DNS nameservers
#   - DNS propagated (dig builder.codezero2pi.com should return VM IP)
#   - Docker and docker compose installed
#   - .env file configured with LLM keys
#   - GCP firewall allows ports 80 and 443 (see below)
#
# Full setup order:
#   1. bash deploy/setup-dns.sh          # Create Cloud DNS zone + records
#   2. Change GoDaddy nameservers to Google (see setup-dns.sh output)
#   3. Wait for DNS propagation (~15 min to 1 hour)
#   4. bash deploy/init-ssl.sh your@email.com   # This script
#
# GCP firewall (run once if not already open):
#   gcloud compute firewall-rules create allow-https \
#     --allow=tcp:443 --target-tags=http-server --source-ranges=0.0.0.0/0
#
# Usage:
#   cd /opt/ruh && bash deploy/init-ssl.sh your@email.com
# =============================================================================

set -euo pipefail

APP_DIR="${SSH_DEPLOY_PATH:-/opt/ruh}"
COMPOSE_FILE="deploy/docker-compose.prod.yml"
DOMAIN="codezero2pi.com"
SUBDOMAINS=("builder" "app" "admin" "api")
EMAIL="${1:-}"

cd "$APP_DIR"

if [ -z "$EMAIL" ]; then
  echo "Usage: bash deploy/init-ssl.sh your@email.com"
  echo "  Email is required for Let's Encrypt registration."
  exit 1
fi

echo "============================================"
echo " SSL Setup for *.${DOMAIN}"
echo "============================================"
echo ""

# ── 1. Check DNS ─────────────────────────────────────────────────────────────
echo "[1/5] Checking DNS resolution..."
VM_IP=$(curl -sf http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip -H "Metadata-Flavor: Google" 2>/dev/null || curl -sf https://ifconfig.me || echo "unknown")
echo "  VM external IP: ${VM_IP}"

ALL_DNS_OK=true
for SUB in "${SUBDOMAINS[@]}"; do
  RESOLVED=$(dig +short "${SUB}.${DOMAIN}" 2>/dev/null || echo "")
  if [ "$RESOLVED" = "$VM_IP" ]; then
    echo "  ${SUB}.${DOMAIN} → ${RESOLVED} OK"
  else
    echo "  ${SUB}.${DOMAIN} → ${RESOLVED:-NOT FOUND} MISMATCH (expected ${VM_IP})"
    ALL_DNS_OK=false
  fi
done

if [ "$ALL_DNS_OK" = false ]; then
  echo ""
  echo "ERROR: DNS records are not pointing to this VM yet."
  echo "  Add A records in GoDaddy for each subdomain → ${VM_IP}"
  echo "  Then wait a few minutes and run this script again."
  exit 1
fi
echo ""

# ── 2. Start nginx in HTTP-only mode ─────────────────────────────────────────
echo "[2/5] Starting nginx in HTTP-only mode for ACME challenge..."

# Create a minimal HTTP-only nginx config for cert bootstrapping
cat > nginx/nginx.conf << 'NGINX_HTTP'
server {
    listen 80;
    server_name builder.codezero2pi.com app.codezero2pi.com admin.codezero2pi.com api.codezero2pi.com;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location = /health {
        return 200 'ok';
        add_header Content-Type text/plain;
    }

    location / {
        return 503 'SSL setup in progress';
        add_header Content-Type text/plain;
    }
}
NGINX_HTTP

# Dummy ssl-params.conf (Dockerfile COPY needs it, even though HTTP-only mode doesn't use it)
cp deploy/ssl-params.conf nginx/ssl-params.conf

# Copy compose file to root for path resolution
cp "$COMPOSE_FILE" docker-compose.prod.yml

# Build and start just nginx (enough to serve ACME challenges)
docker compose -f docker-compose.prod.yml build nginx
docker compose -f docker-compose.prod.yml up -d nginx
sleep 3

# Verify nginx is responding
if curl -sf http://localhost/.well-known/acme-challenge/ &>/dev/null || curl -sf -o /dev/null -w "%{http_code}" http://localhost/ | grep -q "503"; then
  echo "  Nginx is serving on port 80"
else
  echo "  WARNING: Nginx may not be responding. Continuing anyway..."
fi
echo ""

# ── 3. Get certificates ─────────────────────────────────────────────────────
echo "[3/5] Requesting Let's Encrypt certificates..."

# Build the -d flags for all subdomains in one cert
CERTBOT_DOMAINS=""
for SUB in "${SUBDOMAINS[@]}"; do
  CERTBOT_DOMAINS="${CERTBOT_DOMAINS} -d ${SUB}.${DOMAIN}"
done

# Use docker compose run to share the same volumes as the certbot service
docker compose -f docker-compose.prod.yml run --rm certbot \
  certbot certonly \
    --webroot \
    -w /var/www/certbot \
    ${CERTBOT_DOMAINS} \
    --email "${EMAIL}" \
    --agree-tos \
    --no-eff-email \
    --non-interactive \
    --cert-name "${DOMAIN}"

# Certbot stores all domains under one cert name. Create symlinks so nginx
# can reference each subdomain individually (or we use the shared cert).
CERT_DIR="/etc/letsencrypt/live"

# We need to create per-subdomain symlinks inside the certbot volume.
# The simplest approach: update nginx-ssl.conf to use the shared cert.
echo "  Certs obtained! Updating nginx config to use shared certificate..."
echo ""

# ── 4. Switch to SSL nginx config ───────────────────────────────────────────
echo "[4/5] Switching nginx to SSL mode..."

# Generate the SSL nginx config using the shared cert name
cat > nginx/nginx.conf << 'NGINX_SSL'
# =============================================================================
# nginx.conf — Subdomain routing with SSL (Let's Encrypt)
# =============================================================================

upstream backend {
    server backend:8000;
}

upstream builder {
    server agent-builder-ui:3000;
}

upstream frontend {
    server frontend:3001;
}

upstream admin {
    server admin-ui:3002;
}

# ── HTTP → HTTPS redirect ───────────────────────────────────────────────────
server {
    listen 80;
    server_name builder.codezero2pi.com app.codezero2pi.com admin.codezero2pi.com api.codezero2pi.com;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

# ── Builder (agent-builder-ui) ───────────────────────────────────────────────
server {
    listen 443 ssl;
    server_name builder.codezero2pi.com;

    ssl_certificate     /etc/letsencrypt/live/codezero2pi.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/codezero2pi.com/privkey.pem;
    include             /etc/nginx/ssl-params.conf;

    client_max_body_size 50M;

    # OpenClaw bridge — Next.js API route
    location /api/openclaw {
        proxy_pass http://builder;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
        proxy_buffering off;
    }

    location / {
        proxy_pass http://builder;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }
}

# ── App (ruh-frontend) ───────────────────────────────────────────────────────
server {
    listen 443 ssl;
    server_name app.codezero2pi.com;

    ssl_certificate     /etc/letsencrypt/live/codezero2pi.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/codezero2pi.com/privkey.pem;
    include             /etc/nginx/ssl-params.conf;

    client_max_body_size 50M;

    location / {
        proxy_pass http://frontend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }
}

# ── Admin ─────────────────────────────────────────────────────────────────────
server {
    listen 443 ssl;
    server_name admin.codezero2pi.com;

    ssl_certificate     /etc/letsencrypt/live/codezero2pi.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/codezero2pi.com/privkey.pem;
    include             /etc/nginx/ssl-params.conf;

    client_max_body_size 50M;

    location / {
        proxy_pass http://admin;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }
}

# ── API (backend) ─────────────────────────────────────────────────────────────
server {
    listen 443 ssl;
    server_name api.codezero2pi.com;

    ssl_certificate     /etc/letsencrypt/live/codezero2pi.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/codezero2pi.com/privkey.pem;
    include             /etc/nginx/ssl-params.conf;

    client_max_body_size 50M;

    location / {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;

        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
        proxy_connect_timeout 10s;

        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding on;
    }

    location = /health {
        proxy_pass http://backend/health;
    }

    location /docs {
        proxy_pass http://backend;
        proxy_set_header Host $host;
    }

    location /openapi.json {
        proxy_pass http://backend/openapi.json;
        proxy_set_header Host $host;
    }
}
NGINX_SSL

# Copy SSL params
cp deploy/ssl-params.conf nginx/ssl-params.conf

# Stop everything, rebuild nginx with the SSL config
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml build nginx
echo ""

# ── 5. Start all services ───────────────────────────────────────────────────
echo "[5/5] Starting all services with SSL..."
docker compose -f docker-compose.prod.yml up -d

echo ""
echo "Waiting for services to start..."
for i in $(seq 1 20); do
  if curl -sf https://api.${DOMAIN}/health &>/dev/null; then
    echo "  All services healthy!"
    break
  fi
  if [ "$i" -eq 20 ]; then
    echo "  WARNING: Health check failed after 100s"
    echo "  Check logs: docker compose -f docker-compose.prod.yml logs"
  fi
  sleep 5
done

echo ""
echo "============================================"
echo " SSL setup complete!"
echo "============================================"
echo ""
echo "  Builder:   https://builder.${DOMAIN}"
echo "  App:       https://app.${DOMAIN}"
echo "  Admin:     https://admin.${DOMAIN}"
echo "  API:       https://api.${DOMAIN}"
echo "  Health:    https://api.${DOMAIN}/health"
echo "  API Docs:  https://api.${DOMAIN}/docs"
echo ""
echo "  Certs auto-renew via the certbot container (every 12h check)."
echo "  To force renewal: docker compose exec certbot certbot renew"
echo ""
