#!/usr/bin/env python3

from __future__ import annotations

import json
import os
import subprocess
import sys
import textwrap
import urllib.error
import urllib.request


DEFAULT_AGENT_ID = "github-review"
DEFAULT_TIMEOUT_SECONDS = 180
DEFAULT_MAX_PATCH_CHARS = 120000
DEFAULT_SESSION_PREFIX = "hook:github-review:"
STATUS_CONTEXT = "openclaw/review"
GITHUB_API_BASE = "https://api.github.com"


class DispatchError(RuntimeError):
    pass


def git_try_output(*args: str) -> str | None:
    result = subprocess.run(
        ["git", *args],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        return None
    return result.stdout


def build_manual_event() -> dict:
    sha = os.environ.get("GITHUB_SHA")
    repo = os.environ.get("GITHUB_REPOSITORY")
    github_server_url = os.environ.get("GITHUB_SERVER_URL", "https://github.com")
    if not sha or not repo:
        raise DispatchError("GITHUB_SHA or GITHUB_REPOSITORY is not set for manual dispatch")

    before = git_try_output("rev-parse", f"{sha}^")
    before_sha = before.strip() if before else None
    files = git_output("diff-tree", "--no-commit-id", "--name-only", "-r", sha).splitlines()

    event = {
        "deleted": False,
        "before": before_sha,
        "after": sha,
        "compare": (
            f"{github_server_url}/{repo}/compare/{before_sha}...{sha}"
            if before_sha
            else f"{github_server_url}/{repo}/commit/{sha}"
        ),
        "commits": [
            {
                "id": sha,
                "message": git_output("log", "-1", "--pretty=%s", sha).strip(),
                "timestamp": git_output("log", "-1", "--date=iso-strict", "--pretty=%cI", sha).strip(),
                "author": {
                    "name": git_output("log", "-1", "--pretty=%an", sha).strip(),
                    "email": git_output("log", "-1", "--pretty=%ae", sha).strip(),
                },
                "added": [],
                "modified": [],
                "removed": [],
                "files": files,
            }
        ],
    }
    return event


def load_push_event() -> dict:
    event_name = os.environ.get("GITHUB_EVENT_NAME")
    if event_name == "workflow_dispatch":
        return build_manual_event()

    if event_name != "push":
        raise DispatchError(f"Unsupported event: {event_name or 'unknown'}")

    event_path = os.environ.get("GITHUB_EVENT_PATH")
    if not event_path:
        raise DispatchError("GITHUB_EVENT_PATH is not set")

    with open(event_path, encoding="utf-8") as handle:
        event = json.load(handle)

    if event.get("deleted"):
        return {"deleted": True, "commits": []}

    return event


def git_output(*args: str) -> str:
    result = subprocess.run(
        ["git", *args],
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout


def github_api_request(
    method: str,
    path: str,
    body: dict | None = None,
    token: str | None = None,
) -> None:
    if not token:
        return

    data = None if body is None else json.dumps(body).encode("utf-8")
    request = urllib.request.Request(
        f"{GITHUB_API_BASE}{path}",
        data=data,
        method=method,
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "openclaw-commit-review-dispatch",
        },
    )
    with urllib.request.urlopen(request, timeout=30):
        return


def set_pending_status(
    repo: str,
    sha: str,
    description: str,
    target_url: str | None,
    token: str | None,
) -> None:
    payload = {
        "state": "pending",
        "context": STATUS_CONTEXT,
        "description": description[:140],
    }
    if target_url:
        payload["target_url"] = target_url
    github_api_request("POST", f"/repos/{repo}/statuses/{sha}", payload, token)


def set_error_status(
    repo: str,
    sha: str,
    description: str,
    target_url: str | None,
    token: str | None,
) -> None:
    payload = {
        "state": "error",
        "context": STATUS_CONTEXT,
        "description": description[:140],
    }
    if target_url:
        payload["target_url"] = target_url
    github_api_request("POST", f"/repos/{repo}/statuses/{sha}", payload, token)


def build_patch(sha: str, max_chars: int) -> tuple[str, bool]:
    patch = git_output(
        "show",
        "--format=medium",
        "--stat",
        "--patch",
        "--find-renames",
        "--find-copies",
        "--unified=3",
        sha,
    )
    truncated = False
    if len(patch) > max_chars:
        truncated = True
        patch = (
            patch[:max_chars]
            + "\n\n[TRUNCATED] The patch exceeded the configured size limit. Review only what is shown.\n"
        )
    return patch, truncated


def commit_files(commit: dict) -> list[str]:
    if commit.get("files"):
        return sorted(set(commit["files"]))
    files = set()
    for key in ("added", "modified", "removed"):
        files.update(commit.get(key, []))
    return sorted(files)


def build_message(
    event: dict,
    commit: dict,
    repo: str,
    branch_ref: str,
    commit_html_url: str,
    patch: str,
    truncated: bool,
) -> str:
    sha = commit["id"]
    files = commit_files(commit)
    compare_url = event.get("compare")
    metadata = {
        "repository": repo,
        "branch": branch_ref,
        "before": event.get("before"),
        "after": event.get("after"),
        "compare_url": compare_url,
        "commit": {
            "sha": sha,
            "message": commit.get("message"),
            "timestamp": commit.get("timestamp"),
            "url": commit_html_url,
            "author": commit.get("author", {}),
            "files": files,
        },
    }
    metadata_json = json.dumps(metadata, indent=2, sort_keys=True)
    truncation_note = (
        "The patch was truncated. Mention clearly that the review is partial and only covers the visible diff."
        if truncated
        else "The patch was not truncated."
    )

    return textwrap.dedent(
        f"""
        You are the automated OpenClaw reviewer for a single GitHub commit.

        Review rubric:
        - Look only for material problems introduced by this commit.
        - Prioritize correctness bugs, security issues, secret exposure, broken auth, data loss risk, unsafe automation, and operational regressions.
        - Ignore style nits, cosmetic refactors, and speculative design commentary.

        Return only valid JSON. Do not wrap it in markdown fences. Do not include any extra prose.

        Required JSON shape:
        {{
          "conclusion": "no_material_findings" | "material_findings" | "review_failed",
          "description": "short status line, 140 characters or fewer",
          "findings": [
            {{
              "title": "short title",
              "body": "concise explanation of the issue and why it matters",
              "path": "optional/file/path.ext",
              "severity": "high" | "medium" | "low"
            }}
          ],
          "notes": [
            "optional note"
          ]
        }}

        Output rules:
        - If there are no material findings, set "conclusion" to "no_material_findings" and return an empty "findings" array.
        - If you cannot review reliably, set "conclusion" to "review_failed".
        - Keep findings concise and actionable.
        - Include file paths whenever possible.
        - Add this note verbatim to "notes" if helpful: "{truncation_note}"

        Repository metadata:
        ```json
        {metadata_json}
        ```

        Patch to review:
        ```diff
        {patch}
        ```
        """
    ).strip()


def post_to_openclaw(
    hook_url: str,
    hook_token: str,
    message: str,
    sha: str,
    metadata: dict[str, object],
) -> None:
    timeout_seconds = int(
        os.environ.get("OPENCLAW_REVIEW_TIMEOUT_SECONDS") or DEFAULT_TIMEOUT_SECONDS
    )
    payload: dict[str, object] = {
        "message": message,
        "name": "GitHub Commit Review",
        "agentId": os.environ.get("OPENCLAW_REVIEW_AGENT_ID") or DEFAULT_AGENT_ID,
        "sessionKey": f"{os.environ.get('OPENCLAW_REVIEW_SESSION_PREFIX') or DEFAULT_SESSION_PREFIX}{sha}",
        "wakeMode": "now",
        "timeoutSeconds": timeout_seconds,
        "metadata": metadata,
    }

    request = urllib.request.Request(
        hook_url,
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {hook_token}",
            "Content-Type": "application/json",
            "User-Agent": "openclaw-commit-review-dispatch",
        },
    )
    with urllib.request.urlopen(request, timeout=max(timeout_seconds + 60, 120)):
        return


