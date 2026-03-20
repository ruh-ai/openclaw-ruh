#!/usr/bin/env bash
set -euo pipefail

# Minimal setup: create venv and install dependencies
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

python3 -m venv "$ROOT_DIR/.venv"
# shellcheck disable=SC1091
source "$ROOT_DIR/.venv/bin/activate"

python -m pip install --upgrade pip >/dev/null
python -m pip install "requests>=2.31.0" "python-dateutil>=2.9.0" >/dev/null

echo "Setup complete. Activate with: source $ROOT_DIR/.venv/bin/activate"