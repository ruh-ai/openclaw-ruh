"""
OpenClaw Daytona Backend API
"""

import asyncio
import json
import os
import uuid
from typing import Any

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

import store
import conversation_store
import channel_manager

load_dotenv()

app = FastAPI(title="OpenClaw Daytona API", version="1.0.0")

allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in allowed_origins],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory store for active creation streams
_streams: dict[str, dict] = {}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _daytona_api_key() -> str:
    key = os.getenv("DAYTONA_API_KEY", "")
    if not key:
        raise HTTPException(status_code=500, detail="DAYTONA_API_KEY not set in server environment")
    return key


def _gateway_url_and_headers(record: dict[str, Any], path: str) -> tuple[str, dict[str, str]]:
    """
    Build the gateway request URL + auth headers for a sandbox record.
    Prefers the signed URL (token already embedded) over the standard URL.
    """
    # Signed URL has the Daytona preview token baked in — use it when available
    base = record.get("signed_url") or record.get("standard_url") or record.get("dashboard_url") or ""
    if not base:
        raise HTTPException(status_code=503, detail="No gateway URL available for this sandbox")
    headers: dict[str, str] = {}
    # Only add the preview-token header when using the standard (unsigned) URL
    if not record.get("signed_url") and record.get("preview_token"):
        headers["X-Daytona-Preview-Token"] = record["preview_token"]
    if record.get("gateway_token"):
        headers["Authorization"] = f"Bearer {record['gateway_token']}"
    return base.rstrip("/") + path, headers


def _get_record(sandbox_id: str) -> dict[str, Any]:
    record = store.get_sandbox(sandbox_id)
    if not record:
        raise HTTPException(status_code=404, detail="Sandbox not found")
    return record


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok"}


# ── Sandbox creation ──────────────────────────────────────────────────────────

class CreateSandboxRequest(BaseModel):
    sandbox_name: str = Field(default="openclaw-gateway")


@app.post("/api/sandboxes/create")
async def create_sandbox(req: CreateSandboxRequest):
    """Kick off sandbox creation; returns a stream_id for SSE progress."""
    _daytona_api_key()  # Fail fast if key is missing
    stream_id = str(uuid.uuid4())
    _streams[stream_id] = {"status": "pending", "request": req.model_dump()}
    return {"stream_id": stream_id}


@app.get("/api/sandboxes/stream/{stream_id}")
async def stream_sandbox_progress(stream_id: str):
    """SSE stream: real-time progress for sandbox creation + auto-approval."""
    if stream_id not in _streams:
        raise HTTPException(status_code=404, detail="stream_id not found")
    entry = _streams[stream_id]
    if entry["status"] != "pending":
        raise HTTPException(status_code=409, detail="Stream already consumed")

    entry["status"] = "running"
    req_data = entry["request"]

    async def event_generator():
        from sandbox_manager import create_openclaw_sandbox

        try:
            gen = create_openclaw_sandbox(
                daytona_api_key=_daytona_api_key(),
                anthropic_api_key=os.getenv("ANTHROPIC_API_KEY", ""),
                openai_api_key=os.getenv("OPENAI_API_KEY", ""),
                openrouter_api_key=os.getenv("OPENROUTER_API_KEY", ""),
                gemini_api_key=os.getenv("GEMINI_API_KEY", ""),
                telegram_bot_token=os.getenv("TELEGRAM_BOT_TOKEN", ""),
                discord_bot_token=os.getenv("DISCORD_BOT_TOKEN", ""),
                sandbox_name=req_data.get("sandbox_name", "openclaw-gateway"),
            )

            for event_type, data in gen:
                if event_type == "log":
                    yield {"event": "log", "data": json.dumps({"message": data})}
                elif event_type == "result":
                    store.save_sandbox(data, sandbox_name=req_data.get("sandbox_name", ""))
                    entry["result"] = data
                    yield {"event": "result", "data": json.dumps(data)}
                elif event_type == "approved":
                    store.mark_approved(entry["result"]["sandbox_id"])
                    entry["status"] = "done"
                    yield {"event": "approved", "data": json.dumps(data)}
                elif event_type == "error":
                    entry.update({"status": "error", "error": data})
                    yield {"event": "error", "data": json.dumps({"message": data})}
                    return

            entry["status"] = "done"
            yield {"event": "done", "data": json.dumps({"stream_id": stream_id})}

        except Exception as exc:
            err = str(exc)
            entry.update({"status": "error", "error": err})
            yield {"event": "error", "data": json.dumps({"message": err})}

    return EventSourceResponse(event_generator())


