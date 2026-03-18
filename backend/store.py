"""
Persistent JSON store for OpenClaw sandbox records.
Writes to data/sandboxes.json by default.
"""

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

STORE_PATH = Path(os.getenv("SANDBOXES_FILE", Path(__file__).parent / "data" / "sandboxes.json"))


def _read() -> dict[str, Any]:
    if not STORE_PATH.exists():
        return {}
    try:
        return json.loads(STORE_PATH.read_text())
    except (json.JSONDecodeError, OSError):
        return {}


def _write(data: dict[str, Any]) -> None:
    STORE_PATH.write_text(json.dumps(data, indent=2))


def save_sandbox(result: dict[str, Any], sandbox_name: str = "") -> None:
    """Upsert a sandbox record keyed by sandbox_id."""
    store = _read()
    sandbox_id = result["sandbox_id"]
    existing = store.get(sandbox_id, {})

    store[sandbox_id] = {
        **existing,
        "sandbox_id": sandbox_id,
        "sandbox_name": sandbox_name or result.get("sandbox_name", "openclaw-gateway"),
        "sandbox_state": result.get("sandbox_state", ""),
        "dashboard_url": result.get("dashboard_url"),
        "signed_url": result.get("signed_url"),
        "standard_url": result.get("standard_url"),
        "preview_token": result.get("preview_token"),
        "gateway_token": result.get("gateway_token"),
        "gateway_port": result.get("gateway_port", 18789),
        "ssh_command": result.get("ssh_command", ""),
        "created_at": existing.get("created_at") or datetime.now(timezone.utc).isoformat(),
        "approved": existing.get("approved", False),
    }
    _write(store)


def mark_approved(sandbox_id: str) -> None:
    store = _read()
    if sandbox_id in store:
        store[sandbox_id]["approved"] = True
        _write(store)


def list_sandboxes() -> list[dict[str, Any]]:
    store = _read()
    return sorted(store.values(), key=lambda s: s.get("created_at", ""), reverse=True)


def delete_sandbox(sandbox_id: str) -> bool:
    store = _read()
    if sandbox_id not in store:
        return False
    del store[sandbox_id]
    _write(store)
    return True


def get_sandbox(sandbox_id: str) -> dict[str, Any] | None:
    return _read().get(sandbox_id)
