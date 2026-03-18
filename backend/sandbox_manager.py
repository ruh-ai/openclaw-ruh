"""
Sandbox manager: creates and manages Daytona sandboxes pre-configured for OpenClaw.
Yields progress events as (event_type, message) tuples for SSE streaming.
"""

import time
from typing import Generator

from daytona import Daytona, DaytonaConfig, CreateSandboxFromImageParams, Resources

DAYTONA_API_URL = "https://app.daytona.io/api"
GATEWAY_PORT = 18789
SANDBOX_CPU = 2
SANDBOX_MEMORY = 2
SANDBOX_DISK = 10
PREVIEW_EXPIRY_SECONDS = 24 * 3600


def create_openclaw_sandbox(
    daytona_api_key: str,
    anthropic_api_key: str = "",
    openai_api_key: str = "",
    openrouter_api_key: str = "",
    gemini_api_key: str = "",
    telegram_bot_token: str = "",
    discord_bot_token: str = "",
    sandbox_name: str = "openclaw-gateway",
) -> Generator[tuple[str, str | dict], None, None]:
    """
    Creates a Daytona sandbox with OpenClaw installed.
    Yields (event_type, data) tuples:
      - ("log", "message string")
      - ("result", { sandbox_id, dashboard_url, gateway_token, ... })
      - ("error", "error message")
    """

    def log(msg: str):
        yield ("log", msg)

    config = DaytonaConfig(api_key=daytona_api_key, api_url=DAYTONA_API_URL)
    daytona = Daytona(config)

    # Collect env vars to forward into the sandbox
    env_vars: dict[str, str] = {}
    key_map = {
        "ANTHROPIC_API_KEY": anthropic_api_key,
        "OPENAI_API_KEY": openai_api_key,
        "OPENROUTER_API_KEY": openrouter_api_key,
        "GEMINI_API_KEY": gemini_api_key,
        "TELEGRAM_BOT_TOKEN": telegram_bot_token,
        "DISCORD_BOT_TOKEN": discord_bot_token,
    }
    for key, val in key_map.items():
        if val:
            env_vars[key] = val
            yield ("log", f"Forwarding {key} into sandbox")

    resources = Resources(cpu=SANDBOX_CPU, memory=SANDBOX_MEMORY, disk=SANDBOX_DISK)

    yield ("log", f"Creating sandbox '{sandbox_name}' with {SANDBOX_CPU} vCPU, {SANDBOX_MEMORY}GB RAM, {SANDBOX_DISK}GB disk ...")

    sandbox = daytona.create(
        CreateSandboxFromImageParams(
            image="node:22-bookworm",
            resources=resources,
            env_vars=env_vars,
            labels={"app": "openclaw", "component": "gateway"},
            auto_stop_interval=0,
        )
    )

    yield ("log", f"Sandbox created: {sandbox.id} (state: {sandbox.state})")

    def run(cmd: str, timeout: int = 300, label: str = "") -> tuple[bool, str]:
        display = label or cmd
        result = sandbox.process.exec(cmd, timeout=timeout)
        output = (result.result or "").strip()
        return result.exit_code == 0, output

    # Install OpenClaw
    yield ("log", "Installing OpenClaw (npm install -g openclaw@latest) ...")
    ok, out = run("npm install -g openclaw@latest", timeout=600)
    if not ok:
        yield ("log", "npm install failed, retrying with --unsafe-perm ...")
        ok, out = run("npm install -g --unsafe-perm openclaw@latest", timeout=600)
        if not ok:
            yield ("error", f"OpenClaw installation failed: {out}")
            return

    ok, ver = run("openclaw --version")
    if not ok:
        yield ("error", "openclaw binary not found after install")
        return
    yield ("log", f"OpenClaw installed: {ver}")

    # Build onboard command
    onboard_cmd = (
        "openclaw onboard --non-interactive --secret-input-mode plaintext "
        "--accept-risk --skip-health"
    )

    if openrouter_api_key:
        onboard_cmd += (
            " --auth-choice custom-api-key"
            " --custom-base-url https://openrouter.ai/api/v1"
            " --custom-model-id openrouter/auto"
            f" --custom-api-key {openrouter_api_key}"
            " --custom-compatibility openai"
        )
        yield ("log", "LLM provider: OpenRouter")
    elif openai_api_key:
        onboard_cmd += f" --auth-choice openai-api-key --custom-api-key {openai_api_key}"
        yield ("log", "LLM provider: OpenAI")
    elif anthropic_api_key:
        onboard_cmd += (
            " --auth-choice custom-api-key"
            " --custom-base-url https://api.anthropic.com/v1"
            " --custom-model-id claude-sonnet-4-20250514"
            f" --custom-api-key {anthropic_api_key}"
            " --custom-compatibility openai"
        )
        yield ("log", "LLM provider: Anthropic")
    elif gemini_api_key:
        onboard_cmd += (
            " --auth-choice custom-api-key"
            " --custom-base-url https://generativelanguage.googleapis.com/v1beta/openai"
            " --custom-model-id gemini-2.5-flash"
            f" --custom-api-key {gemini_api_key}"
            " --custom-compatibility openai"
        )
        yield ("log", "LLM provider: Gemini")
    else:
        onboard_cmd += " --auth-choice skip"
        yield ("log", "LLM provider: skipped (no API key provided)")

    yield ("log", "Running OpenClaw onboarding (non-interactive) ...")
    ok, onboard_out = run(onboard_cmd, timeout=120)
    if not ok:
        yield ("error", f"Onboarding failed: {onboard_out}")
        return
    yield ("log", "Onboarding completed!")

    # Generate preview URLs
    yield ("log", "Generating preview URLs ...")
    dashboard_url = None
    dashboard_token = None
    signed_url = None

    try:
        preview = sandbox.get_preview_link(GATEWAY_PORT)
        dashboard_url = preview.url
        dashboard_token = preview.token
        yield ("log", f"Standard URL: {dashboard_url}")
    except Exception as e:
        yield ("log", f"Standard preview URL failed: {e}")

    try:
        signed = sandbox.create_signed_preview_url(GATEWAY_PORT, expires_in_seconds=PREVIEW_EXPIRY_SECONDS)
        signed_url = signed.url
        yield ("log", f"Signed URL: {signed_url}")
    except Exception as e:
        yield ("log", f"Signed preview URL failed: {e}")

    # Patch config for remote access
    yield ("log", "Patching gateway config for remote access ...")
    run("openclaw config set gateway.bind lan", label="set gateway.bind=lan")

    allowed_origins: list[str] = []
    for url in [dashboard_url, signed_url]:
        if url:
            parts = url.split("/")
            allowed_origins.append(f"{parts[0]}//{parts[2]}")

    if allowed_origins:
        origins_json = ", ".join(f'"{o}"' for o in allowed_origins)
        run(
            f"""openclaw config set gateway.controlUi.allowedOrigins '[{origins_json}]'""",
            label="set controlUi.allowedOrigins",
        )

    run(
        """openclaw config set gateway.trustedProxies '["127.0.0.1", "172.20.0.0/16"]'""",
        label="set trustedProxies",
    )
    run(
        "openclaw config set gateway.controlUi.allowInsecureAuth true",
        label="set controlUi.allowInsecureAuth=true",
    )
    run(
        "openclaw config set gateway.http.endpoints.chatCompletions.enabled true",
        label="enable /v1/chat/completions",
    )

    # Read gateway token
    gateway_token = None
    token_result = sandbox.process.exec(
        """node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('/root/.openclaw/openclaw.json','utf8')).gateway.auth.token)" """
    )
    if token_result.exit_code == 0 and (token_result.result or "").strip():
        gateway_token = token_result.result.strip()
        yield ("log", f"Gateway token retrieved")

    # Write env file
    if env_vars:
        yield ("log", "Writing env vars to ~/.openclaw/.env ...")
        env_lines = [f"{k}={v}" for k, v in env_vars.items()]
        escaped = "\\n".join(env_lines)
        run(
            f"node -e \"require('fs').writeFileSync(require('os').homedir()+'/.openclaw/.env', '{escaped}\\n')\"",
            label="write ~/.openclaw/.env",
        )

    # Start gateway
    yield ("log", "Starting OpenClaw gateway ...")
    run("openclaw gateway stop 2>/dev/null || true")
    gateway_cmd = f"nohup openclaw gateway run --bind lan --port {GATEWAY_PORT} > /tmp/openclaw-gateway.log 2>&1 &"
    run(gateway_cmd)

    yield ("log", "Waiting for gateway to start ...")
    healthy = False
    for _ in range(20):
        time.sleep(3)
        check = sandbox.process.exec(
            f"node -e \"const n=require('net');const c=n.connect({GATEWAY_PORT},'127.0.0.1',()=>{{c.end();process.exit(0)}});c.on('error',()=>process.exit(1))\""
        )
        if check.exit_code == 0:
            healthy = True
            break

    if not healthy:
        yield ("log", "WARNING: Gateway did not start within 60s — check logs via SSH")
        _, log_out = run("tail -20 /tmp/openclaw-gateway.log")
        if log_out:
            yield ("log", f"Gateway logs:\n{log_out}")
    else:
        yield ("log", "Gateway is listening!")

    best_url = signed_url or dashboard_url

    result_data = {
        "sandbox_id": sandbox.id,
        "sandbox_state": str(sandbox.state),
        "dashboard_url": best_url,
        "signed_url": signed_url,
        "standard_url": dashboard_url,
        "preview_token": dashboard_token,
        "gateway_token": gateway_token,
        "gateway_port": GATEWAY_PORT,
        "ssh_command": f"daytona ssh {sandbox.id}",
        "approve_command": f"python3 openclaw-approve.py {sandbox.id}",
    }
    yield ("result", result_data)

    # ── Auto-approve device pairing (mirrors openclaw-approve.py) ────────────
    yield ("log", "Waiting for device pairing request (open the dashboard and connect)...")

    approved_lines: set[str] = set()
    APPROVAL_POLL_INTERVAL = 3   # seconds between polls
    APPROVAL_TIMEOUT = 300       # give up after 5 minutes

    deadline = time.time() + APPROVAL_TIMEOUT
    while time.time() < deadline:
        check = sandbox.process.exec("openclaw devices approve --latest 2>&1")
        output = (check.result or "").strip()

        if "Approved" in output:
            for line in output.splitlines():
                if "Approved" in line and line not in approved_lines:
                    approved_lines.add(line)
                    yield ("approved", {"message": line})
                    yield ("log", f"Device approved: {line}")
            # Stop after first successful approval batch
            break

        time.sleep(APPROVAL_POLL_INTERVAL)
    else:
        yield ("log", "Approval timeout reached — run 'openclaw devices approve --latest' manually inside the sandbox")
