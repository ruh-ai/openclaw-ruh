# OpenClaw Codex Loop Host Setup

Use these files to bootstrap the GCP VM that hosts the OpenClaw-driven codex task loop.

## Files

- `openclaw-codex-loop.env.example`: runtime env template
- `openclaw-codex-loop.config.example.jsonc`: example OpenClaw gateway config with the 5-minute cron schedule
- `openclaw-codex-loop.service`: systemd unit for the OpenClaw gateway
- `openclaw-codex-loop.timer`: optional host-level health check timer

## Recommended placement

- env file: `/etc/openclaw/openclaw-codex-loop.env`
- config file: `/etc/openclaw/openclaw-codex-loop.config.jsonc`
- repo checkout: `/srv/openclaw-ruh`

## Bootstrap

1. Clone the repo onto the VM.
2. Install `gh`, `codex`, `openclaw`, and Node.js 22+.
3. Copy `openclaw-codex-loop.env.example` to `/etc/openclaw/openclaw-codex-loop.env` and fill in secrets.
4. Copy `openclaw-codex-loop.config.example.jsonc` to `/etc/openclaw/openclaw-codex-loop.config.jsonc`.
5. Install the systemd unit and timer.
6. Start the gateway service and enable the timer.

## Notes

- The timer is only a host-level health check. Task scheduling remains inside the OpenClaw cron config.
- Keep the gateway bound to loopback and place TLS and access controls in front of it if a webhook endpoint is exposed.
