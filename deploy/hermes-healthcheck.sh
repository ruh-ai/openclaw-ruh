#!/bin/bash
# hermes-healthcheck.sh
#
# Probes https://hermes.codezero2pi.com/health every time it's invoked by the
# systemd timer. Tracks consecutive failures in a state file. On the Nth
# consecutive failure, restarts the nginx container (the most common cause of
# the 502 is a stale config after a compose rebuild) and logs a loud error to
# the journal so journalctl watchers or external monitors can alert.
#
# Optional: set HERMES_ALERT_WEBHOOK to a Slack/Discord incoming webhook URL
# in /etc/default/hermes-healthcheck to get a POST on failure / recovery.
#
# Exit codes:
#   0  — healthy
#   1  — unhealthy but under threshold (no action taken)
#   2  — unhealthy and at/over threshold (nginx restart attempted)

set -u

URL="${HERMES_HEALTH_URL:-https://hermes.codezero2pi.com/health}"
STATE_FILE="${HERMES_HEALTH_STATE:-/var/lib/hermes-healthcheck/state}"
THRESHOLD="${HERMES_HEALTH_THRESHOLD:-3}"
TIMEOUT="${HERMES_HEALTH_TIMEOUT:-10}"
NGINX_CONTAINER="${HERMES_NGINX_CONTAINER:-ruh-nginx-1}"
WEBHOOK="${HERMES_ALERT_WEBHOOK:-}"

mkdir -p "$(dirname "$STATE_FILE")"
[ -f "$STATE_FILE" ] || echo 0 > "$STATE_FILE"
FAILS="$(cat "$STATE_FILE")"

# -fsS: fail on HTTP errors, silent but show errors. --max-time bounds it.
body="$(curl -fsS --max-time "$TIMEOUT" "$URL" 2>&1)"
rc=$?

post_webhook() {
  [ -z "$WEBHOOK" ] && return 0
  curl -fsS --max-time 5 -X POST -H 'content-type: application/json' \
    -d "$(printf '{"text":"%s"}' "$1")" \
    "$WEBHOOK" >/dev/null 2>&1 || true
}

if [ $rc -eq 0 ] && echo "$body" | grep -q '"status":"ok"'; then
  # Healthy — reset counter, emit recovery if we were previously failing
  if [ "$FAILS" -gt 0 ]; then
    logger -t hermes-healthcheck -p daemon.notice \
      "RECOVERED: $URL healthy after $FAILS consecutive failures"
    post_webhook "✅ Hermes recovered: $URL is healthy again (after $FAILS failures)"
  fi
  echo 0 > "$STATE_FILE"
  exit 0
fi

FAILS=$((FAILS + 1))
echo "$FAILS" > "$STATE_FILE"

logger -t hermes-healthcheck -p daemon.warning \
  "FAILED ($FAILS/$THRESHOLD): $URL rc=$rc body=$(echo "$body" | tr -d '\n' | cut -c1-200)"

if [ "$FAILS" -lt "$THRESHOLD" ]; then
  exit 1
fi

# Over threshold — attempt remediation (restart nginx container)
logger -t hermes-healthcheck -p daemon.err \
  "CRITICAL: $URL failed $FAILS consecutive times — restarting $NGINX_CONTAINER"
post_webhook "🚨 Hermes health check failed $FAILS× — restarting $NGINX_CONTAINER"

docker restart "$NGINX_CONTAINER" >/dev/null 2>&1 || \
  logger -t hermes-healthcheck -p daemon.err \
    "FAILED to restart $NGINX_CONTAINER"

# Don't reset counter; let the next tick confirm recovery (which resets it)
exit 2
