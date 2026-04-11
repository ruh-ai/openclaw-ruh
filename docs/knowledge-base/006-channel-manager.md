# Channel Manager

[[000-INDEX|← Index]] | [[005-data-models|Data Models]] | [[007-conversation-store|Conversation Store →]]

---

## Overview

The channel manager handles Telegram and Slack runtime configuration for a running sandbox. All operations communicate with the OpenClaw process inside the Docker container via `docker exec`.

This is separate from the saved-agent builder metadata contract in `agentStore.ts`: builder `channels[]` can currently describe `telegram`, `slack`, or `discord` as planned/configured/unsupported product state, but only Telegram and Slack have sandbox runtime routes here today.

**File:** `ruh-backend/src/channelManager.ts`

---

## How It Works

OpenClaw stores its channel config in `~/.openclaw/openclaw.json` inside the container. The channel manager reads/writes this config using two methods:

1. **Read:** `node -e "process.stdout.write(fs.readFileSync('/root/.openclaw/openclaw.json', 'utf8'))"` — reads raw JSON
2. **Write:** `openclaw config set <dotted.key> <value>` — uses OpenClaw CLI to set individual keys

After any write, the gateway is restarted for changes to take effect.

Current gap: the manager records per-step `✓/✗` logs for config writes but still reports an unconditional success contract for Telegram/Slack save operations today; see [[LEARNING-2026-03-25-channel-config-false-success]].

---

## API Functions

### `getChannelsConfig(sandboxId)`

Reads `openclaw.json` from the container and returns:

```json
{
  "telegram": {
    "enabled": false,
    "botToken": "1234***5678",   // masked: first 4 + last 4 chars
    "dmPolicy": "pairing"
  },
  "slack": {
    "enabled": false,
    "mode": "socket",
    "appToken": "***",
    "botToken": "***",
    "signingSecret": "***",
    "dmPolicy": "pairing"
  }
}
```

Token masking: `mask(v)` — shows first 4 + last 4 chars, or `***` if ≤8 chars.

---

### `setTelegramConfig(sandboxId, cfg)`

Writes Telegram config fields: `enabled`, `botToken`, `dmPolicy`.
Uses `openclaw config set channels.telegram.<key> <value>`.
Restarts gateway after all keys are set.

---

### `setSlackConfig(sandboxId, cfg)`

Writes Slack config fields: `enabled`, `mode`, `appToken`, `botToken`, `signingSecret`, `dmPolicy`.
Uses `openclaw config set channels.slack.<key> <value>`.
Restarts gateway after all keys are set.

---

### `probeChannelStatus(sandboxId, channel)`

Runs `openclaw channels status --probe` inside the container (45s timeout).
Returns `{ ok, channel, output }`.

---

## Pairing Flow

Pairing allows a Telegram/Slack user to link their account to the agent.

### `listPairingRequests(sandboxId, channel)`

Runs `openclaw pairing list <channel>` inside the container.
Parses 8-character uppercase alphanumeric codes from the output (`/\b([A-Z0-9]{8})\b/g`).
Returns `{ ok, channel, output, codes: string[] }`.

### `approvePairing(sandboxId, channel, code)`

Sanitizes code: uppercase + strip non-alphanumeric.
Runs `openclaw pairing approve <channel> <code>` inside the container.
Returns `{ ok, channel, code, output }`.

---

## Gateway Restart

`restartGateway(sandboxId)` — called after any config change:

```
1. openclaw gateway stop  (ignore errors)
2. sleep 2s
3. OPENCLAW_ALLOW_INSECURE_PRIVATE_WS=1 nohup openclaw gateway run --bind lan --port 18789 > /tmp/openclaw-gateway.log 2>&1 &
```

The `OPENCLAW_ALLOW_INSECURE_PRIVATE_WS=1` env var is set on restart to allow WebSocket connections over non-TLS private networks (required for local Docker sandbox communication).

---

## Config Key Mapping

OpenClaw's dotted config keys used:

| Key | Value |
|---|---|
| `channels.telegram.enabled` | boolean |
| `channels.telegram.botToken` | string |
| `channels.telegram.dmPolicy` | `"pairing"` \| other |
| `channels.slack.enabled` | boolean |
| `channels.slack.mode` | `"socket"` \| other |
| `channels.slack.appToken` | string |
| `channels.slack.botToken` | string |
| `channels.slack.signingSecret` | string |
| `channels.slack.dmPolicy` | `"pairing"` \| other |

---

## Related Learnings

- [[LEARNING-2026-03-25-backend-error-diagnostic-exposure]] — channel probe and pairing helpers currently return raw `openclaw` command output, so channel diagnostics still need a client-safe redaction boundary
- [[LEARNING-2026-03-25-channel-config-false-success]] — channel saves currently report success even when config writes or restart steps fail, so the operator UI can claim "Saved" for a broken channel apply
- [[LEARNING-2026-03-25-docker-timeouts-not-enforced]] — channel config and probe flows pass timeout budgets into Docker helpers that currently ignore them, so a hung `docker exec` can still wedge an otherwise bounded operator action
