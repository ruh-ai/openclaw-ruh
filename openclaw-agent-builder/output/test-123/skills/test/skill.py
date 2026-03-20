#!/usr/bin/env python3
"""test skill - minimal executable.

This is a scaffold meant for generated systems. It demonstrates the required
"data-ingestion-openclaw" integration patterns:
- upsert writes
- include run_id in writes

It can be used standalone:
  python3 skill.py --run-id <run_id> [--message "hello"]

Or as a reference for how the OpenClaw/Lobster step could be implemented.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.request


def _env(name: str, default: str | None = None) -> str | None:
    v = os.environ.get(name)
    return v if v not in (None, "") else default


def build_batch_items(*, org_id: str, agent_id: str, run_id: str, message: str) -> list[dict]:
    """Return items compatible with POST /data/write/batch."""
    now_ms = int(time.time() * 1000)
    # Agent-owned result table (read-write)
    return [
        {
            "schema_type": "agent",
            "table": "result_test_runs",
            "operation": "upsert",
            "rows": [
                {
                    "organisation_id": org_id,
                    "agent_id": agent_id,
                    "run_id": run_id,
                    "ts_ms": now_ms,
                    "message": message,
                    "status": "ok",
                }
            ],
            # A conventional upsert key set; ingestion service may ignore/override.
            "conflict_keys": ["organisation_id", "agent_id", "run_id"],
        }
    ]


def post_json(url: str, payload: dict, token: str | None = None) -> dict:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(req, timeout=30) as resp:
        body = resp.read().decode("utf-8")
    try:
        return json.loads(body)
    except json.JSONDecodeError:
        return {"raw": body}


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--run-id", required=True)
    ap.add_argument("--message", default="test skill executed")
    ap.add_argument("--write", action="store_true", help="Actually call the ingestion service /data/write/batch")
    args = ap.parse_args(argv)

    base_url = _env("DATA_INGESTION_BASE_URL")
    org_id = _env("DATA_INGESTION_ORG_ID", "")
    agent_id = _env("DATA_INGESTION_AGENT_ID", "")
    token = _env("DATA_INGESTION_TOKEN")

    items = build_batch_items(org_id=org_id or "", agent_id=agent_id or "", run_id=args.run_id, message=args.message)

    # This is the shape expected by the Lobster workflow's write_results step.
    output = {
        "aggregated_results": items,
        "run_id": args.run_id,
    }

    if args.write:
        if not (base_url and org_id and agent_id):
            print(
                json.dumps(
                    {
                        "warning": "Missing DATA_INGESTION_* env; not writing. Printing payload instead.",
                        **output,
                    },
                    indent=2,
                )
            )
            return 0
        url = base_url.rstrip("/") + "/data/write/batch"
        resp = post_json(
            url,
            {
                "organisation_id": org_id,
                "agent_id": agent_id,
                "run_id": args.run_id,
                "items": items,
                "atomic": True,
            },
            token=token,
        )
        print(json.dumps({"write_response": resp, **output}, indent=2))
        return 0

    # Default: emit JSON to stdout for workflow wiring.
    print(json.dumps(output))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