# ── Saved sandboxes CRUD ──────────────────────────────────────────────────────

@app.get("/api/sandboxes")
async def list_saved_sandboxes():
    return store.list_sandboxes()


@app.delete("/api/sandboxes/{sandbox_id}")
async def delete_saved_sandbox(sandbox_id: str):
    if not store.delete_sandbox(sandbox_id):
        raise HTTPException(status_code=404, detail="Sandbox not found")
    return {"deleted": sandbox_id}


@app.get("/api/sandboxes/{sandbox_id}")
async def get_saved_sandbox(sandbox_id: str):
    # Allow polling creation stream by stream_id too
    if sandbox_id in _streams:
        e = _streams[sandbox_id]
        return {"status": e["status"], **({"result": e["result"]} if "result" in e else {})}
    return _get_record(sandbox_id)


# ── Gateway proxy ─────────────────────────────────────────────────────────────

def _synthetic_models(sandbox_id: str) -> dict:
    """Return a single synthetic model entry when the gateway doesn't expose /v1/models."""
    return {
        "object": "list",
        "data": [
            {
                "id": "openclaw-default",
                "object": "model",
                "created": 0,
                "owned_by": "openclaw",
            }
        ],
        "_synthetic": True,
    }


@app.get("/api/sandboxes/{sandbox_id}/models")
async def get_sandbox_models(sandbox_id: str):
    """
    List models/agents from the OpenClaw gateway's /v1/models endpoint.
    Falls back to a synthetic single-model list when the endpoint is absent or returns no body.
    """
    record = _get_record(sandbox_id)
    url, headers = _gateway_url_and_headers(record, "/v1/models")
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(url, headers=headers)
            body = resp.text.strip()

            if resp.status_code >= 400:
                # Gateway returned an error — fall back rather than surfacing a 500
                return _synthetic_models(sandbox_id)

            if not body:
                # 200 OK but empty body — endpoint exists but returns nothing
                return _synthetic_models(sandbox_id)

            try:
                return resp.json()
            except Exception:
                # Non-JSON body (HTML gateway page, plain text, etc.)
                return _synthetic_models(sandbox_id)

    except httpx.RequestError:
        # Gateway unreachable — return synthetic so the UI still loads
        return _synthetic_models(sandbox_id)


@app.get("/api/sandboxes/{sandbox_id}/status")
async def get_gateway_status(sandbox_id: str):
    """
    Fetch gateway status / agent info from OpenClaw's status endpoint.
    Falls back to stored record fields if the endpoint is unavailable.
    """
    record = _get_record(sandbox_id)
    url, headers = _gateway_url_and_headers(record, "/api/status")
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code == 200 and resp.text.strip():
                try:
                    return resp.json()
                except Exception:
                    pass
    except httpx.RequestError:
        pass

    # Fallback: return the stored metadata
    return {
        "sandbox_id": record["sandbox_id"],
        "sandbox_name": record["sandbox_name"],
        "gateway_port": record.get("gateway_port", 18789),
        "approved": record.get("approved", False),
        "created_at": record.get("created_at"),
    }


@app.post("/api/sandboxes/{sandbox_id}/chat")
async def proxy_chat(sandbox_id: str, request: Request):
    """
    Proxy chat completions to the OpenClaw gateway.

    Optional body field beyond the standard OpenAI payload:
      conversation_id — UUID of a stored conversation. The backend looks up the
                        conversation's openclaw_session_key and passes it as both
                        the `user` field and the `x-openclaw-session-key` header
                        so the gateway maintains server-side context across calls.
    """
    record = _get_record(sandbox_id)
    body = await request.json()

    # ── Conversation / session routing ────────────────────────────────────────
    conversation_id: str | None = body.pop("conversation_id", None)
    if conversation_id:
        conv = conversation_store.get_conversation(conversation_id)
        if conv:
            # Use the stored openclaw_session_key for deterministic routing
            session_key = conv["openclaw_session_key"]
        else:
            # Fallback: derive key from the id even if not persisted locally
            session_key = f"agent:main:{conversation_id}"
        body["user"] = conversation_id          # stable key derivation via `user`
    else:
        session_key = None
    # ─────────────────────────────────────────────────────────────────────────

    url, headers = _gateway_url_and_headers(record, "/v1/chat/completions")
    headers["Content-Type"] = "application/json"

    if session_key:
        headers["x-openclaw-session-key"] = session_key

    is_stream = body.get("stream", False)

    if is_stream:
        async def stream_gen():
            async with httpx.AsyncClient(timeout=120) as client:
                async with client.stream("POST", url, headers=headers, json=body) as resp:
                    if resp.status_code >= 400:
                        err = await resp.aread()
                        yield err
                        return
                    async for chunk in resp.aiter_bytes():
                        yield chunk

        return StreamingResponse(stream_gen(), media_type="text/event-stream")
    else:
        try:
            async with httpx.AsyncClient(timeout=120) as client:
                resp = await client.post(url, headers=headers, json=body)
                resp.raise_for_status()
                return resp.json()
        except httpx.HTTPStatusError as exc:
            raise HTTPException(status_code=exc.response.status_code, detail=exc.response.text)
        except httpx.RequestError as exc:
            raise HTTPException(status_code=503, detail=f"Gateway unreachable: {exc}")


