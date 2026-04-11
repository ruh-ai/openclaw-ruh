#!/bin/bash
# KB Preflight Check — run before /ship or /review
#
# Checks:
# 1. @kb: annotation integrity (broken refs block, missing annotations warn)
# 2. KB note staleness (warns when source changed after its KB note)
# 3. INDEX completeness (warns on orphaned specs)
#
# Usage:
#   bash scripts/kb-preflight.sh          # human-readable
#   bash scripts/kb-preflight.sh --strict  # exit 1 on any issue (for CI)

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

STRICT=0
[ "${1:-}" = "--strict" ] && STRICT=1

ISSUES=0
WARNINGS=0

echo "=== KB Preflight Check ==="
echo ""

# ── 1. Annotation integrity ──────────────────────────────────────────

BUN=$(which bun 2>/dev/null || echo "$HOME/.bun/bin/bun")

if [ -f "scripts/check-kb-annotations.ts" ]; then
  COMPACT=$("$BUN" scripts/check-kb-annotations.ts --json 2>/dev/null | tr -d '\n\r\t ' || echo '{"brokenRefs":[],"missingAnnotations":[]}')

  BROKEN=0
  echo "$COMPACT" | grep -q '"brokenRefs":\[\]' || BROKEN=1
  MISSING=0
  echo "$COMPACT" | grep -q '"missingAnnotations":\[\]' || MISSING=1

  if [ "$BROKEN" -eq 1 ]; then
    echo "FAIL  Broken @kb: references found"
    echo "      Run: bun scripts/check-kb-annotations.ts"
    ISSUES=$((ISSUES + 1))
  else
    echo "  OK  @kb: annotations — no broken references"
  fi

  if [ "$MISSING" -eq 1 ]; then
    echo "WARN  Critical files missing @kb: annotations"
    WARNINGS=$((WARNINGS + 1))
  fi
else
  echo "SKIP  check-kb-annotations.ts not found"
fi

# ── 2. KB note staleness ─────────────────────────────────────────────

echo ""

# Map: source_pattern|kb_note_file
MAPPINGS=(
  "ruh-backend/src/sandboxManager.ts|003-sandbox-lifecycle.md"
  "ruh-backend/src/app.ts|004-api-reference.md"
  "ruh-backend/src/store.ts|005-data-models.md"
  "ruh-backend/src/agentStore.ts|005-data-models.md"
  "ruh-backend/src/schemaMigrations.ts|005-data-models.md"
  "ruh-backend/src/channelManager.ts|006-channel-manager.md"
  "ruh-backend/src/conversationStore.ts|007-conversation-store.md"
  "agent-builder-ui/app/api/openclaw/route.ts|008-agent-builder-ui.md"
  "agent-builder-ui/lib/openclaw/build-harness.ts|008-agent-builder-ui.md"
  "ruh-backend/src/authRoutes.ts|014-auth-system.md"
  "ruh-backend/src/marketplaceStore.ts|016-marketplace.md"
  "ruh-backend/src/marketplaceRoutes.ts|016-marketplace.md"
)

STALE_NOTES=()

for mapping in "${MAPPINGS[@]}"; do
  src="${mapping%%|*}"
  note="${mapping##*|}"
  note_path="docs/knowledge-base/$note"

  [ -f "$src" ] || continue
  [ -f "$note_path" ] || continue

  note_ts=$(git log -1 --format="%ct" -- "$note_path" 2>/dev/null || echo 0)
  src_ts=$(git log -1 --format="%ct" -- "$src" 2>/dev/null || echo 0)

  if [ "$src_ts" -gt "$note_ts" ]; then
    # Check if already flagged (avoid duplicates for same note)
    already=0
    for s in "${STALE_NOTES[@]+"${STALE_NOTES[@]}"}"; do
      [ "$s" = "$note" ] && already=1
    done
    if [ "$already" -eq 0 ]; then
      STALE_NOTES+=("$note")
      src_date=$(git log -1 --format="%ad" --date=short -- "$src" 2>/dev/null)
      note_date=$(git log -1 --format="%ad" --date=short -- "$note_path" 2>/dev/null)
      echo "WARN  Stale: $note ($note_date) — source changed $src_date"
      WARNINGS=$((WARNINGS + 1))
    fi
  fi
done

if [ "${#STALE_NOTES[@]}" -eq 0 ]; then
  echo "  OK  All KB notes up to date with source"
fi

# ── 3. INDEX completeness ────────────────────────────────────────────

echo ""

MISSING_INDEX=0
if [ -d "docs/knowledge-base/specs" ]; then
  for f in docs/knowledge-base/specs/SPEC-*.md; do
    [ -f "$f" ] || continue
    base=$(basename "$f" .md)
    if ! grep -q "$base" docs/knowledge-base/000-INDEX.md 2>/dev/null; then
      echo "WARN  Missing from INDEX: $base"
      MISSING_INDEX=$((MISSING_INDEX + 1))
      WARNINGS=$((WARNINGS + 1))
    fi
  done
fi

if [ "$MISSING_INDEX" -eq 0 ]; then
  echo "  OK  All specs listed in 000-INDEX.md"
fi

# ── Summary ──────────────────────────────────────────────────────────

echo ""
echo "─────────────────────────────"

if [ "$ISSUES" -gt 0 ]; then
  echo "RESULT: BLOCKED — $ISSUES issue(s) must be fixed before shipping"
  exit 1
elif [ "$WARNINGS" -gt 0 ]; then
  echo "RESULT: PASS with $WARNINGS warning(s) — run /kb update before or after shipping"
  [ "$STRICT" -eq 1 ] && exit 1
  exit 0
else
  echo "RESULT: CLEAN — KB is fully up to date"
  exit 0
fi
