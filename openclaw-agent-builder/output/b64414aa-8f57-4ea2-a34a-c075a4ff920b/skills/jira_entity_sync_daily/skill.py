#!/usr/bin/env python3
"""jira_entity_sync_daily

- Best-effort triggers Jira ingestion via the ingestion service
- Reads Jira entities from shared tables (table names vary by deployment)
- Writes a normalized copy into agent-owned tables (jira_projects/users/sprints/issues)

All writes are upserts and include run_id in the API request.

This script is intentionally defensive so it stays runnable even when
endpoint/table conventions differ.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any, Dict, List, Optional, Tuple

# Ensure `src/` is importable when executed as a script.
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from src.common.ingestion_client import IngestionClient, build_upsert_item
from src.common import jira_schema_hints as hints


def pick_first_queryable_table(client: IngestionClient, *, schema_type: str, candidates: List[str]) -> Tuple[Optional[str], List[Dict[str, Any]]]:
    last_err: Optional[str] = None
    for t in candidates:
        try:
            rows = client.query(schema_type=schema_type, table=t, limit=1000)
            # We treat "query succeeded" as pickable even if empty.
            return t, rows
        except Exception as e:
            last_err = str(e)
            continue
    if last_err:
        return None, []
    return None, []


def normalize_rows(rows: List[Dict[str, Any]], *, entity: str) -> List[Dict[str, Any]]:
    """Light-touch normalization: ensure an `id` exists if possible.

    We do not attempt deep schema transforms here; downstream steps use hints.
    """

    out: List[Dict[str, Any]] = []
    for r in rows:
        rr = dict(r)
        # Promote some common identifiers to `id`.
        if entity == "projects":
            rr.setdefault("id", rr.get("project_id") or rr.get("key"))
        elif entity == "users":
            rr.setdefault("id", rr.get("account_id") or rr.get("accountId") or rr.get("user_id"))
        elif entity == "sprints":
            rr.setdefault("id", rr.get("sprint_id") or rr.get("sprintId") or rr.get("id"))
        elif entity == "issues":
            rr.setdefault("id", rr.get("issue_id") or rr.get("key") or rr.get("id"))
        out.append(rr)
    return out


def main(argv: List[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--run-id", required=True)
    ap.add_argument("--no-trigger", action="store_true", help="Skip /ingestion/trigger (useful for testing)")
    ap.add_argument("--write", action="store_true", help="Actually write agent-owned entity copies")
    args = ap.parse_args(argv)

    client = IngestionClient.from_env()

    trigger_resp: Dict[str, Any] = {}
    job_final: Dict[str, Any] = {}
    if not args.no_trigger and client.base_url:
        try:
            # TODO: confirm exact payload expected by your ingestion service.
            trigger_resp = client.trigger_ingestion(
                connector_type="jira",
                entities=["projects", "users", "sprints", "issues"],
                scope={"projects": "*"},
            )
            job_id = trigger_resp.get("job_id") or trigger_resp.get("id")
            if job_id:
                job_final = client.poll_job(str(job_id), timeout_s=300)
        except Exception as e:
            trigger_resp = {"warning": "ingestion trigger failed; continuing", "error": str(e)}

    # Read shared tables (best effort)
    source_tables: Dict[str, Optional[str]] = {}

    project_table, projects = pick_first_queryable_table(client, schema_type="shared", candidates=hints.PROJECT_TABLE_CANDIDATES)
    user_table, users = pick_first_queryable_table(client, schema_type="shared", candidates=hints.USER_TABLE_CANDIDATES)
    sprint_table, sprints = pick_first_queryable_table(client, schema_type="shared", candidates=hints.SPRINT_TABLE_CANDIDATES)
    issue_table, issues = pick_first_queryable_table(client, schema_type="shared", candidates=hints.ISSUE_TABLE_CANDIDATES)

    source_tables.update(
        {
            "projects": project_table,
            "users": user_table,
            "sprints": sprint_table,
            "issues": issue_table,
        }
    )

    projects_n = normalize_rows(projects, entity="projects")
    users_n = normalize_rows(users, entity="users")
    sprints_n = normalize_rows(sprints, entity="sprints")
    issues_n = normalize_rows(issues, entity="issues")

    items: List[Dict[str, Any]] = []
    if args.write and client.base_url:
        # Upsert into agent-owned tables for stable downstream querying.
        if projects_n:
            items.append(build_upsert_item(schema_type="agent", table="jira_projects", rows=projects_n, conflict_keys=["id"]))
        if users_n:
            items.append(build_upsert_item(schema_type="agent", table="jira_users", rows=users_n, conflict_keys=["id"]))
        if sprints_n:
            items.append(build_upsert_item(schema_type="agent", table="jira_sprints", rows=sprints_n, conflict_keys=["id"]))
        if issues_n:
            items.append(build_upsert_item(schema_type="agent", table="jira_issues", rows=issues_n, conflict_keys=["id"]))

        if items:
            try:
                _ = client.write_batch(run_id=args.run_id, items=items, atomic=True)
            except Exception as e:
                # We still output summary for workflow wiring.
                items = [{"warning": "write failed", "error": str(e)}]

    sync_summary = {
        "projects": len(projects_n),
        "users": len(users_n),
        "sprints": len(sprints_n),
        "issues": len(issues_n),
    }

    print(
        json.dumps(
            {
                "run_id": args.run_id,
                "trigger": trigger_resp,
                "job": job_final,
                "source_tables": source_tables,
                "sync_summary": sync_summary,
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
