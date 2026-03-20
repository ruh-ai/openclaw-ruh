#!/usr/bin/env python3
"""daily_orchestrator_report

Aggregates `result_developer_scores` for the day and produces a narrative suitable for Telegram.
Writes `result_narratives` (and basic rollup metrics) via ingestion batch_write.

Assumes UTC.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections import defaultdict
from datetime import datetime
from typing import Any, DefaultDict, Dict, List, Optional, Tuple

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from src.common.ids import det_id
from src.common.ingestion_client import IngestionClient, build_upsert_item
from src.common.timeutil import utc_now_iso, utc_today


def _parse_date(s: Optional[str]) -> str:
    if not s:
        return utc_today()
    datetime.strptime(s, "%Y-%m-%d")
    return s


def _fmt_row(name: str, score: float, by_source: Dict[str, float]) -> str:
    parts = []
    for src in sorted(by_source.keys()):
        parts.append(f"{src}:{by_source[src]:.2f}")
    return f"- {name}: {score:.2f} ({', '.join(parts)})"


def main(argv: List[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--run-id", required=True)
    ap.add_argument("--date", help="YYYY-MM-DD (UTC), defaults to today")
    ap.add_argument("--no-write", action="store_true", help="Disable ingestion write (default: write)")
    args = ap.parse_args(argv)

    date = _parse_date(args.date)
    client = IngestionClient.from_env()

    out: Dict[str, Any] = {"run_id": args.run_id, "date": date, "timestamp": utc_now_iso(), "warnings": []}

    if not client.base_url:
        out["warnings"].append("Missing DATA_INGESTION_BASE_URL; no-op.")
        out["telegram_message"] = f"Daily dev report ({date} UTC)\n\n(no ingestion configured)"
        out["result_narratives_rows"] = []
        out["result_metrics_rows"] = []
        print(json.dumps(out))
        return 0

    # Load developer display names
    display_by_email: Dict[str, str] = {}
    try:
        mapping = client.query(schema_type="agent", table="entity_developer_mapping", limit=10000)
        for r in mapping:
            if not isinstance(r, dict):
                continue
            email = (r.get("email") or "").strip().lower()
            if not email:
                continue
            dn = (r.get("display_name") or "").strip()
            if dn:
                display_by_email[email] = dn
    except Exception as e:
        out["warnings"].append(f"Could not read entity_developer_mapping: {e}")

    # Read scores
    scores: List[Dict[str, Any]] = []
    try:
        scores = client.query(schema_type="agent", table="result_developer_scores", filters={"date": date}, limit=20000)
    except Exception as e:
        out["warnings"].append(f"Could not read result_developer_scores for date={date}: {e}")

    by_email_source: DefaultDict[str, DefaultDict[str, float]] = defaultdict(lambda: defaultdict(float))
    for r in scores:
        if not isinstance(r, dict):
            continue
        email = (r.get("email") or "").strip().lower()
        src = (r.get("source") or "").strip().lower() or "unknown"
        try:
            s = float(r.get("score") or 0)
        except Exception:
            s = 0.0
        if email:
            by_email_source[email][src] += s

    total_by_email: Dict[str, float] = {e: sum(srcs.values()) for e, srcs in by_email_source.items()}
    ranked: List[Tuple[str, float]] = sorted(total_by_email.items(), key=lambda t: (-t[1], t[0]))

    top_lines: List[str] = []
    for email, score in ranked[:10]:
        name = display_by_email.get(email) or email
        top_lines.append(_fmt_row(name, score, dict(by_email_source[email])))

    total_score = sum(total_by_email.values())
    active_devs = sum(1 for _e, s in total_by_email.items() if s > 0)

    msg_lines = [
        f"Daily dev report ({date} UTC)",
        "",
        f"Total score: {total_score:.2f}",
        f"Active devs: {active_devs}",
        "",
        "Top developers:",
    ]
    if top_lines:
        msg_lines.extend(top_lines)
    else:
        msg_lines.append("- (no scores found for this date)")

    telegram_message = "\n".join(msg_lines)

    narratives_rows = [
        {
            "id": det_id("narr", {"date": date, "kind": "daily_orchestrator"}),
            "run_id": args.run_id,
            "date": date,
            "title": f"Daily dev report ({date} UTC)",
            "narrative": telegram_message,
            "created_at": utc_now_iso(),
        }
    ]

    metrics_rows = [
        {
            "id": det_id("metric", {"date": date, "name": "daily_total_score"}),
            "run_id": args.run_id,
            "date": date,
            "metric_name": "daily_total_score",
            "metric_value": round(float(total_score), 4),
            "source": "orchestrator",
            "created_at": utc_now_iso(),
        },
        {
            "id": det_id("metric", {"date": date, "name": "daily_active_developers"}),
            "run_id": args.run_id,
            "date": date,
            "metric_name": "daily_active_developers",
            "metric_value": int(active_devs),
            "source": "orchestrator",
            "created_at": utc_now_iso(),
        },
    ]

    out["telegram_message"] = telegram_message
    out["result_narratives_rows"] = narratives_rows
    out["result_metrics_rows"] = metrics_rows

    # Pre-build items (also useful for debugging)
    items = [
        build_upsert_item(schema_type="agent", table="result_narratives", rows=narratives_rows, conflict_keys=["id"]),
        build_upsert_item(schema_type="agent", table="result_metrics", rows=metrics_rows, conflict_keys=["id"]),
    ]
    out["aggregated_results"] = items

    # In the orchestrator workflow we want the narrative persisted even without an explicit batch_write step.
    do_write = not args.no_write
    if do_write:
        try:
            resp = client.write_batch(run_id=args.run_id, items=items, atomic=True)
            out["wrote"] = True
            out["write_response"] = resp
        except Exception as e:
            out["warnings"].append(f"Write failed: {e}")

    print(json.dumps(out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
