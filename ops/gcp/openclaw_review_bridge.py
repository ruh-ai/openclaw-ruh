#!/usr/bin/env python3

from __future__ import annotations

import hashlib
import hmac
import json
import os
import subprocess
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import textwrap
from typing import Any
import urllib.error
import urllib.request


STATUS_CONTEXT_DEFAULT = "openclaw/review"
COMMENT_MARKER_PREFIX = "<!-- openclaw-review:"
GITHUB_API_BASE = "https://api.github.com"
DEFAULT_MAX_PATCH_CHARS = 120000
DEFAULT_SESSION_PREFIX = "hook:github-review:"


class BridgeError(RuntimeError):
    pass


def env_required(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise BridgeError(f"Missing required environment variable: {name}")
    return value


def github_request(method: str, path: str, token: str, body: dict[str, Any] | None = None) -> Any:
    data = None if body is None else json.dumps(body).encode("utf-8")
    request = urllib.request.Request(
        f"{GITHUB_API_BASE}{path}",
        data=data,
        method=method,
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "openclaw-review-bridge",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        raw = response.read().decode("utf-8")
        if not raw:
            return None
        return json.loads(raw)


def github_text_request(method: str, path: str, token: str, accept: str) -> str:
    request = urllib.request.Request(
        f"{GITHUB_API_BASE}{path}",
        method=method,
        headers={
            "Accept": accept,
            "Authorization": f"Bearer {token}",
            "User-Agent": "openclaw-review-bridge",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8")


def upsert_commit_comment(repo: str, sha: str, body: str, token: str) -> None:
    marker = f"{COMMENT_MARKER_PREFIX}{sha} -->"
    comments = github_request(
        "GET",
        f"/repos/{repo}/commits/{sha}/comments?per_page=100",
        token,
    ) or []
    for comment in comments:
        if marker in comment.get("body", ""):
            github_request(
                "PATCH",
                f"/repos/{repo}/comments/{comment['id']}",
                token,
                {"body": body},
            )
            return
    github_request(
        "POST",
        f"/repos/{repo}/commits/{sha}/comments",
        token,
        {"body": body},
    )


def set_commit_status(
    repo: str,
    sha: str,
    state: str,
    description: str,
    context: str,
    target_url: str,
    token: str,
) -> None:
    github_request(
        "POST",
        f"/repos/{repo}/statuses/{sha}",
        token,
        {
            "state": state,
            "context": context,
            "description": description[:140],
            "target_url": target_url,
        },
    )


def run_openclaw_agent(
    message: str,
    session_key: str,
    timeout_seconds: int,
    agent_id: str,
) -> dict[str, Any]:
    openclaw_bin = os.environ.get("OPENCLAW_BIN", "/home/pd/.npm-global/bin/openclaw")
    cmd = [
        openclaw_bin,
        "agent",
        "--agent",
        agent_id,
        "--session-id",
        session_key,
        "--message",
        message,
        "--timeout",
        str(timeout_seconds),
        "--json",
    ]
    result = subprocess.run(
        cmd,
        check=False,
        capture_output=True,
        text=True,
        timeout=timeout_seconds + 60,
        env=os.environ.copy(),
    )
    if result.returncode != 0:
        raise BridgeError(f"OpenClaw agent failed: {result.stderr.strip() or result.stdout.strip()}")
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise BridgeError(f"OpenClaw agent output was not valid JSON: {exc}") from exc


def parse_review_json(agent_result: dict[str, Any]) -> dict[str, Any]:
    payloads = agent_result.get("result", {}).get("payloads", [])
    texts = [payload.get("text", "") for payload in payloads if payload.get("text")]
    combined = "\n".join(texts).strip()
    if not combined:
        raise BridgeError("OpenClaw returned no review text")
    try:
        review = json.loads(combined)
    except json.JSONDecodeError as exc:
        raise BridgeError(f"OpenClaw review text was not valid JSON: {exc}: {combined[:500]}") from exc

    conclusion = review.get("conclusion")
    if conclusion not in {"no_material_findings", "material_findings", "review_failed"}:
        raise BridgeError(f"Unexpected review conclusion: {conclusion!r}")
    if not isinstance(review.get("findings", []), list):
        raise BridgeError("Review findings must be a list")
    if not isinstance(review.get("notes", []), list):
        raise BridgeError("Review notes must be a list")
    return review


def commit_files(commit: dict[str, Any]) -> list[str]:
    if commit.get("files"):
        return sorted(set(commit["files"]))
    files = set()
    for key in ("added", "modified", "removed"):
        files.update(commit.get(key, []))
    return sorted(files)


def build_review_message(
    *,
    event: dict[str, Any],
    commit: dict[str, Any],
    repo: str,
    branch_ref: str,
    commit_html_url: str,
    patch: str,
    truncated: bool,
) -> str:
    sha = commit["id"]
    metadata = {
        "repository": repo,
        "branch": branch_ref,
        "before": event.get("before"),
        "after": event.get("after"),
        "compare_url": event.get("compare"),
        "commit": {
            "sha": sha,
            "message": commit.get("message"),
            "timestamp": commit.get("timestamp"),
            "url": commit_html_url,
            "author": commit.get("author", {}),
            "files": commit_files(commit),
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


def fetch_commit_patch(repo: str, sha: str, token: str) -> tuple[str, bool]:
    max_chars = int(os.environ.get("OPENCLAW_REVIEW_MAX_PATCH_CHARS") or DEFAULT_MAX_PATCH_CHARS)
    patch = github_text_request(
        "GET",
        f"/repos/{repo}/commits/{sha}",
        token,
        "application/vnd.github.v3.patch",
    )
    truncated = False
    if len(patch) > max_chars:
        truncated = True
        patch = (
            patch[:max_chars]
            + "\n\n[TRUNCATED] The patch exceeded the configured size limit. Review only what is shown.\n"
        )
    return patch, truncated


def comment_body(sha: str, review: dict[str, Any]) -> str:
    marker = f"{COMMENT_MARKER_PREFIX}{sha} -->"
    conclusion_text = {
        "no_material_findings": "no material findings",
        "material_findings": "material findings",
        "review_failed": "review failed",
    }[review["conclusion"]]

    lines = [marker, "## OpenClaw commit review", f"Conclusion: {conclusion_text}", ""]
    findings = review.get("findings", [])
    if findings:
        lines.append("### Findings")
        for index, finding in enumerate(findings, start=1):
            title = finding.get("title", "Untitled finding").strip()
            body = finding.get("body", "").strip()
            path = finding.get("path", "").strip()
            severity = finding.get("severity", "").strip()
            details = f"**{title}**"
            if path:
                details += f" (`{path}`)"
            if severity:
                details += f" [{severity}]"
            if body:
                details += f": {body}"
            lines.append(f"{index}. {details}")
        lines.append("")
    else:
        lines.append("No material findings in the reviewed diff.")
        lines.append("")

    notes = [str(note).strip() for note in review.get("notes", []) if str(note).strip()]
    if notes:
        lines.append("### Notes")
        for note in notes:
            lines.append(f"- {note}")
    return "\n".join(lines).strip() + "\n"


def status_state(conclusion: str) -> str:
    return {
        "no_material_findings": "success",
        "material_findings": "failure",
        "review_failed": "error",
    }[conclusion]


def verify_github_webhook_signature(secret: str, body: bytes, signature_header: str) -> bool:
    if not signature_header.startswith("sha256="):
        return False
    expected = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    provided = signature_header.removeprefix("sha256=")
    return hmac.compare_digest(expected, provided)


def process_github_push_event(
    *,
    event: dict[str, Any],
    target_url_override: str | None,
    status_context: str,
) -> list[dict[str, str]]:
    if event.get("deleted"):
        return []

    ref = event.get("ref", "")
    if not ref.startswith("refs/heads/"):
        return []

    repo = event.get("repository", {}).get("full_name")
    if not repo:
        raise BridgeError("GitHub push payload is missing repository.full_name")

    github_token = env_required("OPENCLAW_REVIEW_GITHUB_TOKEN")
    agent_id = os.environ.get("OPENCLAW_REVIEW_AGENT_ID", "github-review")
    commits = [commit for commit in event.get("commits", []) if commit.get("id")]
    results: list[dict[str, str]] = []

    for commit in commits:
        sha = commit["id"]
        commit_html_url = f"https://github.com/{repo}/commit/{sha}"
        target_url = target_url_override or commit_html_url
        set_commit_status(
            repo=repo,
            sha=sha,
            state="pending",
            description="OpenClaw review queued",
            context=status_context,
            target_url=target_url,
            token=github_token,
        )
        try:
            patch, truncated = fetch_commit_patch(repo, sha, github_token)
            message = build_review_message(
                event=event,
                commit=commit,
                repo=repo,
                branch_ref=ref,
                commit_html_url=commit_html_url,
                patch=patch,
                truncated=truncated,
            )
            agent_result = run_openclaw_agent(
                message=message,
                session_key=f"{DEFAULT_SESSION_PREFIX}{sha}",
                timeout_seconds=int(os.environ.get("OPENCLAW_REVIEW_TIMEOUT_SECONDS") or "180"),
                agent_id=agent_id,
            )
            review = parse_review_json(agent_result)
            upsert_commit_comment(repo, sha, comment_body(sha, review), github_token)
            set_commit_status(
                repo=repo,
                sha=sha,
                state=status_state(review["conclusion"]),
                description=review.get("description") or "OpenClaw review complete",
                context=status_context,
                target_url=target_url,
                token=github_token,
            )
            results.append({"sha": sha, "conclusion": review["conclusion"]})
        except (BridgeError, urllib.error.URLError, subprocess.SubprocessError, ValueError) as exc:
            set_commit_status(
                repo=repo,
                sha=sha,
                state="error",
                description=f"OpenClaw review failed: {exc}",
                context=status_context,
                target_url=target_url,
                token=github_token,
            )
            results.append({"sha": sha, "conclusion": "review_failed"})

    return results


class ReviewHandler(BaseHTTPRequestHandler):
    server_version = "OpenClawReviewBridge/1.0"

    def do_POST(self) -> None:
        if self.path not in {"/hooks/agent", "/hooks/github"}:
            self.send_error(HTTPStatus.NOT_FOUND, "Not found")
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            raw_body = self.rfile.read(length)
            if self.path == "/hooks/github":
                secret = env_required("OPENCLAW_REVIEW_GITHUB_WEBHOOK_SECRET")
                signature = self.headers.get("X-Hub-Signature-256", "")
                if not verify_github_webhook_signature(secret, raw_body, signature):
                    self.send_error(HTTPStatus.UNAUTHORIZED, "Unauthorized")
                    return

                event_name = self.headers.get("X-GitHub-Event", "")
                payload = json.loads(raw_body.decode("utf-8"))
                if event_name == "ping":
                    self.send_response(HTTPStatus.OK)
                    self.send_header("Content-Type", "application/json")
                    self.end_headers()
                    self.wfile.write(json.dumps({"ok": True, "event": "ping"}).encode("utf-8"))
                    return
                if event_name != "push":
                    self.send_response(HTTPStatus.OK)
                    self.send_header("Content-Type", "application/json")
                    self.end_headers()
                    self.wfile.write(json.dumps({"ok": True, "ignored": event_name}).encode("utf-8"))
                    return

                results = process_github_push_event(
                    event=payload,
                    target_url_override=None,
                    status_context=STATUS_CONTEXT_DEFAULT,
                )
                self.send_response(HTTPStatus.OK)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"ok": True, "results": results}).encode("utf-8"))
                return

            expected = env_required("OPENCLAW_REVIEW_WEBHOOK_TOKEN")
            auth = self.headers.get("Authorization", "")
            if auth != f"Bearer {expected}":
                self.send_error(HTTPStatus.UNAUTHORIZED, "Unauthorized")
                return

            payload = json.loads(raw_body.decode("utf-8"))
            message = payload["message"]
            agent_id = payload.get("agentId") or os.environ.get("OPENCLAW_REVIEW_AGENT_ID", "github-review")
            session_key = payload.get("sessionKey") or "hook:github-review"
            timeout_seconds = int(payload.get("timeoutSeconds") or 180)
            metadata = payload.get("metadata") or {}
            repo = metadata["repository"]
            sha = metadata["sha"]
            target_url = metadata.get("target_url") or metadata.get("commit_url")
            context = metadata.get("status_context") or STATUS_CONTEXT_DEFAULT
            github_token = env_required("OPENCLAW_REVIEW_GITHUB_TOKEN")

            agent_result = run_openclaw_agent(message, session_key, timeout_seconds, agent_id)
            review = parse_review_json(agent_result)
            body = comment_body(sha, review)
            upsert_commit_comment(repo, sha, body, github_token)
            set_commit_status(
                repo=repo,
                sha=sha,
                state=status_state(review["conclusion"]),
                description=review.get("description") or "OpenClaw review complete",
                context=context,
                target_url=target_url,
                token=github_token,
            )
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(
                json.dumps(
                    {
                        "ok": True,
                        "conclusion": review["conclusion"],
                        "sha": sha,
                    }
                ).encode("utf-8")
            )
        except (BridgeError, KeyError, ValueError, urllib.error.URLError, subprocess.SubprocessError) as exc:
            self.send_response(HTTPStatus.INTERNAL_SERVER_ERROR)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"ok": False, "error": str(exc)}).encode("utf-8"))

    def log_message(self, fmt: str, *args: object) -> None:
        print(self.address_string(), "-", fmt % args, flush=True)


def main() -> None:
    port = int(os.environ.get("OPENCLAW_REVIEW_BRIDGE_PORT", "8787"))
    bind = os.environ.get("OPENCLAW_REVIEW_BRIDGE_BIND", "127.0.0.1")
    server = ThreadingHTTPServer((bind, port), ReviewHandler)
    server.serve_forever()


if __name__ == "__main__":
    main()