# ── Conversation management ───────────────────────────────────────────────────
# Conversations metadata → data/conversations.json
# Message history       → data/messages/<conversation_id>.json

class CreateConversationRequest(BaseModel):
    name: str = "New Conversation"
    model: str = "openclaw-default"


class AppendMessagesRequest(BaseModel):
    messages: list[dict[str, Any]]


class RenameConversationRequest(BaseModel):
    name: str


@app.get("/api/sandboxes/{sandbox_id}/conversations")
async def list_conversations(sandbox_id: str):
    """List all conversations for a sandbox (metadata only, newest first)."""
    _get_record(sandbox_id)
    return conversation_store.list_conversations(sandbox_id)


@app.post("/api/sandboxes/{sandbox_id}/conversations")
async def create_conversation(sandbox_id: str, req: CreateConversationRequest):
    """
    Create a new conversation.
    The returned record contains `openclaw_session_key` which is forwarded to the
    gateway on every chat request to maintain server-side context.
    """
    _get_record(sandbox_id)
    return conversation_store.create_conversation(sandbox_id, model=req.model, name=req.name)


@app.get("/api/sandboxes/{sandbox_id}/conversations/{conv_id}/messages")
async def get_conversation_messages(sandbox_id: str, conv_id: str):
    """Return the full message history for a conversation."""
    conv = conversation_store.get_conversation(conv_id)
    if not conv or conv["sandbox_id"] != sandbox_id:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conversation_store.get_messages(conv_id)


@app.post("/api/sandboxes/{sandbox_id}/conversations/{conv_id}/messages")
async def append_messages(sandbox_id: str, conv_id: str, req: AppendMessagesRequest):
    """Append one or more messages to a conversation's history file."""
    conv = conversation_store.get_conversation(conv_id)
    if not conv or conv["sandbox_id"] != sandbox_id:
        raise HTTPException(status_code=404, detail="Conversation not found")
    conversation_store.append_messages(conv_id, req.messages)
    return {"ok": True}


@app.patch("/api/sandboxes/{sandbox_id}/conversations/{conv_id}")
async def rename_conversation(sandbox_id: str, conv_id: str, req: RenameConversationRequest):
    """Rename a conversation."""
    conv = conversation_store.get_conversation(conv_id)
    if not conv or conv["sandbox_id"] != sandbox_id:
        raise HTTPException(status_code=404, detail="Conversation not found")
    conversation_store.rename_conversation(conv_id, req.name)
    return {"ok": True}


@app.delete("/api/sandboxes/{sandbox_id}/conversations/{conv_id}")
async def delete_conversation(sandbox_id: str, conv_id: str):
    """Delete a conversation and its message history file."""
    conv = conversation_store.get_conversation(conv_id)
    if not conv or conv["sandbox_id"] != sandbox_id:
        raise HTTPException(status_code=404, detail="Conversation not found")
    conversation_store.delete_conversation(conv_id)
    return {"deleted": conv_id}


# ── Cron management (via Daytona exec → openclaw cron CLI) ────────────────────
#
# The OpenClaw gateway exposes cron management only via WebSocket (with device-
# token scopes).  The simplest and most reliable alternative is to exec the
# `openclaw cron` CLI directly inside the Daytona sandbox, which always has
# access to the local gateway without scope restrictions.

def _daytona_sandbox(sandbox_id: str):
    """Return a live Daytona Sandbox object for the given sandbox_id."""
    from daytona import Daytona, DaytonaConfig
    d = Daytona(DaytonaConfig(api_key=_daytona_api_key()))
    return d.get(sandbox_id)


