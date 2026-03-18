"""
Channel manager: reads and writes Telegram/Slack channel config on a running
Daytona sandbox via the OpenClaw CLI.

All functions are synchronous (blocking) — call them from a thread pool
executor in async FastAPI route handlers.
"""

import json
import time

from daytona import Daytona, DaytonaConfig

DAYTONA_API_URL = "https://app.daytona.io/api"
GATEWAY_PORT = 18789
CONFIG_PATH = "/root/.openclaw/openclaw.json"


# ── Sandbox helpers ────────────────────────────────────────────────────────────

def _get_sandbox(api_key: str, sandbox_id: str):
    cfg = DaytonaConfig(api_key=api_key, api_url=DAYTONA_API_URL)
    return Daytona(cfg).get(sandbox_id)


def _exec(sandbox, cmd: str, timeout: int = 30) -> tuple[bool, str]:
    res = sandbox.process.exec(cmd, timeout=timeout)
    return res.exit_code == 0, (res.result or "").strip()


def _read_openclaw_config(sandbox) -> dict:
    ok, out = _exec(
        sandbox,
        f"node -e \"process.stdout.write(require('fs').readFileSync('{CONFIG_PATH}','utf8'))\"",
    )
    if not ok or not out:
        return {}
    try:
        return json.loads(out)
    except Exception:
        return {}


def _set_cfg(sandbox, dotted_key: str, value) -> tuple[bool, str]:
    """Run `openclaw config set <key> <value>` safely."""
    if isinstance(value, bool):
        val_str = "true" if value else "false"
        return _exec(sandbox, f"openclaw config set {dotted_key} {val_str}")
    else:
        # Escape single quotes in value, wrap in single quotes for the shell
        safe = str(value).replace("'", "'\\''")
        return _exec(sandbox, f"openclaw config set {dotted_key} '{safe}'")


def _restart_gateway(sandbox) -> None:
    _exec(sandbox, "openclaw gateway stop 2>/dev/null || true", timeout=15)
    time.sleep(2)
    _exec(
        sandbox,
        f"nohup openclaw gateway run --bind lan --port {GATEWAY_PORT} "
        f"> /tmp/openclaw-gateway.log 2>&1 &",
        timeout=10,
    )


def _mask(v: str) -> str:
    """Return a masked version of a credential string."""
    if not v:
        return ""
    if len(v) <= 8:
        return "***"
    return v[:4] + "***" + v[-4:]


# ── Public API ─────────────────────────────────────────────────────────────────

def get_channels_config(api_key: str, sandbox_id: str) -> dict:
    """
    Read channel config from the sandbox, returning masked credential values.
    """
    sb = _get_sandbox(api_key, sandbox_id)
    config = _read_openclaw_config(sb)
    channels = config.get("channels", {})

    tg = channels.get("telegram", {})
    sl = channels.get("slack", {})

    return {
        "telegram": {
            "enabled": bool(tg.get("enabled", False)),
            "botToken": _mask(tg.get("botToken", "")),
            "dmPolicy": tg.get("dmPolicy", "pairing"),
        },
        "slack": {
            "enabled": bool(sl.get("enabled", False)),
            "mode": sl.get("mode", "socket"),
            "appToken": _mask(sl.get("appToken", "")),
            "botToken": _mask(sl.get("botToken", "")),
            "signingSecret": _mask(sl.get("signingSecret", "")),
            "dmPolicy": sl.get("dmPolicy", "pairing"),
        },
    }


def set_telegram_config(api_key: str, sandbox_id: str, cfg: dict) -> dict:
    """
    Apply Telegram channel settings on the sandbox and restart the gateway.

    Fields in `cfg`:
      enabled   bool
      botToken  str  (skip update if empty/None — preserves existing token)
      dmPolicy  str  pairing | allowlist | open | disabled
    """
    sb = _get_sandbox(api_key, sandbox_id)
    logs: list[str] = []

    if "enabled" in cfg:
        ok, _ = _set_cfg(sb, "channels.telegram.enabled", cfg["enabled"])
        logs.append(f"{'✓' if ok else '✗'} enabled={cfg['enabled']}")

    if cfg.get("botToken"):
        ok, _ = _set_cfg(sb, "channels.telegram.botToken", cfg["botToken"])
        logs.append(f"{'✓' if ok else '✗'} botToken=***")

    if cfg.get("dmPolicy"):
        ok, _ = _set_cfg(sb, "channels.telegram.dmPolicy", cfg["dmPolicy"])
        logs.append(f"{'✓' if ok else '✗'} dmPolicy={cfg['dmPolicy']}")

    _restart_gateway(sb)
    logs.append("✓ Gateway restarted")

    return {"ok": True, "logs": logs}


