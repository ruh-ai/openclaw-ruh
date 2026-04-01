#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STACK_DIR="$ROOT/langfuse"
STACK_FILE="$STACK_DIR/docker-compose.yml"
STACK_ENV="$STACK_DIR/.env"
STACK_ENV_EXAMPLE="$STACK_DIR/.env.example"
BUILDER_ENV="$ROOT/agent-builder-ui/.env.development.local"

compose() {
  docker compose -f "$STACK_FILE" --env-file "$STACK_ENV" "$@"
}

rand_hex() {
  node -e "console.log(require('crypto').randomBytes($1).toString('hex'))"
}

port_free() {
  if command -v lsof >/dev/null 2>&1; then
    if lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; then
      return 1
    fi
    return 0
  fi

  node -e '
const net = require("net");
const port = Number(process.argv[1]);
const host = process.argv[2];
const server = net.createServer();
server.once("error", () => process.exit(1));
server.once("listening", () => server.close(() => process.exit(0)));
server.listen({ port, host });
' "$1" "$2"
}

pick_port() {
  local port="$1"
  local host="${2:-127.0.0.1}"

  while ! port_free "$port" "$host"; do
    port=$((port + 1))
  done

  printf '%s\n' "$port"
}

ensure_stack_env() {
  if [[ -f "$STACK_ENV" ]]; then
    return
  fi

  mkdir -p "$STACK_DIR"

  local postgres_password clickhouse_password minio_password redis_password
  local nextauth_secret salt encryption_key project_public_key project_secret_key admin_password
  local port_web port_worker port_postgres port_redis port_clickhouse_http port_clickhouse_native port_minio_api port_minio_console
  postgres_password="$(rand_hex 16)"
  clickhouse_password="$(rand_hex 16)"
  minio_password="$(rand_hex 16)"
  redis_password="$(rand_hex 16)"
  nextauth_secret="$(rand_hex 24)"
  salt="$(rand_hex 16)"
  encryption_key="$(rand_hex 32)"
  project_public_key="lf_pk_$(rand_hex 12)"
  project_secret_key="lf_sk_$(rand_hex 24)"
  admin_password="lf-$(rand_hex 12)"
  port_web="$(pick_port 3002 127.0.0.1)"
  port_worker="$(pick_port 3032 127.0.0.1)"
  port_postgres="$(pick_port 5433 127.0.0.1)"
  port_redis="$(pick_port 6380 127.0.0.1)"
  port_clickhouse_http="$(pick_port 8124 127.0.0.1)"
  port_clickhouse_native="$(pick_port 9002 127.0.0.1)"
  port_minio_api="$(pick_port 9092 127.0.0.1)"
  port_minio_console="$(pick_port 9093 127.0.0.1)"

  cat >"$STACK_ENV" <<EOF
NEXTAUTH_URL=http://localhost:$port_web
NEXTAUTH_SECRET=$nextauth_secret
DATABASE_URL=postgresql://postgres:$postgres_password@postgres:5432/postgres
POSTGRES_USER=postgres
POSTGRES_PASSWORD=$postgres_password
POSTGRES_DB=postgres
POSTGRES_VERSION=17

SALT=$salt
ENCRYPTION_KEY=$encryption_key
TELEMETRY_ENABLED=false
LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES=false

CLICKHOUSE_USER=clickhouse
CLICKHOUSE_PASSWORD=$clickhouse_password
CLICKHOUSE_MIGRATION_URL=clickhouse://clickhouse:9000
CLICKHOUSE_URL=http://clickhouse:8123
CLICKHOUSE_CLUSTER_ENABLED=false

MINIO_ROOT_USER=minio
MINIO_ROOT_PASSWORD=$minio_password

LANGFUSE_S3_EVENT_UPLOAD_BUCKET=langfuse
LANGFUSE_S3_EVENT_UPLOAD_REGION=auto
LANGFUSE_S3_EVENT_UPLOAD_ACCESS_KEY_ID=minio
LANGFUSE_S3_EVENT_UPLOAD_SECRET_ACCESS_KEY=$minio_password
LANGFUSE_S3_EVENT_UPLOAD_ENDPOINT=http://minio:9000
LANGFUSE_S3_EVENT_UPLOAD_FORCE_PATH_STYLE=true
LANGFUSE_S3_EVENT_UPLOAD_PREFIX=events/

LANGFUSE_S3_MEDIA_UPLOAD_BUCKET=langfuse
LANGFUSE_S3_MEDIA_UPLOAD_REGION=auto
LANGFUSE_S3_MEDIA_UPLOAD_ACCESS_KEY_ID=minio
LANGFUSE_S3_MEDIA_UPLOAD_SECRET_ACCESS_KEY=$minio_password
LANGFUSE_S3_MEDIA_UPLOAD_ENDPOINT=http://localhost:$port_minio_api
LANGFUSE_S3_MEDIA_UPLOAD_FORCE_PATH_STYLE=true
LANGFUSE_S3_MEDIA_UPLOAD_PREFIX=media/

LANGFUSE_S3_BATCH_EXPORT_ENABLED=false
LANGFUSE_S3_BATCH_EXPORT_BUCKET=langfuse
LANGFUSE_S3_BATCH_EXPORT_PREFIX=exports/
LANGFUSE_S3_BATCH_EXPORT_REGION=auto
LANGFUSE_S3_BATCH_EXPORT_ENDPOINT=http://minio:9000
LANGFUSE_S3_BATCH_EXPORT_EXTERNAL_ENDPOINT=http://localhost:$port_minio_api
LANGFUSE_S3_BATCH_EXPORT_ACCESS_KEY_ID=minio
LANGFUSE_S3_BATCH_EXPORT_SECRET_ACCESS_KEY=$minio_password
LANGFUSE_S3_BATCH_EXPORT_FORCE_PATH_STYLE=true

REDIS_HOST=redis
REDIS_PORT=6379
REDIS_AUTH=$redis_password
REDIS_TLS_ENABLED=false
REDIS_TLS_CA=/certs/ca.crt
REDIS_TLS_CERT=/certs/redis.crt
REDIS_TLS_KEY=/certs/redis.key

LANGFUSE_INIT_ORG_ID=org-openclaw-local
LANGFUSE_INIT_ORG_NAME=openclaw-local
LANGFUSE_INIT_PROJECT_ID=proj-openclaw-ruh-enterprise
LANGFUSE_INIT_PROJECT_NAME=openclaw-ruh-enterprise
LANGFUSE_INIT_PROJECT_PUBLIC_KEY=$project_public_key
LANGFUSE_INIT_PROJECT_SECRET_KEY=$project_secret_key
LANGFUSE_INIT_USER_EMAIL=langfuse@local.dev
LANGFUSE_INIT_USER_NAME=local-admin
LANGFUSE_INIT_USER_PASSWORD=$admin_password

LANGFUSE_PORT_WEB=$port_web
LANGFUSE_PORT_WORKER=$port_worker
LANGFUSE_PORT_POSTGRES=$port_postgres
LANGFUSE_PORT_REDIS=$port_redis
LANGFUSE_PORT_CLICKHOUSE_HTTP=$port_clickhouse_http
LANGFUSE_PORT_CLICKHOUSE_NATIVE=$port_clickhouse_native
LANGFUSE_PORT_MINIO_API=$port_minio_api
LANGFUSE_PORT_MINIO_CONSOLE=$port_minio_console
EOF

  echo "Created $STACK_ENV from local generated secrets."
}