async def _sandbox_exec(sandbox_id: str, cmd: str, timeout: int = 30) -> tuple[int, str]:
    """Run cmd inside the Daytona sandbox, returning (exit_code, stdout)."""
    loop = asyncio.get_event_loop()
    def _run():
        sb = _daytona_sandbox(sandbox_id)
        res = sb.process.exec(cmd, timeout=timeout)
        return res.exit_code, res.result or ""
    return await loop.run_in_executor(None, _run)


def _parse_json_output(output: str) -> Any:
    """
    Strip doctor-warning box lines that openclaw prepends and parse the JSON.
    The CLI sometimes outputs an interactive box before the JSON payload.
    """
    lines = output.splitlines()
    # Find the first line that starts a JSON object or array
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith("{") or stripped.startswith("["):
            return json.loads("\n".join(lines[i:]))
    raise ValueError(f"No JSON found in output: {output[:200]}")


class CreateCronRequest(BaseModel):
    name: str
    schedule: dict[str, Any]          # { kind, expr/at/everyMs, tz? }
    payload: dict[str, Any]           # { kind, text/message }
    session_target: str = "isolated"  # main | isolated | session:<id>
    wake_mode: str = "now"            # now | next-heartbeat
    delete_after_run: bool = False
    enabled: bool = True
    description: str = ""


@app.get("/api/sandboxes/{sandbox_id}/crons")
async def list_crons(sandbox_id: str):
    """List all cron jobs via openclaw cron list --json inside the sandbox."""
    _get_record(sandbox_id)
    exit_code, output = await _sandbox_exec(
        sandbox_id, "openclaw cron list --json 2>&1", timeout=20
    )
    if exit_code != 0:
        raise HTTPException(status_code=502, detail=f"openclaw cron list failed: {output[:300]}")
    try:
        return _parse_json_output(output)
    except (ValueError, json.JSONDecodeError) as e:
        raise HTTPException(status_code=502, detail=f"Failed to parse cron list output: {e}")


@app.post("/api/sandboxes/{sandbox_id}/crons")
async def create_cron(sandbox_id: str, req: CreateCronRequest):
    """Create a cron job via openclaw cron add inside the sandbox."""
    _get_record(sandbox_id)

    sched = req.schedule
    kind = sched.get("kind", "cron")

    # Build the schedule flag
    if kind == "cron":
        expr = sched.get("expr", "0 9 * * *")
        tz = sched.get("tz", "")
        sched_flag = f"--cron {json.dumps(expr)}"
        if tz:
            sched_flag += f" --tz {json.dumps(tz)}"
    elif kind == "every":
        every_ms = int(sched.get("everyMs", 1800000))
        every_min = every_ms // 60000
        sched_flag = f"--every {every_min}m"
    elif kind == "at":
        at_val = sched.get("at", "")
        sched_flag = f"--at {json.dumps(at_val)}"
    else:
        raise HTTPException(status_code=400, detail=f"Unknown schedule kind: {kind}")

    # Build the payload flag
    payload = req.payload
    payload_kind = payload.get("kind", "agentTurn")
    if payload_kind == "systemEvent":
        payload_flag = f"--system-event {json.dumps(payload.get('text', ''))}"
    else:
        msg = payload.get("message") or payload.get("text", "")
        payload_flag = f"--message {json.dumps(msg)}"

    # Assemble command
    cmd_parts = [
        "openclaw cron add --json",
        f"--name {json.dumps(req.name)}",
        sched_flag,
        payload_flag,
        f"--session {req.session_target}",
        f"--wake {req.wake_mode}",
    ]
    if req.delete_after_run:
        cmd_parts.append("--delete-after-run")
    if not req.enabled:
        cmd_parts.append("--disabled")
    if req.description:
        cmd_parts.append(f"--description {json.dumps(req.description)}")

    cmd = " ".join(cmd_parts) + " 2>&1"
    exit_code, output = await _sandbox_exec(sandbox_id, cmd, timeout=30)
    if exit_code != 0:
        raise HTTPException(status_code=502, detail=f"openclaw cron add failed: {output[:400]}")
    try:
        return _parse_json_output(output)
    except (ValueError, json.JSONDecodeError):
        return {"ok": True, "output": output}


@app.delete("/api/sandboxes/{sandbox_id}/crons/{job_id}")
async def delete_cron(sandbox_id: str, job_id: str):
    """Remove a cron job via openclaw cron rm."""
    _get_record(sandbox_id)
    exit_code, output = await _sandbox_exec(
        sandbox_id, f"openclaw cron rm {job_id} 2>&1", timeout=20
    )
    if exit_code != 0:
        raise HTTPException(status_code=502, detail=f"openclaw cron rm failed: {output[:300]}")
    return {"deleted": job_id}


