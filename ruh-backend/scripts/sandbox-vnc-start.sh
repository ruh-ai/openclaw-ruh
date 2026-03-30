#!/bin/bash
# =============================================================================
# sandbox-vnc-start — Start virtual display + VNC stack
# =============================================================================
# Idempotent: safe to call multiple times. Skips if already running.
# Called by the sandbox manager after container creation.
# =============================================================================

set -euo pipefail

DISPLAY_NUM=99
VNC_PORT=5900
WS_PORT=6080

# ─── Virtual framebuffer ────────────────────────────────────────────────────
if ! pgrep -f "Xvfb :${DISPLAY_NUM}" > /dev/null 2>&1; then
  echo "[vnc] Starting Xvfb on :${DISPLAY_NUM}"
  Xvfb ":${DISPLAY_NUM}" -screen 0 1280x720x24 &
  sleep 1
else
  echo "[vnc] Xvfb already running on :${DISPLAY_NUM}"
fi

export DISPLAY=":${DISPLAY_NUM}"
echo "export DISPLAY=:${DISPLAY_NUM}" >> /root/.bashrc 2>/dev/null || true

# ─── VNC server ─────────────────────────────────────────────────────────────
if ! pgrep -f "x11vnc" > /dev/null 2>&1; then
  echo "[vnc] Starting x11vnc on :${VNC_PORT}"
  x11vnc -display ":${DISPLAY_NUM}" -nopw -listen 0.0.0.0 -xkb -ncache 10 \
    -forever -shared -bg -o /tmp/x11vnc.log 2>/dev/null || true
  sleep 0.5
else
  echo "[vnc] x11vnc already running"
fi

# ─── WebSocket bridge ───────────────────────────────────────────────────────
if ! pgrep -f "websockify.*${WS_PORT}" > /dev/null 2>&1; then
  echo "[vnc] Starting websockify on :${WS_PORT}"
  websockify --web /usr/share/novnc --daemon "${WS_PORT}" "localhost:${VNC_PORT}" \
    2>/dev/null || true
  sleep 0.5
else
  echo "[vnc] websockify already running on :${WS_PORT}"
fi

echo "[vnc] VNC stack ready (display=:${DISPLAY_NUM}, vnc=:${VNC_PORT}, ws=:${WS_PORT})"