def dispatch() -> int:
    hook_url = os.environ.get("OPENCLAW_REVIEW_WEBHOOK_URL")
    hook_token = os.environ.get("OPENCLAW_REVIEW_WEBHOOK_TOKEN")
    if not hook_url or not hook_token:
        print(
            "OpenClaw review is not configured. Set OPENCLAW_REVIEW_WEBHOOK_URL and OPENCLAW_REVIEW_WEBHOOK_TOKEN.",
            file=sys.stderr,
        )
        return 0

    event = load_push_event()
    if event.get("deleted"):
        print("Push deleted a ref. Skipping OpenClaw review.")
        return 0

    commits = [commit for commit in event.get("commits", []) if commit.get("id")]
    if not commits:
        print("No commits found in push payload. Nothing to review.")
        return 0

    repo = os.environ["GITHUB_REPOSITORY"]
    branch_ref = os.environ.get("GITHUB_REF", "")
    github_token = os.environ.get("GITHUB_TOKEN")
    status_target_url = os.environ.get("OPENCLAW_REVIEW_COMMIT_STATUS_TARGET_URL")
    max_patch_chars = int(
        os.environ.get("OPENCLAW_REVIEW_MAX_PATCH_CHARS") or DEFAULT_MAX_PATCH_CHARS
    )
    github_server_url = os.environ.get("GITHUB_SERVER_URL", "https://github.com")

    failures: list[str] = []

    for commit in commits:
        sha = commit["id"]
        commit_html_url = f"{github_server_url}/{repo}/commit/{sha}"
        compare_url = event.get("compare")
        metadata = {
            "repository": repo,
            "sha": sha,
            "commit_url": commit_html_url,
            "compare_url": compare_url,
            "status_context": STATUS_CONTEXT,
            "target_url": status_target_url or commit_html_url,
        }
        try:
            set_pending_status(
                repo=repo,
                sha=sha,
                description="OpenClaw review queued",
                target_url=status_target_url or commit_html_url,
                token=github_token,
            )
            patch, truncated = build_patch(sha, max_patch_chars)
            message = build_message(
                event,
                commit,
                repo,
                branch_ref,
                commit_html_url,
                patch,
                truncated,
            )
            post_to_openclaw(hook_url, hook_token, message, sha, metadata)
            print(f"Queued OpenClaw review for {sha}")
        except (DispatchError, subprocess.CalledProcessError, urllib.error.URLError) as exc:
            set_error_status(
                repo=repo,
                sha=sha,
                description=f"OpenClaw dispatch failed: {exc}",
                target_url=status_target_url or commit_html_url,
                token=github_token,
            )
            failures.append(f"{sha}: {exc}")

    if failures:
        for failure in failures:
            print(failure, file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(dispatch())