@app.post("/api/sandboxes/{sandbox_id}/crons/{job_id}/toggle")
async def toggle_cron(sandbox_id: str, job_id: str):
    """Enable or disable a cron job. Reads current state first, then flips it."""
    _get_record(sandbox_id)

    # Read current state
    exit_code, output = await _sandbox_exec(
        sandbox_id, "openclaw cron list --json 2>&1", timeout=20
    )
    if exit_code != 0:
        raise HTTPException(status_code=502, detail=f"cron list failed: {output[:300]}")
    try:
        data = _parse_json_output(output)
        jobs = data.get("jobs", [])
        job = next((j for j in jobs if j.get("id") == job_id), None)
    except (ValueError, json.JSONDecodeError) as e:
        raise HTTPException(status_code=502, detail=str(e))

    if job is None:
        raise HTTPException(status_code=404, detail="Cron job not found")

    currently_enabled = job.get("enabled", True)
    subcmd = "disable" if currently_enabled else "enable"
    exit_code2, output2 = await _sandbox_exec(
        sandbox_id, f"openclaw cron {subcmd} {job_id} 2>&1", timeout=20
    )
    if exit_code2 != 0:
        raise HTTPException(status_code=502, detail=f"cron {subcmd} failed: {output2[:300]}")
    return {"jobId": job_id, "enabled": not currently_enabled}


class UpdateCronRequest(BaseModel):
    name: str | None = None
    schedule: dict[str, Any] | None = None   # { kind, expr/at/everyMs, tz? }
    payload: dict[str, Any] | None = None    # { kind, text/message }
    session_target: str | None = None        # main | isolated
    wake_mode: str | None = None             # now | next-heartbeat
    description: str | None = None


@app.patch("/api/sandboxes/{sandbox_id}/crons/{job_id}")
async def update_cron(sandbox_id: str, job_id: str, req: UpdateCronRequest):
    """Patch a cron job via openclaw cron edit inside the sandbox."""
    _get_record(sandbox_id)

    cmd_parts = [f"openclaw cron edit {job_id}"]

    if req.name is not None:
        cmd_parts.append(f"--name {json.dumps(req.name)}")

    if req.schedule is not None:
        kind = req.schedule.get("kind", "cron")
        if kind == "cron":
            cmd_parts.append(f"--cron {json.dumps(req.schedule.get('expr', '0 9 * * *'))}")
            tz = req.schedule.get("tz", "")
            if tz:
                cmd_parts.append(f"--tz {json.dumps(tz)}")
        elif kind == "every":
            every_ms = int(req.schedule.get("everyMs", 1800000))
            cmd_parts.append(f"--every {every_ms // 60000}m")
        elif kind == "at":
            cmd_parts.append(f"--at {json.dumps(req.schedule.get('at', ''))}")

    if req.payload is not None:
        payload_kind = req.payload.get("kind", "agentTurn")
        if payload_kind == "systemEvent":
            cmd_parts.append(f"--system-event {json.dumps(req.payload.get('text', ''))}")
        else:
            msg = req.payload.get("message") or req.payload.get("text", "")
            cmd_parts.append(f"--message {json.dumps(msg)}")

    if req.session_target is not None:
        cmd_parts.append(f"--session {req.session_target}")

    if req.wake_mode is not None:
        cmd_parts.append(f"--wake {req.wake_mode}")

    if req.description is not None:
        cmd_parts.append(f"--description {json.dumps(req.description)}")

    cmd = " ".join(cmd_parts) + " 2>&1"
    exit_code, output = await _sandbox_exec(sandbox_id, cmd, timeout=30)
    if exit_code != 0:
        raise HTTPException(status_code=502, detail=f"openclaw cron edit failed: {output[:400]}")
    return {"ok": True, "jobId": job_id}


@app.post("/api/sandboxes/{sandbox_id}/crons/{job_id}/run")
async def trigger_cron(sandbox_id: str, job_id: str):
    """Manually trigger a cron job immediately."""
    _get_record(sandbox_id)
    exit_code, output = await _sandbox_exec(
        sandbox_id, f"openclaw cron run {job_id} 2>&1", timeout=60
    )
    if exit_code != 0:
        raise HTTPException(status_code=502, detail=f"openclaw cron run failed: {output[:300]}")
    return {"ok": True, "jobId": job_id}


