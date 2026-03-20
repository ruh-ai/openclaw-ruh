#!/usr/bin/env python3
"""compute_sprint_metrics

Reads Jira entities from the ingestion service and computes:
- velocity (story points per sprint), per sprint and per developer
- cycle time (avg days from In Progress -> Done), per sprint and per developer

Outputs JSON rows destined for:
- result_metrics
- result_narratives

No writes are performed here; the write step is separate.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import sys
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional, Tuple

# Ensure `src/` is importable when executed as a script.
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from dateutil import parser as dtparser

from src.common.ingestion_client import IngestionClient
from src.common import jira_schema_hints as hints


def _first_present(d: Dict[str, Any], keys: List[str]) -> Any:
    for k in keys:
        if k in d and d[k] not in (None, ""):
            return d[k]
    return None


def _to_float(x: Any) -> Optional[float]:
    if x is None:
        return None
    try:
        if isinstance(x, str) and x.strip() == "":
            return None
        return float(x)
    except Exception:
        return None


def _parse_dt(x: Any) -> Optional[datetime]:
    if x in (None, ""):
        return None
    if isinstance(x, (int, float)):
        # Assume ms epoch
        try:
            return datetime.fromtimestamp(float(x) / 1000.0, tz=timezone.utc)
        except Exception:
            return None
    if isinstance(x, str):
        try:
            dt = dtparser.parse(x)
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except Exception:
            return None
    return None


def _days_between(a: datetime, b: datetime) -> float:
    return (b - a).total_seconds() / 86400.0


def _stable_id(*parts: str) -> str:
    h = hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()
    return h[:32]


def _extract_status_events(issue: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Return a list of {from,to,at} status transitions.

    We support multiple possible input shapes:
    - issue["changelog"] already being a list of transitions
    - a dict with an "items" list

    Unknown shapes return [].

    TODO: Align with your canonical Jira ingestion schema.
    """

    raw = _first_present(issue, hints.ISSUE_CHANGELOG_FIELDS)
    if raw is None:
        return []

    if isinstance(raw, dict):
        # Common Jira: changelog.histories[*].items[*]
        if "histories" in raw and isinstance(raw["histories"], list):
            ev: List[Dict[str, Any]] = []
            for h in raw["histories"]:
                created = _parse_dt(h.get("created"))
                items = h.get("items")
                if not (created and isinstance(items, list)):
                    continue
                for it in items:
                    if (it.get("field") or it.get("fieldId")) not in ("status", "statusId"):
                        continue
                    ev.append({"from": it.get("fromString"), "to": it.get("toString"), "at": created})
            return ev
        # Already items list
        if "items" in raw and isinstance(raw["items"], list):
            out: List[Dict[str, Any]] = []
            for it in raw["items"]:
                at = _parse_dt(it.get("at") or it.get("created"))
                if at is None:
                    continue
                out.append({"from": it.get("from") or it.get("fromString"), "to": it.get("to") or it.get("toString"), "at": at})
            return out

    if isinstance(raw, list):
        out2: List[Dict[str, Any]] = []
        for it in raw:
            if not isinstance(it, dict):
                continue
            at = _parse_dt(it.get("at") or it.get("created") or it.get("timestamp"))
            if at is None:
                continue
            out2.append({"from": it.get("from") or it.get("fromString"), "to": it.get("to") or it.get("toString"), "at": at})
        return out2

    return []


def _first_transition_at(events: List[Dict[str, Any]], target_status: str) -> Optional[datetime]:
    target = target_status.lower()
    times: List[datetime] = []
    for e in events:
        to_s = (e.get("to") or "").lower()
        if to_s == target:
            at = e.get("at")
            if isinstance(at, datetime):
                times.append(at)
    return min(times) if times else None


