#!/usr/bin/env python3
"""jira_scoring_agent

Best-effort Jira scoring:
- joins Jira issues to developers via entity_developer_mapping (email preferred)
- computes simple score per developer for a given day

This is designed to be robust across varying ingestion schemas.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any, DefaultDict, Dict, List, Optional, Tuple

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from src.common.ids import det_id
from src.common.ingestion_client import IngestionClient, build_upsert_item
from src.common.timeutil import utc_now_iso, utc_today


def _parse_date(s: Optional[str]) -> str:
    if not s:
        return utc_today()
    # Validate basic YYYY-MM-DD
    datetime.strptime(s, "%Y-%m-%d")
    return s


def _safe_float(v: Any) -> float:
    try:
        if v is None or v == "":
            return 0.0
        return float(v)
    except Exception:
        return 0.0


def _pick(d: Dict[str, Any], keys: List[str]) -> Any:
    for k in keys:
        if k in d and d.get(k) not in (None, ""):
            return d.get(k)
    return None


def _issue_day(issue: Dict[str, Any]) -> Optional[str]:
    # Try common fields
    v = _pick(issue, ["updated_at", "updated", "resolved_at", "resolutiondate", "created_at", "created"])
    if not v:
        return None
    try:
        # accept ISO8601 / Jira timestamps
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

    out: Dict[str, Any] = {
        "run_id": args.run_id,
        "date": date,
        "timestamp": utc_now_iso(),
        "warnings": [],
    }

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

    email_by_jira: Dict[str, str] = {}
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
        ju = (r.get("jira_username") or "").strip().lower()
        if ju:
            email_by_jira[ju] = email

    # Best-effort read Jira issues.
    issues: List[Dict[str, Any]] = []
    jira_tables_to_try = ["jira_issue", "jira_issues", "issue"]
    read_table = None
    for t in jira_tables_to_try:
        try:
            issues = client.query(schema_type="agent", table=t, limit=20000)
            read_table = t
            break
        except Exception:
            continue

    if read_table is None:
        out["warnings"].append("No Jira issue table found (tried jira_issue/jira_issues/issue). Emitting zero scores.")

    # Score heuristic: for issues updated on `date`, score = story_points (or 1) for Done, else 0.25.
    score_by_email: DefaultDict[str, float] = defaultdict(float)
    done_count_by_email: DefaultDict[str, int] = defaultdict(int)
    touched_count_by_email: DefaultDict[str, int] = defaultdict(int)

    for it in issues or []:
        if not isinstance(it, dict):
            continue
        if _issue_day(it) != date:
            continue

        assignee_email = _pick(it, ["assignee_email", "assigneeEmail", "email", "user_email"])
        assignee = _pick(it, ["assignee", "assignee_name", "assigneeName", "assignee_username", "assigneeUsername"])

        email: Optional[str] = None
        if assignee_email:
            email = str(assignee_email).strip().lower()
        elif assignee:
            email = email_by_jira.get(str(assignee).strip().lower())

        if not email:
            continue

        touched_count_by_email[email] += 1

        sp = _safe_float(_pick(it, ["story_points", "storyPoints", "points", "estimate"]))
        if sp <= 0:
            sp = 1.0

        status_cat = str(_pick(it, ["status_category", "statusCategory", "status", "status_name"]) or "").lower()
        is_done = status_cat in ("done", "closed", "resolved")
        if is_done:
            done_count_by_email[email] += 1
            score_by_email[email] += sp
        else:
            score_by_email[email] += 0.25

    # Ensure stable output rows (include mapped devs even if no activity)
    for email in all_emails:
        score_by_email[email] += 0.0

    rows_scores: List[Dict[str, Any]] = []
    for email, score in sorted(score_by_email.items()):
        row_id = det_id("dev_score", {"date": date, "source": "jira", "email": email})
        rows_scores.append(
            {
                "id": row_id,
                "run_id": args.run_id,
                "date": date,
                "source": "jira",
                "email": email,
                "display_name": display_by_email.get(email),
                "score": round(float(score), 4),
                "details_json": json.dumps(
                    {
                        "read_table": read_table,
                        "touched": touched_count_by_email.get(email, 0),
                        "done": done_count_by_email.get(email, 0),
                    },
                    sort_keys=True,
                ),
                "created_at": utc_now_iso(),
            }
        )

    metrics_rows: List[Dict[str, Any]] = [
        {
            "id": det_id("metric", {"date": date, "name": "jira_total_score"}),
            "run_id": args.run_id,
            "date": date,
            "metric_name": "jira_total_score",
            "metric_value": round(sum(score_by_email.values()), 4),
            "source": "jira",
            "created_at": utc_now_iso(),
        },
        {
            "id": det_id("metric", {"date": date, "name": "jira_total_issues_touched"}),
            "run_id": args.run_id,
            "date": date,
            "metric_name": "jira_total_issues_touched",
            "metric_value": int(sum(touched_count_by_email.values())),
            "source": "jira",
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
