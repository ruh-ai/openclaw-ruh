#!/usr/bin/env python3
"""developer_identity_mapping

Best-effort: reads existing mappings and optionally seeds `entity_developer_mapping`.

This is intentionally lightweight: many deployments manage mappings externally.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any, Dict, List, Optional

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from src.common.ingestion_client import IngestionClient, build_upsert_item
from src.common.timeutil import utc_now_iso


def _load_seed(seed_json: Optional[str]) -> List[Dict[str, Any]]:
    raw = seed_json or os.environ.get("DEV_MAPPING_JSON") or ""
    if not raw.strip():
        return []
    try:
        data = json.loads(raw)
    except Exception as e:
        raise ValueError(f"Invalid seed JSON: {e}")
    if not isinstance(data, list):
        return []
    out: List[Dict[str, Any]] = []
    for r in data:
        if not isinstance(r, dict):
            continue
        email = (r.get("email") or "").strip().lower()
        if not email:
            continue
        out.append(
            {
                "email": email,
                "jira_username": (r.get("jira_username") or "").strip() or None,
                "github_username": (r.get("github_username") or "").strip() or None,
                "display_name": (r.get("display_name") or "").strip() or None,
                "updated_at": utc_now_iso(),
            }
        )
    return out


def main(argv: List[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--run-id", required=True)
    ap.add_argument("--seed-json", help="JSON array of mapping rows (overrides DEV_MAPPING_JSON env var)")
    ap.add_argument("--write", action="store_true", help="Write seed rows to ingestion")
    args = ap.parse_args(argv)

    client = IngestionClient.from_env()

    result: Dict[str, Any] = {
        "run_id": args.run_id,
        "timestamp": utc_now_iso(),
        "existing_count": 0,
        "seed_count": 0,
        "wrote": False,
        "warnings": [],
    }

    if not client.base_url:
        result["warnings"].append("Missing DATA_INGESTION_BASE_URL; no-op.")
        print(json.dumps(result))
        return 0

    # Best-effort read.
    try:
        existing = client.query(schema_type="agent", table="entity_developer_mapping", limit=10000)
        result["existing_count"] = len(existing)
    except Exception as e:
        result["warnings"].append(f"Could not query entity_developer_mapping: {e}")

    seed_rows = _load_seed(args.seed_json)
    result["seed_count"] = len(seed_rows)

    if args.write and seed_rows:
        items = [build_upsert_item(schema_type="agent", table="entity_developer_mapping", rows=seed_rows, conflict_keys=["email"])]
        try:
            resp = client.write_batch(run_id=args.run_id, items=items, atomic=True)
            result["wrote"] = True
            result["write_response"] = resp
        except Exception as e:
            result["warnings"].append(f"Write failed: {e}")

    print(json.dumps(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
