#!/bin/bash
# Launch Claude Code with the Hermes orchestrator agent
# Runs in dangerously-skip-permissions mode (no tool approval prompts)

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AGENT_FILE="$SCRIPT_DIR/.claude/agents/hermes.md"

if [ ! -f "$AGENT_FILE" ]; then
  echo "[hermes] Agent file not found: $AGENT_FILE"
  exit 1
fi

echo "[hermes] Starting Claude Code with Hermes agent (skip-permissions mode)..."
cd "$SCRIPT_DIR"

claude --agent .claude/agents/hermes.md --dangerously-skip-permissions --remote-control "$@"
