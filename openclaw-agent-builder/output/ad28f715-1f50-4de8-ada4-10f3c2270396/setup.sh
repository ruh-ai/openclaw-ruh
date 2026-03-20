#!/usr/bin/env bash
set -euo pipefail

python3 -m venv .venv
source .venv/bin/activate
pip install -U pip
pip install -r requirements.txt

echo "Setup complete."
