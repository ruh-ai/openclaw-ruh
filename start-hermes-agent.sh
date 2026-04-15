#!/bin/bash
# Launch Claude Code with the Hermes agent in remote control mode.
#
# Usage:
#   ./start-hermes-agent.sh              # start hermes agent
#   ./start-hermes-agent.sh --agent backend   # use a different agent

set -euo pipefail

cd "$(dirname "$0")"

AGENT="hermes"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --agent) AGENT="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: ./start-hermes-agent.sh [--agent NAME]"
      echo "  --agent NAME   Agent persona (default: hermes). See .claude/agents/"
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

exec claude --agent ".claude/agents/${AGENT}.md" \
  --dangerously-skip-permissions \
  --remote-control
