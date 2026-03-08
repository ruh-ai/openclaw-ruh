#!/usr/bin/env python3

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path


GRAPHQL_URL = "https://api.linear.app/graphql"
DEFAULT_CSV = "docs/02 Operations/Linear/openclaw-ruh-backlog.csv"
DEFAULT_PROJECT = "https://linear.app/ruh-ai/project/openclaw-ruh-361c1092df93/overview"
PRIORITY_MAP = {
    "urgent": 1,
    "high": 2,
    "medium": 3,
    "normal": 3,
    "low": 4,
}
LABEL_COLORS = [
    "#2563EB",
    "#059669",
    "#D97706",
    "#DC2626",
    "#7C3AED",
    "#0891B2",
    "#4F46E5",
    "#16A34A",
    "#EA580C",
    "#DB2777",
]


class LinearError(RuntimeError):
    pass


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Import backlog issues into a Linear project. Dry-run by default."
    )
    parser.add_argument(
        "--csv",
        default=DEFAULT_CSV,
        help=f"CSV file to import (default: {DEFAULT_CSV})",
    )
    parser.add_argument(
        "--project",
        default=DEFAULT_PROJECT,
        help="Project URL, slugId, exact project name, or project ID.",
    )
    parser.add_argument(
        "--token-env",
        default="LINEAR_API_KEY,LINEAR_API_TOKEN",
        help="Comma-separated env var names to search for the Linear API token.",
    )
    parser.add_argument(
        "--create-labels",
        action="store_true",
        help="Create any missing labels before importing issues.",
    )
    parser.add_argument(
        "--set-priority",
        action="store_true",
        help="Map CSV priorities to Linear numeric priorities.",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Actually create labels and issues. Without this flag the script is dry-run only.",
    )
    return parser.parse_args()


def load_token(token_env: str) -> str:
    for env_name in [part.strip() for part in token_env.split(",") if part.strip()]:
        value = os.environ.get(env_name)
        if value:
            return value
    names = ", ".join(part.strip() for part in token_env.split(",") if part.strip())
    raise LinearError(f"Missing Linear API token. Set one of: {names}")


def split_csv_list(raw: str) -> list[str]:
    return [part.strip() for part in (raw or "").split(",") if part.strip()]


def parse_project_ref(project_ref: str) -> dict[str, str]:
    ref = project_ref.strip()
    match = re.search(r"/project/([a-z0-9-]+)-([a-z0-9]+)/", ref, re.IGNORECASE)
    if match:
        return {
            "kind": "url",
            "slug": match.group(1),
            "slug_id": match.group(2),
            "url": ref,
        }
    if re.fullmatch(r"[0-9a-f]{8}-[0-9a-f-]{27}", ref, re.IGNORECASE):
        return {"kind": "id", "id": ref}
    if re.fullmatch(r"[a-z0-9]{8,}", ref, re.IGNORECASE):
        return {"kind": "slug_id", "slug_id": ref}
    return {"kind": "name", "name": ref}


def read_rows(csv_path: Path) -> list[dict[str, str]]:
    if not csv_path.exists():
        raise LinearError(f"CSV not found: {csv_path}")
    with csv_path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


