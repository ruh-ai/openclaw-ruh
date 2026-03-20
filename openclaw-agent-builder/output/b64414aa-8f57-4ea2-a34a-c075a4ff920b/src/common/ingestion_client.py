#!/usr/bin/env python3
"""Thin client for the aget-data-ingestion service.

This keeps custom skills runnable even if the exact adapter/table names differ.

Env vars:
- DATA_INGESTION_BASE_URL
- DATA_INGESTION_ORG_ID
- DATA_INGESTION_AGENT_ID
- DATA_INGESTION_TOKEN (optional)

Key endpoints (per data-ingestion-openclaw SKILL.md):
- POST /data/query
- POST /data/query/aggregate
- POST /data/write
- POST /data/write/batch
- POST /admin/schema/provision/agent
- POST /ingestion/trigger
- GET  /ingestion/jobs/{job_id}
"""

from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional

import requests


def _env(name: str, default: Optional[str] = None) -> Optional[str]:
    v = os.environ.get(name)
    return v if v not in (None, "") else default


@dataclass
class IngestionClient:
    base_url: str
    organisation_id: str
    agent_id: str
    token: Optional[str] = None
    timeout_s: int = 60

    @staticmethod
    def from_env() -> "IngestionClient":
        base_url = _env("DATA_INGESTION_BASE_URL") or ""
        org_id = _env("DATA_INGESTION_ORG_ID") or ""
        agent_id = _env("DATA_INGESTION_AGENT_ID") or ""
        token = _env("DATA_INGESTION_TOKEN")
        return IngestionClient(base_url=base_url.rstrip("/"), organisation_id=org_id, agent_id=agent_id, token=token)

    def _headers(self) -> Dict[str, str]:
        h = {"Content-Type": "application/json"}
        if self.token:
            h["Authorization"] = f"Bearer {self.token}"
        return h

    def _post(self, path: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        url = self.base_url + path
        resp = requests.post(url, headers=self._headers(), data=json.dumps(payload), timeout=self.timeout_s)
        # Keep error bodies for easier debugging.
        if resp.status_code >= 400:
            raise RuntimeError(f"POST {path} -> {resp.status_code}: {resp.text[:1000]}")
        try:
            return resp.json()
        except Exception:
            return {"raw": resp.text}

    def _get(self, path: str) -> Dict[str, Any]:
        url = self.base_url + path
        resp = requests.get(url, headers=self._headers(), timeout=self.timeout_s)
        if resp.status_code >= 400:
            raise RuntimeError(f"GET {path} -> {resp.status_code}: {resp.text[:1000]}")
        try:
            return resp.json()
        except Exception:
            return {"raw": resp.text}

    # ------------ schema ------------

    def provision_agent_schema(self) -> Dict[str, Any]:
        return self._post(
            "/admin/schema/provision/agent",
            {"organisation_id": self.organisation_id, "agent_id": self.agent_id},
        )

    # ------------ ingestion ------------

    def trigger_ingestion(self, *, connector_type: str, entities: List[str], scope: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        payload: Dict[str, Any] = {
            "organisation_id": self.organisation_id,
            "agent_id": self.agent_id,
            "connector_type": connector_type,
            "entities": entities,
        }
        if scope is not None:
            payload["scope"] = scope
        return self._post("/ingestion/trigger", payload)

    def poll_job(self, job_id: str, *, timeout_s: int = 300, poll_interval_s: int = 5) -> Dict[str, Any]:
        deadline = time.time() + timeout_s
        last: Dict[str, Any] = {}
        while time.time() < deadline:
            last = self._get(f"/ingestion/jobs/{job_id}")
            status = (last.get("status") or "").lower()
            if status in ("completed", "succeeded", "success", "done"):
                return last
            if status in ("failed", "error"):
                return last
            time.sleep(poll_interval_s)
        last["warning"] = "poll timeout"
        return last

    # ------------ query/write ------------

    def query(self, *, schema_type: str, table: str, filters: Optional[Dict[str, Any]] = None, limit: int = 10000) -> List[Dict[str, Any]]:
        payload: Dict[str, Any] = {
            "organisation_id": self.organisation_id,
            "agent_id": self.agent_id,
            "schema_type": schema_type,
            "table": table,
            "filters": filters or {},
            "limit": limit,
        }
        out = self._post("/data/query", payload)
        # Common response shapes: {rows:[...]}, {data:[...]}, or just list
        if isinstance(out, dict):
            for k in ("rows", "data", "items"):
                v = out.get(k)
                if isinstance(v, list):
                    return v
        if isinstance(out, list):
            return out
        return []

    def write_batch(self, *, run_id: str, items: List[Dict[str, Any]], atomic: bool = True) -> Dict[str, Any]:
        payload: Dict[str, Any] = {
            "organisation_id": self.organisation_id,
            "agent_id": self.agent_id,
            "run_id": run_id,
            "items": items,
            "atomic": atomic,
        }
        return self._post("/data/write/batch", payload)


def build_upsert_item(
    *,
    schema_type: str,
    table: str,
    rows: List[Dict[str, Any]],
    conflict_keys: Optional[List[str]] = None,
) -> Dict[str, Any]:
    item: Dict[str, Any] = {
        "schema_type": schema_type,
        "table": table,
        "operation": "upsert",
        "rows": rows,
    }
    if conflict_keys:
        item["conflict_keys"] = conflict_keys
    return item