def set_slack_config(api_key: str, sandbox_id: str, cfg: dict) -> dict:
    """
    Apply Slack channel settings on the sandbox and restart the gateway.

    Fields in `cfg`:
      enabled       bool
      mode          str   socket | http
      appToken      str   xapp-...  (skip if empty)
      botToken      str   xoxb-...  (skip if empty)
      signingSecret str             (skip if empty)
      dmPolicy      str   pairing | allowlist | open | disabled
    """
    sb = _get_sandbox(api_key, sandbox_id)
    logs: list[str] = []

    if "enabled" in cfg:
        ok, _ = _set_cfg(sb, "channels.slack.enabled", cfg["enabled"])
        logs.append(f"{'✓' if ok else '✗'} enabled={cfg['enabled']}")

    if cfg.get("mode"):
        ok, _ = _set_cfg(sb, "channels.slack.mode", cfg["mode"])
        logs.append(f"{'✓' if ok else '✗'} mode={cfg['mode']}")

    if cfg.get("appToken"):
        ok, _ = _set_cfg(sb, "channels.slack.appToken", cfg["appToken"])
        logs.append(f"{'✓' if ok else '✗'} appToken=***")

    if cfg.get("botToken"):
        ok, _ = _set_cfg(sb, "channels.slack.botToken", cfg["botToken"])
        logs.append(f"{'✓' if ok else '✗'} botToken=***")

    if cfg.get("signingSecret"):
        ok, _ = _set_cfg(sb, "channels.slack.signingSecret", cfg["signingSecret"])
        logs.append(f"{'✓' if ok else '✗'} signingSecret=***")

    if cfg.get("dmPolicy"):
        ok, _ = _set_cfg(sb, "channels.slack.dmPolicy", cfg["dmPolicy"])
        logs.append(f"{'✓' if ok else '✗'} dmPolicy={cfg['dmPolicy']}")

    _restart_gateway(sb)
    logs.append("✓ Gateway restarted")

    return {"ok": True, "logs": logs}


def probe_channel_status(api_key: str, sandbox_id: str, channel: str) -> dict:
    """
    Run `openclaw channels status --probe` and return parsed output.
    `channel` is used only to label the result; the command probes all channels.
    """
    sb = _get_sandbox(api_key, sandbox_id)
    ok, output = _exec(sb, "openclaw channels status --probe 2>&1", timeout=45)
    return {"ok": ok, "channel": channel, "output": output}


# ── Pairing ────────────────────────────────────────────────────────────────────

def list_pairing_requests(api_key: str, sandbox_id: str, channel: str) -> dict:
    """
    Run `openclaw pairing list <channel>` and return the raw output plus any
    codes parsed from lines that look like `XXXX1234`.
    """
    sb = _get_sandbox(api_key, sandbox_id)
    ok, output = _exec(sb, f"openclaw pairing list {channel} 2>&1", timeout=30)

    # Try to extract 8-char uppercase alphanumeric codes from the output
    import re
    codes = re.findall(r"\b([A-Z0-9]{8})\b", output)

    return {"ok": ok, "channel": channel, "output": output, "codes": codes}


def approve_pairing(api_key: str, sandbox_id: str, channel: str, code: str) -> dict:
    """
    Run `openclaw pairing approve <channel> <code>` and return success/failure.
    """
    # Sanitise code — only allow uppercase alphanumeric to prevent injection
    import re
    clean_code = re.sub(r"[^A-Z0-9]", "", code.upper())
    if not clean_code:
        return {"ok": False, "output": "Invalid pairing code"}

    sb = _get_sandbox(api_key, sandbox_id)
    ok, output = _exec(sb, f"openclaw pairing approve {channel} {clean_code} 2>&1", timeout=30)
    return {"ok": ok, "channel": channel, "code": clean_code, "output": output}