class LinearClient:
    def __init__(self, token: str) -> None:
        self.token = token

    def request(self, query: str, variables: dict | None = None) -> dict:
        payload = json.dumps({"query": query, "variables": variables or {}}).encode("utf-8")
        headers = {
            "Content-Type": "application/json",
            "Authorization": self.token,
        }
        req = urllib.request.Request(GRAPHQL_URL, data=payload, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=30) as response:
                body = response.read().decode("utf-8")
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise LinearError(f"Linear API request failed: {exc.code} {detail}") from exc
        except urllib.error.URLError as exc:
            raise LinearError(f"Linear API request failed: {exc}") from exc
        data = json.loads(body)
        if data.get("errors"):
            raise LinearError(json.dumps(data["errors"], indent=2))
        return data["data"]

    def viewer(self) -> dict:
        query = """
        query Viewer {
          viewer {
            id
            name
            email
            displayName
          }
        }
        """
        return self.request(query)["viewer"]

    def all_projects(self) -> list[dict]:
        query = """
        query Projects($after: String) {
          projects(first: 250, after: $after) {
            nodes {
              id
              name
              slugId
              url
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
        """
        projects: list[dict] = []
        after = None
        while True:
            page = self.request(query, {"after": after})["projects"]
            projects.extend(page["nodes"])
            if not page["pageInfo"]["hasNextPage"]:
                return projects
            after = page["pageInfo"]["endCursor"]

    def all_teams(self) -> list[dict]:
        query = """
        query Teams($after: String) {
          teams(first: 250, after: $after) {
            nodes {
              id
              key
              name
              defaultIssueState {
                id
                name
              }
              states {
                nodes {
                  id
                  name
                  type
                }
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
        """
        teams: list[dict] = []
        after = None
        while True:
            page = self.request(query, {"after": after})["teams"]
            teams.extend(page["nodes"])
            if not page["pageInfo"]["hasNextPage"]:
                return teams
            after = page["pageInfo"]["endCursor"]

    def all_labels(self) -> list[dict]:
        query = """
        query Labels($after: String) {
          issueLabels(first: 250, after: $after) {
            nodes {
              id
              name
              color
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
        """
        labels: list[dict] = []
        after = None
        while True:
            page = self.request(query, {"after": after})["issueLabels"]
            labels.extend(page["nodes"])
            if not page["pageInfo"]["hasNextPage"]:
                return labels
            after = page["pageInfo"]["endCursor"]

    def project_issue_titles(self, project_id: str) -> set[str]:
        query = """
        query ProjectIssues($projectId: String!, $after: String) {
          project(id: $projectId) {
            issues(first: 250, after: $after) {
              nodes {
                title
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        }
        """
        titles: set[str] = set()
        after = None
        while True:
            page = self.request(query, {"projectId": project_id, "after": after})["project"]["issues"]
            for node in page["nodes"]:
                titles.add(node["title"].strip().casefold())
            if not page["pageInfo"]["hasNextPage"]:
                return titles
            after = page["pageInfo"]["endCursor"]

    def create_label(self, name: str, color: str) -> None:
        query = """
        mutation CreateLabel($input: IssueLabelCreateInput!) {
          issueLabelCreate(input: $input) {
            success
          }
        }
        """
        result = self.request(query, {"input": {"name": name, "color": color}})["issueLabelCreate"]
        if not result["success"]:
            raise LinearError(f"Failed to create label: {name}")

    def create_issue(self, input_data: dict) -> dict:
        query = """
        mutation CreateIssue($input: IssueCreateInput!) {
          issueCreate(input: $input) {
            success
            issue {
              id
              identifier
              title
              url
            }
          }
        }
        """
        result = self.request(query, {"input": input_data})["issueCreate"]
        if not result["success"]:
            raise LinearError(f"Failed to create issue: {input_data['title']}")
        return result["issue"]


def resolve_project(projects: list[dict], project_ref: str) -> dict:
    parsed = parse_project_ref(project_ref)
    for project in projects:
        if parsed["kind"] == "url" and project["url"] == parsed["url"]:
            return project
        if parsed.get("slug_id") and project.get("slugId") == parsed["slug_id"]:
            return project
        if parsed.get("id") and project["id"] == parsed["id"]:
            return project
        if parsed.get("name") and project["name"].strip().casefold() == parsed["name"].strip().casefold():
            return project
        if parsed.get("slug") and project["name"].strip().casefold() == parsed["slug"].strip().casefold():
            return project
    raise LinearError(f"Could not resolve project from: {project_ref}")


def team_index(teams: list[dict]) -> dict[str, dict]:
    index: dict[str, dict] = {}
    for team in teams:
        index[team["key"].strip().casefold()] = team
        index[team["name"].strip().casefold()] = team
    return index


def label_index(labels: list[dict]) -> dict[str, dict]:
    return {label["name"].strip().casefold(): label for label in labels}


def color_for_label(name: str) -> str:
    total = sum(ord(ch) for ch in name)
    return LABEL_COLORS[total % len(LABEL_COLORS)]


def resolve_state_id(team: dict, requested_status: str) -> str | None:
    status = (requested_status or "").strip()
    if not status:
        return team["defaultIssueState"]["id"] if team.get("defaultIssueState") else None
    wanted = status.casefold()
    for state in team["states"]["nodes"]:
        if state["name"].strip().casefold() == wanted:
            return state["id"]
    default_state = team.get("defaultIssueState")
    return default_state["id"] if default_state else None


