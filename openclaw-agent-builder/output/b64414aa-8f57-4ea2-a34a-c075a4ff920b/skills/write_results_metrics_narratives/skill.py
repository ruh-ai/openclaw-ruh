#!/usr/bin/env python3
"""write_results_metrics_narratives

Builds batch upsert items for:
- result_metrics
- result_narratives

Emits:
  { aggregated_results: [...] }
so the workflow can end with a terminal data-ingestion-openclaw batch_write step.

Can also write directly when run manually.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any, Dict, List, Optional

# Ensure `src/` is importable when executed as a script.
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from src.common.ingestion_client import IngestionClient, build_upsert_item


def _load_json(path: Optional[str]) -> Dict[str, Any]:
    if path:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return json.load(sys.stdin)


def main(argv: List[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--run-id", required=True)
    ap.add_argument("--input", help="Path to JSON output from compute_sprint_metrics (defaults to stdin)")
    ap.add_argument(
        "--metrics-json",
        help="JSON array string for result_metrics_rows (workflow-friendly). If set, overrides --input/stdin.",
    )
    ap.add_argument(
        "--narratives-json",
        help="JSON array string for result_narratives_rows (workflow-friendly). If set, overrides --input/stdin.",
    )
    ap.add_argument("--write", action="store_true", help="Write directly to ingestion service (/data/write/batch)")
    args = ap.parse_args(argv)

    if args.metrics_json is not None or args.narratives_json is not None:
        metrics_rows = json.loads(args.metrics_json or "[]")
        narratives_rows = json.loads(args.narratives_json or "[]")
    else:
        payload = _load_json(args.input)
        metrics_rows = payload.get("result_metrics_rows") or []
        narratives_rows = payload.get("result_narratives_rows") or []

    # Ensure rows are lists of dicts
    metrics_rows = [r for r in metrics_rows if isinstance(r, dict)]
    narratives_rows = [r for r in narratives_rows if isinstance(r, dict)]

    items: List[Dict[str, Any]] = []

    # Upsert keys: `id` is a deterministic hash built in compute step.
    if metrics_rows:
        items.append(build_upsert_item(schema_type="agent", table="result_metrics", rows=metrics_rows, conflict_keys=["id"]))
    if narratives_rows:
        items.append(build_upsert_item(schema_type="agent", table="result_narratives", rows=narratives_rows, conflict_keys=["id"]))

    out = {
        "run_id": args.run_id,
        "aggregated_results": items,
        "counts": {"result_metrics": len(metrics_rows), "result_narratives": len(narratives_rows)},
    }

    if args.write:
        client = IngestionClient.from_env()
        if not client.base_url:
            out["warning"] = "Missing DATA_INGESTION_BASE_URL; not writing."
            print(json.dumps(out, indent=2))
            return 0
        try:
            resp = client.write_batch(run_id=args.run_id, items=items, atomic=True)
            out["write_response"] = resp
        except Exception as e:
            out["write_error"] = str(e)

    print(json.dumps(out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
