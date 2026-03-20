---
name: github-api
version: 1.0.0
description: "GitHub API operations via gh CLI: create repositories, manage collaborators, create releases. Used by the deployer agent to publish generated systems."
user-invocable: false
metadata:
  openclaw:
    requires:
      bins: [gh]
      env: [GITHUB_TOKEN]
    primaryEnv: GITHUB_TOKEN
---

# GitHub API Skill

GitHub operations for the deployer agent using the `gh` CLI.

## Operations

### Create Public Repository
```bash
gh repo create ${GITHUB_ORG}/<system-name> \
  --public \
  --description "<system description>" \
  --source output/<system-name> \
  --push
```

### Check if Repo Exists
```bash
gh repo view ${GITHUB_ORG}/<system-name> --json name 2>/dev/null && echo "exists" || echo "not_found"
```

### Create Release
```bash
cd output/<system-name>
gh release create v1.0.0 \
  --title "v1.0.0 - Initial Release" \
  --notes "Auto-generated multi-agent system.

Skills: <skill-list>
Workflow: <workflow-name>
Data ingestion: wired for read/write"
```

### Add Collaborator
```bash
gh api repos/${GITHUB_ORG}/<system-name>/collaborators/<username> \
  -X PUT -f permission=push
```

### Get Repo URL
```bash
gh repo view ${GITHUB_ORG}/<system-name> --json url -q .url
```

## Rules

- Always create repos as **public** — generated systems need to be accessible by collaborators
- Always set a descriptive repo description from the original requirement
- Include the data-ingestion service URL in the repo description for discoverability