def query_prefer_agent(client: IngestionClient, *, agent_table: str, shared_candidates: List[str], limit: int = 20000) -> Tuple[str, List[Dict[str, Any]]]:
    # Prefer agent-owned table written by sync.
    try:
        rows = client.query(schema_type="agent", table=agent_table, limit=limit)
        return f"agent:{agent_table}", rows
    except Exception:
        pass

    # Fall back to shared candidates.
    for t in shared_candidates:
        try:
            rows = client.query(schema_type="shared", table=t, limit=limit)
            return f"shared:{t}", rows
        except Exception:
            continue
    return "none", []


def main(argv: List[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--run-id", required=True)
    args = ap.parse_args(argv)

    client = IngestionClient.from_env()

    sprint_src, sprints = query_prefer_agent(client, agent_table="jira_sprints", shared_candidates=hints.SPRINT_TABLE_CANDIDATES)
    issue_src, issues = query_prefer_agent(client, agent_table="jira_issues", shared_candidates=hints.ISSUE_TABLE_CANDIDATES)
    user_src, users = query_prefer_agent(client, agent_table="jira_users", shared_candidates=hints.USER_TABLE_CANDIDATES)

    # Index users for display names
    user_name_by_id: Dict[str, str] = {}
    for u in users:
        uid = _first_present(u, hints.USER_ID_FIELDS)
        name = _first_present(u, hints.USER_NAME_FIELDS)
        if uid is not None:
            user_name_by_id[str(uid)] = str(name) if name is not None else str(uid)

    # Index sprints
    sprint_name_by_id: Dict[str, str] = {}
    for s in sprints:
        sid = _first_present(s, hints.SPRINT_ID_FIELDS)
        sname = _first_present(s, hints.SPRINT_NAME_FIELDS) or sid
        if sid is not None:
            sprint_name_by_id[str(sid)] = str(sname)

    # Aggregations
    velocity_by_sprint: Dict[str, float] = defaultdict(float)
    velocity_by_sprint_dev: Dict[Tuple[str, str], float] = defaultdict(float)

    cycle_times_by_sprint: Dict[str, List[float]] = defaultdict(list)
    cycle_times_by_sprint_dev: Dict[Tuple[str, str], List[float]] = defaultdict(list)

    done_statuses = {"done", "closed", "resolved"}
    in_progress_statuses = {"in progress", "in-progress", "doing"}

    for issue in issues:
        sid = _first_present(issue, hints.ISSUE_SPRINT_ID_FIELDS)
        if sid is None:
            continue
        sprint_id = str(sid)

        points = _to_float(_first_present(issue, hints.ISSUE_STORY_POINTS_FIELDS)) or 0.0
        assignee = _first_present(issue, hints.ISSUE_ASSIGNEE_FIELDS)
        dev_id = str(assignee) if assignee is not None else "unassigned"

        status = _first_present(issue, hints.ISSUE_STATUS_FIELDS)
        status_l = str(status).lower() if status is not None else ""

        # Velocity: count story points for issues in Done-like state.
        if status_l in done_statuses:
            velocity_by_sprint[sprint_id] += points
            velocity_by_sprint_dev[(sprint_id, dev_id)] += points

        # Cycle time: from first In Progress to first Done.
        events = _extract_status_events(issue)
        if events:
            # Map fuzzy statuses: find earliest event where to matches any in_progress_statuses/done_statuses.
            inprog_at: Optional[datetime] = None
            done_at: Optional[datetime] = None
            # direct hits
            for cand in ("In Progress", "Doing"):
                inprog_at = inprog_at or _first_transition_at(events, cand)
            for cand in ("Done", "Closed", "Resolved"):
                done_at = done_at or _first_transition_at(events, cand)

            # fallback fuzzy
            if inprog_at is None:
                times = [e["at"] for e in events if isinstance(e.get("at"), datetime) and str(e.get("to") or "").lower() in in_progress_statuses]
                inprog_at = min(times) if times else None
            if done_at is None:
                times2 = [e["at"] for e in events if isinstance(e.get("at"), datetime) and str(e.get("to") or "").lower() in done_statuses]
                done_at = min(times2) if times2 else None

            if inprog_at and done_at and done_at >= inprog_at:
                days = _days_between(inprog_at, done_at)
                # Ignore insane outliers (> 365 days) as a safeguard.
                if 0 <= days <= 3650:
                    cycle_times_by_sprint[sprint_id].append(days)
                    cycle_times_by_sprint_dev[(sprint_id, dev_id)].append(days)

    now = datetime.now(tz=timezone.utc).isoformat()
    metrics_rows: List[Dict[str, Any]] = []
    narratives_rows: List[Dict[str, Any]] = []

    # Helper to add metric row
    def add_metric(*, metric_name: str, sprint_id: str, dev_id: str, value: float, unit: str) -> None:
        sprint_name = sprint_name_by_id.get(sprint_id, sprint_id)
        dev_name = user_name_by_id.get(dev_id, dev_id)
        row_id = _stable_id(args.run_id, metric_name, sprint_id, dev_id)
        metrics_rows.append(
            {
                "id": row_id,
                "run_id": args.run_id,
                "computed_at": now,
                "metric_name": metric_name,
                "sprint_id": sprint_id,
                "sprint_name": sprint_name,
                "developer_id": dev_id,
                "developer_name": dev_name,
                "value": value,
                "unit": unit,
            }
        )

    for sprint_id, v in sorted(velocity_by_sprint.items(), key=lambda kv: kv[0]):
        add_metric(metric_name="velocity", sprint_id=sprint_id, dev_id="ALL", value=float(v), unit="story_points")
    for (sprint_id, dev_id), v in sorted(velocity_by_sprint_dev.items(), key=lambda kv: (kv[0][0], kv[0][1])):
        add_metric(metric_name="velocity", sprint_id=sprint_id, dev_id=dev_id, value=float(v), unit="story_points")

    def _avg(xs: List[float]) -> Optional[float]:
        xs2 = [x for x in xs if x is not None and not math.isnan(x)]
        if not xs2:
            return None
        return sum(xs2) / len(xs2)

    for sprint_id, xs in sorted(cycle_times_by_sprint.items(), key=lambda kv: kv[0]):
        a = _avg(xs)
        if a is not None:
            add_metric(metric_name="cycle_time", sprint_id=sprint_id, dev_id="ALL", value=float(a), unit="days")

    for (sprint_id, dev_id), xs in sorted(cycle_times_by_sprint_dev.items(), key=lambda kv: (kv[0][0], kv[0][1])):
        a = _avg(xs)
        if a is not None:
            add_metric(metric_name="cycle_time", sprint_id=sprint_id, dev_id=dev_id, value=float(a), unit="days")

    # Minimal narrative: top-level per sprint
    for sprint_id in sorted(set(list(velocity_by_sprint.keys()) + list(cycle_times_by_sprint.keys()))):
        v = velocity_by_sprint.get(sprint_id, 0.0)
        ct = _avg(cycle_times_by_sprint.get(sprint_id, []))
        sprint_name = sprint_name_by_id.get(sprint_id, sprint_id)
        parts = [f"Sprint {sprint_name} ({sprint_id})"]
        parts.append(f"Velocity: {v:.1f} story points")
        if ct is not None:
            parts.append(f"Avg cycle time: {ct:.2f} days (In Progress→Done)")
        else:
            parts.append("Avg cycle time: n/a (missing status transitions)")

        narrative = " | ".join(parts)
        narratives_rows.append(
            {
                "id": _stable_id(args.run_id, "narrative", sprint_id, "ALL"),
                "run_id": args.run_id,
                "created_at": now,
                "sprint_id": sprint_id,
                "sprint_name": sprint_name,
                "developer_id": "ALL",
                "developer_name": "ALL",
                "narrative": narrative,
            }
        )

    print(
        json.dumps(
            {
                "run_id": args.run_id,
                "sources": {"sprints": sprint_src, "issues": issue_src, "users": user_src},
                "result_metrics_rows": metrics_rows,
                "result_narratives_rows": narratives_rows,
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
