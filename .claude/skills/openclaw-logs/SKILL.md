---
name: openclaw-logs
version: 1.0.0
description: |
  Read logs and telemetry for openclaw-ruh-enterprise in local dev.
  Backend HTTP + gateway-proxy logs (/tmp/backend.log), per-sandbox gateway
  logs (/tmp/openclaw-gateway.log inside each container), OpenClaw structured
  JSON subsystem logs (/tmp/openclaw/openclaw-YYYY-MM-DD.log), Postgres state
  queries, and richer telemetry (Langfuse, OTEL, GlitchTip) when available.
  Use when asked to "check the logs", "why is the agent stuck", "what's the
  backend doing", "grep the gateway log", "look at the trace", or any
  local-dev log investigation task. For production (GCP VM) logs, use the
  /gcp-server skill instead.
allowed-tools:
  - Bash
  - Read
  - Grep
  - Glob
---

# /openclaw-logs — Local Dev Log Investigation

Diagnose local-dev issues by reading logs directly. Don't ask the user to paste anything — go pull it yourself. Start with the cheapest source that answers the question; escalate only when structured fields are needed.

---

## Source Map

| Source | Path | Access |
|---|---|---|
| **ruh-backend** (Bun) | `/tmp/backend.log` (host) | `tail -N /tmp/backend.log` |
| **agent-builder-ui** (Next.js) | stderr of `next dev` process | `ps aux \| grep "next dev"` then read process stdout/stderr if redirected |
| **Sandbox gateway** (human-readable) | `/tmp/openclaw-gateway.log` inside container | `docker exec openclaw-<id> tail -N /tmp/openclaw-gateway.log` |
| **OpenClaw subsystem** (structured JSON) | `/tmp/openclaw/openclaw-YYYY-MM-DD.log` inside container | `docker exec openclaw-<id> tail -N /tmp/openclaw/openclaw-$(date -u +%Y-%m-%d).log` |
| **OpenClaw config** | `/root/.openclaw/openclaw.json` inside container | `docker exec openclaw-<id> cat /root/.openclaw/openclaw.json` |
| **Postgres state** | container `pg` | `docker exec pg psql -U openclaw -d openclaw -c "…"` |
| **Langfuse UI** | `langfuse-web` container | `docker ps \| grep langfuse-web` then open the exposed port |
| **OTEL traces** | Sandbox → `http://host.docker.internal:4318/v1/traces` | Check `docker ps \| grep -i otel` — if no collector, traces are dropped |
| **GlitchTip** (Sentry-compatible) | `deploy-glitchtip-*` containers | `docker ps \| grep glitchtip` → open web UI port |

---

## Triage Decision Tree

Pick the narrowest source that fits the symptom. Don't grep everything — waste of tokens and time.

**Browser request stuck / backend 5xx / agent-builder page hung**
→ `/tmp/backend.log` first. 80% of answers are here.

**Agent chat not responding / "thinking" forever**
1. Confirm WS reached sandbox: grep `/tmp/backend.log` for `[gateway-proxy] Connected to sandbox <id>`.
2. If connected, check `/tmp/openclaw-gateway.log` in that container for:
   - `[tools] … failed` — tool error (web_search, web_fetch, etc.)
   - `[ws] webchat disconnected` — WS dropped
   - `[agent/embedded] embedded run agent end: … isError=true` — LLM/provider failure
3. If gateway log is sparse, drop to `/tmp/openclaw/openclaw-YYYY-MM-DD.log` for structured event fields.

**Sandbox creation stuck / fails**
1. `/tmp/backend.log` — look for `sandboxManager` log lines, SSE `log` events.
2. `docker ps -a` — is the container there but stopped? Inspect with `docker logs openclaw-<id>`.
3. Partial creation? Check `sandboxes` table in Postgres for the record.

**"Gateway unreachable" / 503 on chat**
1. `docker ps --filter 'name=openclaw-<id>'` — running?
2. `docker exec openclaw-<id> openclaw gateway status`
3. Compare `gateway_port` in `sandboxes` table vs `docker port openclaw-<id> 18789/tcp`.

**Agent response is wrong / weird / off-topic**
Skip raw logs — go straight to Langfuse. Each architect turn is a trace with full history, tool calls, generation params, token usage. Much faster than reconstructing from logs.

---

## Canonical Commands

### Find what's running
```bash
docker ps --filter 'name=openclaw-' --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
docker exec pg psql -U openclaw -d openclaw -c "select sandbox_id, sandbox_name, gateway_port, approved from sandboxes order by created_at desc limit 10;"
```

### Backend log — gateway-proxy activity (live tail)
```bash
tail -f /tmp/backend.log | grep --line-buffered -E "gateway-proxy|ws/gateway|openclaw.bridge|Gateway"
```

