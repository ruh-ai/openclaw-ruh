#!/usr/bin/env python3

from __future__ import annotations

import json
import os
import subprocess
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
import urllib.error
import urllib.request


STATUS_CONTEXT_DEFAULT = "openclaw/review"
COMMENT_MARKER_PREFIX = "<!-- openclaw-review:"
GITHUB_API_BASE = "https://api.github.com"


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


class ReviewHandler(BaseHTTPRequestHandler):
    server_version = "OpenClawReviewBridge/1.0"

    def do_POST(self) -> None:
        if self.path != "/hooks/agent":
            self.send_error(HTTPStatus.NOT_FOUND, "Not found")
            return

        expected = env_required("OPENCLAW_REVIEW_WEBHOOK_TOKEN")
        auth = self.headers.get("Authorization", "")
        if auth != f"Bearer {expected}":
            self.send_error(HTTPStatus.UNAUTHORIZED, "Unauthorized")
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
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
