#!/usr/bin/env bash
# Start backend and frontend concurrently

set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

# --- Backend ---
echo "==> Setting up Python backend..."
cd "$ROOT/backend"
if [ ! -d ".venv" ]; then
  python3 -m venv .venv
fi
source .venv/bin/activate
pip install -q -r requirements.txt

if [ ! -f ".env" ]; then
  cp .env.example .env
  echo "    Created backend/.env — add your DAYTONA_API_KEY before using the app."
fi

echo "==> Starting backend on http://localhost:8000 ..."
uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

# --- Frontend ---
echo "==> Installing frontend dependencies..."
cd "$ROOT/frontend"
npm install --silent

echo "==> Starting frontend on http://localhost:3000 ..."
npm run dev &
FRONTEND_PID=$!

echo ""
echo "================================================================"
echo "  Backend  : http://localhost:8000"
echo "  Frontend : http://localhost:3000"
echo "  API docs : http://localhost:8000/docs"
echo "================================================================"
echo "Press Ctrl+C to stop both servers."

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM
wait