def build_issue_input(
    row: dict[str, str],
    project: dict,
    teams_by_name: dict[str, dict],
    labels_by_name: dict[str, dict],
    set_priority: bool,
) -> tuple[dict, list[str]]:
    problems: list[str] = []
    team_value = (row.get("Team") or "").strip()
    title = (row.get("Title") or "").strip()
    if not team_value:
        problems.append(f"Missing team for issue '{title or '<untitled>'}'")
        return {}, problems
    if not title:
        problems.append("Missing title in CSV row")
        return {}, problems

    team = teams_by_name.get(team_value.casefold())
    if not team:
        problems.append(f"Unknown team '{team_value}' for issue '{title}'")
        return {}, problems

    label_ids: list[str] = []
    missing_labels: list[str] = []
    for label_name in split_csv_list(row.get("Labels", "")):
        label = labels_by_name.get(label_name.casefold())
        if label:
            label_ids.append(label["id"])
        else:
            missing_labels.append(label_name)
    if missing_labels:
        problems.append(f"Issue '{title}' references missing labels: {', '.join(missing_labels)}")

    input_data: dict = {
        "teamId": team["id"],
        "projectId": project["id"],
        "title": title,
        "description": (row.get("Description") or "").strip() or None,
        "stateId": resolve_state_id(team, row.get("Status", "")),
    }

    if label_ids:
        input_data["labelIds"] = label_ids

    estimate = (row.get("Estimate") or "").strip()
    if estimate:
        try:
            input_data["estimate"] = int(float(estimate))
        except ValueError:
            problems.append(f"Issue '{title}' has a non-numeric estimate: {estimate}")

    if set_priority:
        priority_name = (row.get("Priority") or "").strip().casefold()
        if priority_name in PRIORITY_MAP:
            input_data["priority"] = PRIORITY_MAP[priority_name]
        elif priority_name:
            problems.append(f"Issue '{title}' has an unsupported priority: {priority_name}")

    due_date = (row.get("Due Date") or "").strip()
    if due_date:
        input_data["dueDate"] = due_date

    return input_data, problems


def ensure_labels(
    client: LinearClient,
    rows: list[dict[str, str]],
    labels_by_name: dict[str, dict],
    apply: bool,
) -> tuple[dict[str, dict], list[str]]:
    created: list[str] = []
    missing = sorted(
        {
            label_name
            for row in rows
            for label_name in split_csv_list(row.get("Labels", ""))
            if label_name.casefold() not in labels_by_name
        },
        key=str.casefold,
    )
    if not missing:
        return labels_by_name, created

    if not apply:
        return labels_by_name, missing

    for label_name in missing:
        client.create_label(label_name, color_for_label(label_name))
        created.append(label_name)
    return label_index(client.all_labels()), created


def main() -> int:
    args = parse_args()

    try:
        token = load_token(args.token_env)
        rows = read_rows(Path(args.csv))
        client = LinearClient(token)
        viewer = client.viewer()
        projects = client.all_projects()
        project = resolve_project(projects, args.project)
        teams = client.all_teams()
        teams_by_name = team_index(teams)
        labels_by_name = label_index(client.all_labels())
        labels_by_name, label_changes = ensure_labels(
            client=client,
            rows=rows,
            labels_by_name=labels_by_name,
            apply=args.apply and args.create_labels,
        )
        existing_titles = client.project_issue_titles(project["id"])
    except LinearError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    print(
        f"viewer: {viewer.get('displayName') or viewer.get('name')} "
        f"<{viewer.get('email')}>"
    )
    print(f"project: {project['name']} ({project['url']})")
    print(f"mode: {'apply' if args.apply else 'dry-run'}")

    if label_changes:
        if args.apply and args.create_labels:
            print(f"created labels: {', '.join(label_changes)}")
        elif args.create_labels:
            print(f"would create labels: {', '.join(label_changes)}")
        else:
            print(f"missing labels: {', '.join(label_changes)}")

    planned_creates: list[dict] = []
    skipped_duplicates: list[str] = []
    problems: list[str] = []

    for row in rows:
        title = (row.get("Title") or "").strip()
        if not title:
            continue
        if title.casefold() in existing_titles:
            skipped_duplicates.append(title)
            continue
        input_data, row_problems = build_issue_input(
            row=row,
            project=project,
            teams_by_name=teams_by_name,
            labels_by_name=labels_by_name,
            set_priority=args.set_priority,
        )
        if row_problems:
            problems.extend(row_problems)
            continue
        planned_creates.append(input_data)

    if skipped_duplicates:
        print(f"skipping {len(skipped_duplicates)} existing issues")

    if problems:
        print("problems:")
        for problem in problems:
            print(f"  - {problem}")
        if args.apply:
            print("aborting apply because the import plan is not clean", file=sys.stderr)
            return 1

    print(f"planned creates: {len(planned_creates)}")

    if not args.apply:
        for issue in planned_creates:
            print(f"  - {issue['title']}")
        return 0

    created = 0
    for issue in planned_creates:
        created_issue = client.create_issue(issue)
        created += 1
        print(f"created {created_issue['identifier']}: {created_issue['title']}")

    print(f"done: created {created} issues")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
