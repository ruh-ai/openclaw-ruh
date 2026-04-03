# Agent Factory — Development Guidelines

## Agent Registry

| Agent | Role | Skills |
|-------|------|--------|
| architect | Requirement analysis, skill graph decomposition | architect, data-ingestion-openclaw, clawhub-search, lobster-gen |
| builder | System generation from approved skill graphs | data-ingestion-openclaw, file-ops, git-ops |
| tester | Validation of generated systems | data-ingestion-openclaw, test-runner |
| deployer | GitHub push and Daytona sandbox provisioning | git-ops, github-api, daytona-sdk |

## Communication Flow

The architect orchestrates the full pipeline sequentially. Subagents cannot chain-spawn other subagents.

```
Web UI → architect (sessions_send)
architect → builder (sessions_spawn) → builder replies build_complete (sessions_send)
architect → tester (sessions_spawn)  → tester replies test_complete (sessions_send)
architect → deployer (sessions_spawn) → deployer replies deploy_complete (sessions_send)
architect → Web UI (sessions_send: deploy_complete with repo_url)
```

## Coding Standards

- All skills use OpenClaw SKILL.md format with YAML frontmatter
- Every SKILL.md must include `metadata.openclaw.requires.env` for data-ingestion vars
- Lobster workflows must have `write_results` as terminal step
- Generated systems must be self-contained (all files in one directory)

## Testing

- Static validation: SKILL.md syntax, openclaw.json structure, workflow DAG validity
- Integration: Schema provisioning, ingestion trigger, result write verification
- Cleanup: Always delete test data after validation
