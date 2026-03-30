#!/bin/bash
# =============================================================================
# build-sandbox-image — Build the pre-baked sandbox Docker image
# =============================================================================
# Usage:
#   ./ruh-backend/scripts/build-sandbox-image.sh                # from repo root
#   cd ruh-backend && bash scripts/build-sandbox-image.sh       # from ruh-backend
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(dirname "$BACKEND_DIR")"
OPENCLAW_VERSION="${1:-latest}"
IMAGE_NAME="${SANDBOX_IMAGE_NAME:-ruh-sandbox}"
IMAGE_TAG="${SANDBOX_IMAGE_TAG:-latest}"

echo "============================================"
echo " Building sandbox image"
echo "  Image:    ${IMAGE_NAME}:${IMAGE_TAG}"
echo "  OpenClaw: ${OPENCLAW_VERSION}"
echo "  Context:  ${REPO_ROOT}"
echo "============================================"

cd "$REPO_ROOT"

docker build \
  -f ruh-backend/Dockerfile.sandbox \
  -t "${IMAGE_NAME}:${IMAGE_TAG}" \
  --build-arg "OPENCLAW_VERSION=${OPENCLAW_VERSION}" \
  --label "org.openclaw.version=${OPENCLAW_VERSION}" \
  --label "org.openclaw.built=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  .

echo ""
echo "Image built: ${IMAGE_NAME}:${IMAGE_TAG}"
docker images "${IMAGE_NAME}:${IMAGE_TAG}" --format "  Size: {{.Size}}  Created: {{.CreatedSince}}"

echo ""
echo "Verifying..."
docker run --rm "${IMAGE_NAME}:${IMAGE_TAG}" openclaw --version
docker run --rm "${IMAGE_NAME}:${IMAGE_TAG}" bash -c "which lsof && ls /opt/agent-runtime/server.js && echo 'Agent runtime: OK'"

echo ""
echo "============================================"
echo " Sandbox image ready"
echo "============================================"
