#!/usr/bin/env python3
"""github_scoring_agent

Best-effort GitHub scoring based on ingested pull requests.

TODO: adapt table/field names to the actual GitHub connector in your ingestion service.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any, DefaultDict, Dict, List, Optional

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from src.common.ids import det_id
from src.common.ingestion_client import IngestionClient, build_upsert_item
from src.common.timeutil import utc_now_iso, utc_today


def _parse_date(s: Optional[str]) -> str:
    if not s:
        return utc_today()
    datetime.strptime(s, "%Y-%m-%d")
    return s


def _pick(d: Dict[str, Any], keys: List[str]) -> Any:
    for k in keys:
        if k in d and d.get(k) not in (None, ""):
            return d.get(k)
    return None


def _ts_day(v: Any) -> Optional[str]:
    if not v:
        return None
    try:
        dt = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
        return dt.astimezone(timezone.utc).date().isoformat()
    except Exception:
        return None


def main(argv: List[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--run-id", required=True)
    ap.add_argument("--date", help="YYYY-MM-DD (UTC), defaults to today")
    args = ap.parse_args(argv)

    date = _parse_date(args.date)
    client = IngestionClient.from_env()

    out: Dict[str, Any] = {"run_id": args.run_id, "date": date, "timestamp": utc_now_iso(), "warnings": []}

    if not client.base_url:
        out["warnings"].append("Missing DATA_INGESTION_BASE_URL; no-op.")
        out["result_developer_scores_rows"] = []
        out["result_metrics_rows"] = []
        out["aggregated_results"] = []
        print(json.dumps(out))
        return 0

    # Load mapping
    mapping_rows: List[Dict[str, Any]] = []
    try:
        mapping_rows = client.query(schema_type="agent", table="entity_developer_mapping", limit=10000)
    except Exception as e:
        out["warnings"].append(f"Could not read entity_developer_mapping: {e}")

    email_by_gh: Dict[str, str] = {}
    all_emails: List[str] = []
    display_by_email: Dict[str, str] = {}
    for r in mapping_rows:
        if not isinstance(r, dict):
            continue
        email = (r.get("email") or "").strip().lower()
        if not email:
            continue
        all_emails.append(email)
        if r.get("display_name"):
            display_by_email[email] = str(r.get("display_name"))
        gh = (r.get("github_username") or "").strip().lower()
        if gh:
            email_by_gh[gh] = email

    prs: List[Dict[str, Any]] = []
    read_table = None
    gh_tables_to_try = ["github_pull_request", "github_pull_requests", "pull_request", "pull_requests"]
    for t in gh_tables_to_try:
        try:
            prs = client.query(schema_type="agent", table=t, limit=20000)
            read_table = t
            break
        except Exception:
            continue

    if read_table is None:
        out["warnings"].append(
            "No GitHub PR table found (tried github_pull_request/github_pull_requests/pull_request). "
            "TODO: update table names/connector or add an ingestion sync step. Emitting zero scores."
        )

    score_by_email: DefaultDict[str, float] = defaultdict(float)
    merged_by_email: DefaultDict[str, int] = defaultdict(int)
    opened_by_email: DefaultDict[str, int] = defaultdict(int)

    for pr in prs or []:
        if not isinstance(pr, dict):
            continue

        # consider PR activity day based on merged_at else updated_at else created_at
        day = _ts_day(_pick(pr, ["merged_at", "mergedAt"])) or _ts_day(_pick(pr, ["updated_at", "updatedAt"])) or _ts_day(
            _pick(pr, ["created_at", "createdAt"])
        )
        if day != date:
            continue

        author_login = _pick(pr, ["author_login", "user_login", "login", "author", "authorLogin"])
        if not author_login:
            continue

        email = email_by_gh.get(str(author_login).strip().lower())
        if not email:
            continue

        opened_by_email[email] += 1

        merged_at = _pick(pr, ["merged_at", "mergedAt"])
        is_merged = bool(merged_at)
        if is_merged:
            merged_by_email[email] += 1
            score_by_email[email] += 3.0
        else:
            score_by_email[email] += 1.0

    for email in all_emails:
        score_by_email[email] += 0.0

    rows_scores: List[Dict[str, Any]] = []
    for email, score in sorted(score_by_email.items()):
        rows_scores.append(
            {
                "id": det_id("dev_score", {"date": date, "source": "github", "email": email}),
                "run_id": args.run_id,
                "date": date,
                "source": "github",
                "email": email,
                "display_name": display_by_email.get(email),
                "score": round(float(score), 4),
                "details_json": json.dumps(
                    {"read_table": read_table, "prs_opened": opened_by_email.get(email, 0), "prs_merged": merged_by_email.get(email, 0)},
                    sort_keys=True,
                ),
                "created_at": utc_now_iso(),
            }
        )

    metrics_rows: List[Dict[str, Any]] = [
        {
            "id": det_id("metric", {"date": date, "name": "github_total_score"}),
            "run_id": args.run_id,
            "date": date,
            "metric_name": "github_total_score",
            "metric_value": round(sum(score_by_email.values()), 4),
            "source": "github",
            "created_at": utc_now_iso(),
        },
        {
            "id": det_id("metric", {"date": date, "name": "github_total_prs_opened"}),
            "run_id": args.run_id,
            "date": date,
            "metric_name": "github_total_prs_opened",
            "metric_value": int(sum(opened_by_email.values())),
            "source": "github",
            "created_at": utc_now_iso(),
        },
        {
            "id": det_id("metric", {"date": date, "name": "github_total_prs_merged"}),
            "run_id": args.run_id,
            "date": date,
            "metric_name": "github_total_prs_merged",
            "metric_value": int(sum(merged_by_email.values())),
            "source": "github",
            "created_at": utc_now_iso(),
        },
    ]

    items = [
        build_upsert_item(schema_type="agent", table="result_developer_scores", rows=rows_scores, conflict_keys=["id"]),
        build_upsert_item(schema_type="agent", table="result_metrics", rows=metrics_rows, conflict_keys=["id"]),
    ]

    out["result_developer_scores_rows"] = rows_scores
    out["result_metrics_rows"] = metrics_rows
    out["aggregated_results"] = items
    print(json.dumps(out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