@app.get("/api/sandboxes/{sandbox_id}/crons/{job_id}/runs")
async def get_cron_runs(sandbox_id: str, job_id: str, limit: int = 50):
    """Fetch run history for a specific cron job."""
    _get_record(sandbox_id)
    exit_code, output = await _sandbox_exec(
        sandbox_id,
        f"openclaw cron runs --id {job_id} --limit {limit} 2>&1",
        timeout=20,
    )
    if exit_code != 0:
        raise HTTPException(status_code=502, detail=f"openclaw cron runs failed: {output[:300]}")
    try:
        return _parse_json_output(output)
    except (ValueError, json.JSONDecodeError) as e:
        raise HTTPException(status_code=502, detail=f"Failed to parse runs output: {e}")


# ── Channel configuration ──────────────────────────────────────────────────────

class TelegramChannelRequest(BaseModel):
    enabled: bool | None = None
    botToken: str | None = None           # omit or empty → keep existing token
    dmPolicy: str | None = None           # pairing | allowlist | open | disabled


class SlackChannelRequest(BaseModel):
    enabled: bool | None = None
    mode: str | None = None               # socket | http
    appToken: str | None = None           # xapp-...
    botToken: str | None = None           # xoxb-...
    signingSecret: str | None = None
    dmPolicy: str | None = None           # pairing | allowlist | open | disabled


@app.get("/api/sandboxes/{sandbox_id}/channels")
async def get_channels(sandbox_id: str):
    """Return masked channel config (Telegram + Slack) for this sandbox."""
    _get_record(sandbox_id)
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None, channel_manager.get_channels_config, _daytona_api_key(), sandbox_id
    )


@app.put("/api/sandboxes/{sandbox_id}/channels/telegram")
async def configure_telegram(sandbox_id: str, req: TelegramChannelRequest):
    """Apply Telegram channel settings and restart the gateway."""
    _get_record(sandbox_id)
    loop = asyncio.get_event_loop()
    cfg = req.model_dump(exclude_none=True)
    return await loop.run_in_executor(
        None, channel_manager.set_telegram_config, _daytona_api_key(), sandbox_id, cfg
    )


@app.put("/api/sandboxes/{sandbox_id}/channels/slack")
async def configure_slack(sandbox_id: str, req: SlackChannelRequest):
    """Apply Slack channel settings and restart the gateway."""
    _get_record(sandbox_id)
    loop = asyncio.get_event_loop()
    cfg = req.model_dump(exclude_none=True)
    return await loop.run_in_executor(
        None, channel_manager.set_slack_config, _daytona_api_key(), sandbox_id, cfg
    )


@app.get("/api/sandboxes/{sandbox_id}/channels/{channel}/status")
async def get_channel_status(sandbox_id: str, channel: str):
    """Probe channel connectivity via `openclaw channels status --probe`."""
    if channel not in ("telegram", "slack"):
        raise HTTPException(status_code=400, detail="channel must be 'telegram' or 'slack'")
    _get_record(sandbox_id)
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None, channel_manager.probe_channel_status, _daytona_api_key(), sandbox_id, channel
    )


# ── Pairing ────────────────────────────────────────────────────────────────────

class ApprovePairingRequest(BaseModel):
    code: str


@app.get("/api/sandboxes/{sandbox_id}/channels/{channel}/pairing")
async def list_pairing(sandbox_id: str, channel: str):
    """List pending pairing requests via `openclaw pairing list <channel>`."""
    if channel not in ("telegram", "slack"):
        raise HTTPException(status_code=400, detail="channel must be 'telegram' or 'slack'")
    _get_record(sandbox_id)
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None, channel_manager.list_pairing_requests, _daytona_api_key(), sandbox_id, channel
    )


@app.post("/api/sandboxes/{sandbox_id}/channels/{channel}/pairing/approve")
async def approve_pairing(sandbox_id: str, channel: str, req: ApprovePairingRequest):
    """Approve a pairing request via `openclaw pairing approve <channel> <code>`."""
    if channel not in ("telegram", "slack"):
        raise HTTPException(status_code=400, detail="channel must be 'telegram' or 'slack'")
    _get_record(sandbox_id)
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None, channel_manager.approve_pairing, _daytona_api_key(), sandbox_id, channel, req.code
    )
    if not result["ok"]:
        raise HTTPException(status_code=400, detail=result.get("output", "Approval failed"))
    return result


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
