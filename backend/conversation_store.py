"""
Persistent conversation store — two-file design.

  data/conversations.json   — metadata dict keyed by conversation_id
  data/messages/<id>.json   — flat array of messages for each conversation

Conversation record shape:
  {
    "id":                   "<uuid>",
    "sandbox_id":           "<daytona-sandbox-id>",
    "name":                 "How to install Python",
    "model":                "openclaw-default",
    "openclaw_session_key": "agent:main:<uuid>",   ← passed to gateway as x-openclaw-session-key
    "created_at":           "<iso>",
    "updated_at":           "<iso>",
    "message_count":        6
  }

Message shape (stored in messages/<id>.json):
  [ {"role": "user"|"assistant", "content": "..."}, ... ]
"""

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_DATA_DIR = Path(__file__).parent / "data"
_DATA_DIR.mkdir(exist_ok=True)

_CONV_FILE = _DATA_DIR / "conversations.json"
_MSG_DIR = _DATA_DIR / "messages"
_MSG_DIR.mkdir(exist_ok=True)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── conversations.json helpers ────────────────────────────────────────────────

def _read_all() -> dict[str, Any]:
    if not _CONV_FILE.exists():
        return {}
    try:
        return json.loads(_CONV_FILE.read_text())
    except (json.JSONDecodeError, OSError):
        return {}


def _write_all(data: dict[str, Any]) -> None:
    _CONV_FILE.write_text(json.dumps(data, indent=2))


# ── messages/<id>.json helpers ────────────────────────────────────────────────

def _msg_path(conv_id: str) -> Path:
    return _MSG_DIR / f"{conv_id}.json"


def _read_messages(conv_id: str) -> list[dict[str, Any]]:
    p = _msg_path(conv_id)
    if not p.exists():
        return []
    try:
        return json.loads(p.read_text())
    except (json.JSONDecodeError, OSError):
        return []


def _write_messages(conv_id: str, messages: list[dict[str, Any]]) -> None:
    _msg_path(conv_id).write_text(json.dumps(messages, indent=2))


# ── Public API ────────────────────────────────────────────────────────────────

def create_conversation(
    sandbox_id: str,
    model: str = "openclaw-default",
    name: str = "New Conversation",
) -> dict[str, Any]:
    conv_id = str(uuid.uuid4())
    now = _now()
    record: dict[str, Any] = {
        "id": conv_id,
        "sandbox_id": sandbox_id,
        "name": name,
        "model": model,
        # Explicit OpenClaw session key — passed as x-openclaw-session-key header
        # and as the `user` field so the gateway routes to/creates this session.
        "openclaw_session_key": f"agent:main:{conv_id}",
        "created_at": now,
        "updated_at": now,
        "message_count": 0,
    }
    store = _read_all()
    store[conv_id] = record
    _write_all(store)
    # Create empty messages file
    _write_messages(conv_id, [])
    return record


def list_conversations(sandbox_id: str) -> list[dict[str, Any]]:
    """Return all conversations for a sandbox, newest first (no messages)."""
    store = _read_all()
    results = [c for c in store.values() if c.get("sandbox_id") == sandbox_id]
    return sorted(results, key=lambda c: c.get("updated_at", ""), reverse=True)


def get_conversation(conv_id: str) -> dict[str, Any] | None:
    return _read_all().get(conv_id)


def get_messages(conv_id: str) -> list[dict[str, Any]]:
    return _read_messages(conv_id)


def append_messages(conv_id: str, messages: list[dict[str, Any]]) -> bool:
    """Append messages and update metadata. Returns False if conversation not found."""
    store = _read_all()
    if conv_id not in store:
        return False
    existing = _read_messages(conv_id)
    existing.extend(messages)
    _write_messages(conv_id, existing)
    store[conv_id]["message_count"] = len(existing)
    store[conv_id]["updated_at"] = _now()
    _write_all(store)
    return True


def rename_conversation(conv_id: str, name: str) -> bool:
    store = _read_all()
    if conv_id not in store:
        return False
    store[conv_id]["name"] = name
    store[conv_id]["updated_at"] = _now()
    _write_all(store)
    return True


def delete_conversation(conv_id: str) -> bool:
    store = _read_all()
    if conv_id not in store:
        return False
    del store[conv_id]
    _write_all(store)
    p = _msg_path(conv_id)
    if p.exists():
        p.unlink()
    return True
