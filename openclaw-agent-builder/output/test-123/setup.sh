#!/usr/bin/env bash
set -euo pipefail

# Minimal setup helper for local runs
# (OpenClaw may already be installed/configured in your environment.)

if ! command -v openclaw >/dev/null 2>&1; then
  npm install -g openclaw@latest
fi

openclaw gateway status || true

echo "Done."
