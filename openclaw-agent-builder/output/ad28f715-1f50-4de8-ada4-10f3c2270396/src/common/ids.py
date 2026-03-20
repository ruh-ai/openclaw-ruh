#!/usr/bin/env python3
"""Deterministic ID helpers."""

from __future__ import annotations

import hashlib
from typing import Any, Dict


def stable_json(obj: Any) -> str:
    import json

    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def det_id(prefix: str, parts: Dict[str, Any]) -> str:
    """Deterministic id: <prefix>_<sha1> of stable JSON parts."""
    raw = stable_json(parts).encode("utf-8")
    h = hashlib.sha1(raw).hexdigest()
    return f"{prefix}_{h}"
