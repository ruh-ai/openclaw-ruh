#!/bin/bash
# =============================================================================
# cleanup-sandboxes — Remove stopped/orphaned sandbox containers
# =============================================================================
# Usage:
#   ./scripts/cleanup-sandboxes.sh          # Remove stopped containers only
#   ./scripts/cleanup-sandboxes.sh --all    # Remove ALL sandbox containers
#   ./scripts/cleanup-sandboxes.sh --dry    # Dry run — show what would be removed
# =============================================================================

set -euo pipefail

MODE="${1:-stopped}"

echo "============================================"
echo " Sandbox Container Cleanup"
echo "============================================"

# List all openclaw sandbox containers
ALL_CONTAINERS=$(docker ps -a --filter "name=openclaw-" --format "{{.Names}}\t{{.Status}}\t{{.Image}}" | grep -v "langfuse\|gateway-1\|oauth-smoke" || true)

if [ -z "$ALL_CONTAINERS" ]; then
  echo "No sandbox containers found."
  exit 0
fi

TOTAL=$(echo "$ALL_CONTAINERS" | wc -l | tr -d ' ')
RUNNING=$(docker ps --filter "name=openclaw-" --format "{{.Names}}" | grep -v "langfuse\|gateway-1\|oauth-smoke" | wc -l | tr -d ' ')
STOPPED=$((TOTAL - RUNNING))

echo "  Total:   $TOTAL"
echo "  Running: $RUNNING"
echo "  Stopped: $STOPPED"
echo ""

if [ "$MODE" = "--dry" ]; then
  echo "Containers that would be affected:"
  echo "$ALL_CONTAINERS" | while IFS=$'\t' read -r name status image; do
    echo "  $name  ($status)  [$image]"
  done
  exit 0
fi

if [ "$MODE" = "--all" ]; then
  echo "Removing ALL sandbox containers..."
  docker ps -a --filter "name=openclaw-" --format "{{.Names}}" \
    | grep -v "langfuse\|gateway-1\|oauth-smoke" \
    | xargs -r docker rm -f 2>/dev/null || true
  echo "Done. Removed $TOTAL containers."
else
  echo "Removing stopped sandbox containers..."
  docker ps -a --filter "name=openclaw-" --filter "status=exited" --format "{{.Names}}" \
    | grep -v "langfuse\|gateway-1\|oauth-smoke" \
    | xargs -r docker rm -f 2>/dev/null || true

  docker ps -a --filter "name=openclaw-" --filter "status=created" --format "{{.Names}}" \
    | grep -v "langfuse\|gateway-1\|oauth-smoke" \
    | xargs -r docker rm -f 2>/dev/null || true

  echo "Done. Cleaned up stopped containers."
fi

echo ""
echo "Remaining sandbox containers:"
docker ps --filter "name=openclaw-" --format "  {{.Names}}  ({{.Status}})" | grep -v "langfuse\|gateway-1\|oauth-smoke" || echo "  None"