sync_builder_env() {
  ensure_stack_env
  # shellcheck source=/dev/null
  set -a
  source "$STACK_ENV"
  set +a

  cat >"$BUILDER_ENV" <<EOF
# Generated by scripts/langfuse-local.sh
LANGFUSE_BASE_URL=http://localhost:$LANGFUSE_PORT_WEB
LANGFUSE_PUBLIC_KEY=$LANGFUSE_INIT_PROJECT_PUBLIC_KEY
LANGFUSE_SECRET_KEY=$LANGFUSE_INIT_PROJECT_SECRET_KEY
LANGFUSE_TRACING_ENVIRONMENT=local
LANGFUSE_RELEASE=local-langfuse-docker
EOF

  echo "Wrote $BUILDER_ENV"
}

BACKEND_ENV="$ROOT/ruh-backend/.env"

sync_backend_otel_env() {
  ensure_stack_env
  # shellcheck source=/dev/null
  set -a
  source "$STACK_ENV"
  set +a

  if [[ ! -f "$BACKEND_ENV" ]]; then
    echo "Skipping backend OTEL sync — $BACKEND_ENV does not exist"
    return
  fi

  # Don't overwrite if already configured
  if grep -q 'OTEL_ENABLED' "$BACKEND_ENV" 2>/dev/null; then
    echo "Backend OTEL env already present in $BACKEND_ENV — skipping"
    return
  fi

  local auth_token
  auth_token="$(printf '%s:%s' "$LANGFUSE_INIT_PROJECT_PUBLIC_KEY" "$LANGFUSE_INIT_PROJECT_SECRET_KEY" | base64)"

  cat >>"$BACKEND_ENV" <<OTEL_EOF

# -- OpenTelemetry (auto-generated by langfuse-local.sh) --
OTEL_ENABLED=true
OTEL_SERVICE_NAME=ruh-backend
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:${LANGFUSE_PORT_WEB}/api/public/otel
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer ${auth_token}
OTEL_SAMPLE_RATE=1.0
OTEL_EOF

  echo "Wrote OTEL config to $BACKEND_ENV"
}

print_summary() {
  # shellcheck source=/dev/null
  set -a
  source "$STACK_ENV"
  set +a

  cat <<EOF

Langfuse local stack
  UI:        http://localhost:$LANGFUSE_PORT_WEB
  Email:     $LANGFUSE_INIT_USER_EMAIL
  Password:  $LANGFUSE_INIT_USER_PASSWORD
  Public Key: $LANGFUSE_INIT_PROJECT_PUBLIC_KEY
  Secret Key: $LANGFUSE_INIT_PROJECT_SECRET_KEY

Builder tracing env written to:
  $BUILDER_ENV
Backend OTEL env appended to:
  $BACKEND_ENV (if present)

Restart agent-builder-ui and ruh-backend after changing local env files.
EOF
}

cmd_up() {
  ensure_stack_env
  sync_builder_env
  sync_backend_otel_env
  compose up -d
  print_summary
}

cmd_down() {
  ensure_stack_env
  compose down
}

cmd_status() {
  ensure_stack_env
  compose ps
  print_summary
}

cmd_reset() {
  ensure_stack_env
  compose down -v --remove-orphans
  rm -f "$STACK_ENV" "$BUILDER_ENV"
  echo "Removed $STACK_ENV and $BUILDER_ENV"
}

case "${1:-}" in
  up)
    cmd_up
    ;;
  down)
    cmd_down
    ;;
  status)
    cmd_status
    ;;
  reset)
    cmd_reset
    ;;
  sync-builder-env)
    sync_builder_env
    print_summary
    ;;
  *)
    cat <<EOF
Usage: $0 {up|down|status|reset|sync-builder-env}
EOF
    exit 1
    ;;
esac
