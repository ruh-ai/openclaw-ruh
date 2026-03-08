# OpenClaw Commit Review Automation

This document defines the automated commit-review path for `ruh-ai/openclaw-ruh`.

## Goal

Every pushed commit should be dispatched to an OpenClaw agent running on a GCP-hosted Linux server. OpenClaw reviews the commit diff, posts a commit comment, and updates the GitHub commit status context `openclaw/review`.

## Architecture

1. GitHub repository webhooks send every `push` event directly to the review bridge on the GCP VM.
2. The review bridge verifies the GitHub webhook signature.
3. For each commit in the push event, the bridge:
   - sets `openclaw/review` to `pending`
   - fetches the commit patch from the GitHub API
   - invokes `openclaw agent` locally against the existing gateway
4. The review bridge on the VM:
   - verifies the bearer token
   - parses the structured JSON review returned by OpenClaw
   - upserts a commit comment on the reviewed SHA
   - sets the final GitHub status to `success`, `failure`, or `error`
5. A separate GitHub Actions workflow remains available as a manual `workflow_dispatch` replay path. It checks out the repo, reconstructs the selected commit patch from git history, and posts a signed request to the same review bridge.

## Repository configuration

The manual replay workflow lives at `.github/workflows/openclaw-commit-review.yml`.

Required GitHub repository secrets for the manual replay workflow:

- `OPENCLAW_REVIEW_WEBHOOK_URL`: full HTTPS URL for the review bridge endpoint, usually `https://<host>/hooks/agent`
- `OPENCLAW_REVIEW_WEBHOOK_TOKEN`: shared bearer token that protects the review bridge

Optional GitHub repository variables:

- `OPENCLAW_REVIEW_AGENT_ID`: OpenClaw agent id to target. Default: `github-review`
- `OPENCLAW_REVIEW_TIMEOUT_SECONDS`: OpenClaw webhook timeout. Default: `180`
- `OPENCLAW_REVIEW_MAX_PATCH_CHARS`: max patch size included in the webhook message. Default: `120000`
- `OPENCLAW_REVIEW_SESSION_PREFIX`: session key prefix for isolated review sessions. Default: `hook:github-review:`
- `OPENCLAW_REVIEW_COMMIT_STATUS_TARGET_URL`: optional URL to attach to the pending or error GitHub status

## GCP server setup

Recommended target: a small Linux VM on Compute Engine with OpenClaw already running locally.

Minimum server responsibilities:

- run OpenClaw continuously on loopback
- run the review bridge locally
- expose only the review bridge entry point over HTTPS
- authenticate GitHub write-back with `OPENCLAW_REVIEW_GITHUB_TOKEN`
- hold the model provider credentials OpenClaw needs to reason over diffs

Recommended host preparation:

1. Ensure the existing OpenClaw gateway is healthy on loopback.
2. Put the environment variables from `ops/gcp/openclaw-review.env.example` into a real env file on the server.
3. Install the bridge from `ops/gcp/openclaw_review_bridge.py`.
4. Install the systemd unit from `ops/gcp/openclaw-review-bridge.service`.
5. Put a reverse proxy with TLS in front of the server and forward `/hooks/agent` and `/hooks/github` to the bridge on `127.0.0.1:8787`.
6. Configure a GitHub repository webhook:
   - payload URL: `https://<host>/hooks/github`
   - content type: `application/json`
   - secret: same value as `OPENCLAW_REVIEW_GITHUB_WEBHOOK_SECRET`
   - events: `Just the push event`

## OpenClaw gateway requirements

The gateway must be locally reachable from the bridge process. The bridge shells into `openclaw agent` locally, so the agent itself does not need direct GitHub CLI access.

Expected OpenClaw behavior on each request:

- review only the supplied commit diff
- focus on correctness, security, auth, data loss, and operational regressions
- return structured JSON only
- avoid style-only feedback

## GitHub token scope on the server

The `OPENCLAW_REVIEW_GITHUB_TOKEN` used on the server should be a fine-grained token or GitHub App installation token with access to:

- commit statuses
- commit comments
- repository contents read access

For a simple first version, a fine-grained token scoped to `ruh-ai/openclaw-ruh` is sufficient.

## Operational notes

- The repository webhook is the automatic path for every pushed commit.
- The GitHub Actions workflow is the manual replay path and only dispatches when the bearer-token secrets are configured.
- If dispatch to OpenClaw fails, the workflow sets the commit status to `error`.
- If the patch is very large, the dispatch script truncates it and tells OpenClaw to treat the review as partial.
- The branch protection rule should not require `openclaw/review` until the server-side path is deployed and stable.

## Validation checklist

1. Confirm the review bridge answers `401` without a valid signature on `/hooks/github`.
2. Push a test commit to a non-critical branch.
3. Confirm the repository webhook delivery succeeds.
4. Confirm the commit status changes from `pending` to a final state.
5. Confirm a commit comment appears on the pushed SHA.
6. Run the manual replay workflow and confirm the comment is updated rather than duplicated.
