import hashlib
import hmac
import importlib.util
import os
import unittest
from unittest import mock


MODULE_PATH = "/tmp/openclaw-ruh-main-sync/ops/gcp/openclaw_review_bridge.py"
SPEC = importlib.util.spec_from_file_location("openclaw_review_bridge", MODULE_PATH)
BRIDGE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(BRIDGE)


class OpenClawReviewBridgeTests(unittest.TestCase):
    def test_verify_github_webhook_signature_accepts_valid_signature(self) -> None:
        payload = b'{"zen":"ship it"}'
        secret = "topsecret"
        signature = "sha256=" + hmac.new(
            secret.encode("utf-8"),
            payload,
            hashlib.sha256,
        ).hexdigest()

        self.assertTrue(
            BRIDGE.verify_github_webhook_signature(
                secret=secret,
                body=payload,
                signature_header=signature,
            )
        )

    @mock.patch.dict(
        os.environ,
        {
            "OPENCLAW_REVIEW_GITHUB_TOKEN": "github-token",
            "OPENCLAW_REVIEW_AGENT_ID": "github-review",
        },
        clear=False,
    )
    def test_process_github_push_event_reviews_each_commit(self) -> None:
        event = {
            "deleted": False,
            "ref": "refs/heads/main",
            "before": "before-sha",
            "after": "after-sha",
            "compare": "https://github.com/ruh-ai/openclaw-ruh/compare/before...after",
            "repository": {"full_name": "ruh-ai/openclaw-ruh"},
            "commits": [
                {
                    "id": "abc123",
                    "message": "Add review bridge",
                    "timestamp": "2026-03-08T22:00:00Z",
                    "author": {"name": "Prasanjit", "email": "engage@rapidinnovation.io"},
                    "added": ["ops/gcp/openclaw_review_bridge.py"],
                    "modified": [],
                    "removed": [],
                }
            ],
        }

        statuses = []
        comments = []

        def record_status(**kwargs):
            statuses.append(kwargs)

        def record_comment(repo, sha, body, token):
            comments.append({"repo": repo, "sha": sha, "body": body, "token": token})

        with mock.patch.object(BRIDGE, "fetch_commit_patch", return_value=("diff --git a/x b/x", False)), mock.patch.object(
            BRIDGE,
            "run_openclaw_agent",
            return_value={"result": {"payloads": [{"text": '{"conclusion":"no_material_findings","description":"looks good","findings":[],"notes":["ok"]}'}]}},
        ), mock.patch.object(BRIDGE, "set_commit_status", side_effect=record_status), mock.patch.object(
            BRIDGE, "upsert_commit_comment", side_effect=record_comment
        ):
            result = BRIDGE.process_github_push_event(
                event=event,
                target_url_override=None,
                status_context="openclaw/review",
            )

        self.assertEqual(result, [{"sha": "abc123", "conclusion": "no_material_findings"}])
        self.assertEqual(len(statuses), 2)
        self.assertEqual(statuses[0]["state"], "pending")
        self.assertEqual(statuses[1]["state"], "success")
        self.assertEqual(comments[0]["sha"], "abc123")
        self.assertIn("OpenClaw commit review", comments[0]["body"])

    @mock.patch.dict(
        os.environ,
        {
            "OPENCLAW_REVIEW_GITHUB_TOKEN": "github-token",
            "OPENCLAW_REVIEW_AGENT_ID": "github-review",
        },
        clear=False,
    )
    def test_process_github_push_event_marks_error_when_review_fails(self) -> None:
        event = {
            "deleted": False,
            "ref": "refs/heads/main",
            "before": "before-sha",
            "after": "after-sha",
            "compare": "https://github.com/ruh-ai/openclaw-ruh/compare/before...after",
            "repository": {"full_name": "ruh-ai/openclaw-ruh"},
            "commits": [
                {
                    "id": "deadbeef",
                    "message": "Break review path",
                    "timestamp": "2026-03-08T22:00:00Z",
                    "author": {"name": "Prasanjit", "email": "engage@rapidinnovation.io"},
                    "added": [],
                    "modified": ["ops/gcp/openclaw_review_bridge.py"],
                    "removed": [],
                }
            ],
        }

        statuses = []

        def record_status(**kwargs):
            statuses.append(kwargs)

        with mock.patch.object(
            BRIDGE,
            "fetch_commit_patch",
            side_effect=BRIDGE.BridgeError("patch fetch failed"),
        ), mock.patch.object(BRIDGE, "set_commit_status", side_effect=record_status):
            result = BRIDGE.process_github_push_event(
                event=event,
                target_url_override=None,
                status_context="openclaw/review",
            )

        self.assertEqual(result, [{"sha": "deadbeef", "conclusion": "review_failed"}])
        self.assertEqual(len(statuses), 2)
        self.assertEqual(statuses[0]["state"], "pending")
        self.assertEqual(statuses[1]["state"], "error")
        self.assertIn("patch fetch failed", statuses[1]["description"])


if __name__ == "__main__":
    unittest.main()