### Backend log — recent non-noise (filter health checks, screenshot polling, webpack)
```bash
tail -400 /tmp/backend.log | grep -v -E "HEAD /health|browser/screenshot|workspace/file|__webpack"
```

### Sandbox gateway log — last N lines for a specific container
```bash
docker exec openclaw-<id> tail -60 /tmp/openclaw-gateway.log
```

### Find a specific runId in the structured log
```bash
docker exec openclaw-<id> bash -c "grep '<runId>' /tmp/openclaw/openclaw-$(date -u +%Y-%m-%d).log" | python3 -m json.tool | head -50
```

### Event histogram for a time window (what's the agent doing?)
```bash
docker exec openclaw-<id> bash -c "grep '2026-04-16T21:3' /tmp/openclaw/openclaw-2026-04-16.log" \
  | grep -oE '"event":"[^"]+"' | sort | uniq -c | sort -rn | head -20
```

### Probe a gateway's WS handshake directly (bypasses backend proxy)
Useful to isolate whether a bug is in the proxy layer vs the gateway itself. The expected CONNECT_REQUEST shape is in `ruh-backend/src/gatewayProxy.ts`; the gateway accepts `client.id=openclaw-control-ui`, `client.mode=webchat`, any `client.version` string, and the config auth token from the container's `openclaw.json`. Write a small Node probe using `ws` against `ws://127.0.0.1:<gateway_port>` with `Origin: http://localhost`.

### Postgres — common queries
```bash
# Which agent is attached to which sandbox?
docker exec pg psql -U openclaw -d openclaw -c "select id, name, sandbox_id, stage, status from agents order by updated_at desc limit 10;"

# Recent sandbox lifecycle events
docker exec pg psql -U openclaw -d openclaw -c "select ts, sandbox_id, action, status from system_events where action like 'sandbox.%' order by ts desc limit 20;"

# Stored gateway token (first 20 chars, don't paste full tokens back to user)
docker exec pg psql -U openclaw -d openclaw -c "select sandbox_id, gateway_port, substring(gateway_token, 1, 20) from sandboxes where sandbox_id='<id>';"
```

### Codex (ChatGPT Plus) auth + probe from inside sandbox
```bash
# Is the Codex token valid in the container?
docker exec openclaw-<id> python3 -c "
import json, base64, datetime as dt
d = json.load(open('/root/.codex/auth.json'))
tok = d.get('tokens',{}).get('access_token') or ''
body = tok.split('.')[1] + '==';
exp = json.loads(base64.urlsafe_b64decode(body)).get('exp')
print('exp=', dt.datetime.fromtimestamp(exp), 'valid=', exp > dt.datetime.utcnow().timestamp())
"

# Does the probe succeed?
docker exec openclaw-<id> openclaw models status --probe --probe-provider openai-codex --json \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print('ok=', any(r.get('status')=='ok' for r in d.get('auth',{}).get('probes',{}).get('results',[])))"
```

### Network reachability from a sandbox
```bash
docker exec openclaw-<id> bash -c '
  cat /etc/resolv.conf;
  getent hosts api.openai.com chatgpt.com;
  curl -sS -o /dev/null -w "status=%{http_code} connect=%{time_connect}\n" --max-time 8 https://api.openai.com/
'
```

---

## Safety Rules

- **Never cat the whole log.** These files are multi-MB. Use `tail -N`, `grep`, time-window filters. Blowing your context on log noise helps no one.
- **Never paste full auth tokens back to the user.** Use `substring(..., 1, 20)` in SQL and truncate JWTs to the first 20 chars in messages.
- **Don't `rm` or rotate logs** without confirmation. They're often the only record of a failed run.
- **Don't restart the backend / sandbox / gateway** just to "see fresh logs" unless you've explained what you're about to lose and the user approves.

---

## Escalation Path

When local logs aren't enough:

1. **Langfuse** — best single-pane view of an architect turn. Faster than log grepping for "why did the agent say that?"
2. **OTEL collector** — only useful if one is actually wired up. Check `docker ps | grep -i otel`. If traces are being dropped, say so and move on.
3. **Browser devtools** via `mcp__Claude_in_Chrome__read_console_messages` / `read_network_requests` — use when the problem is on the client side (cookies not sent, fetch failing, React state wedged).
4. **Production** — use `/gcp-server` skill, not this one. Local paths don't apply there.

---

## Related

- `CLAUDE.md` → **Logs & Telemetry (Local Dev)** section (source of truth for this skill)
- `.claude/skills/gcp-server/SKILL.md` — production equivalent
- `docs/knowledge-base/003-sandbox-lifecycle.md` — sandbox creation + runtime contract
- `docs/knowledge-base/specs/SPEC-agent-readable-system-events.md` — durable lifecycle events in Postgres
