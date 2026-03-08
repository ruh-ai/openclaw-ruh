# Contributing to openclaw-ruh

Thanks for contributing. This repository currently mixes planning documents, generated knowledge artifacts, and helper scripts, so small and well-scoped changes are easier to review and land safely.

## Before you start

- Open an issue before starting larger changes, especially if they affect repository structure, generated docs, or the Linear workflow.
- Keep pull requests focused on one change area when possible.
- Do not commit secrets, API tokens, local workspace state, or machine-specific files.

## Local setup

Install the repo-local Node tooling:

```bash
npm install
```

Install the Python dependencies used by the helper scripts:

```bash
python3 -m pip install pypdf PyYAML
```

## Making changes

- If you update files under `docs/`, regenerate the knowledge base with `python3 scripts/sync_obsidian_kb.py`.
- If you change the backlog import flow, validate `scripts/import_linear_backlog.py` in dry-run mode before proposing workflow changes.
- Keep generated files and their source changes in the same pull request.
- Update `README.md`, `CONTRIBUTING.md`, or other public-facing docs when the contributor workflow changes.

## Pull requests

- Branch from `main`.
- Link the relevant issue in the pull request description when one exists.
- Explain what changed, why it changed, and any follow-up work that remains.
- Include validation notes. For this repo, that usually means the exact script or command you ran and what you verified manually.
- Prefer smaller PRs over large mixed changes.

## Review expectations

- At least one approving review is required before merging to `main`.
- Resolve open review conversations before merge.
- Maintainers may ask contributors to split broad PRs into smaller units.

## License

By contributing to this repository, you agree that your contributions will be licensed under the Apache License, Version 2.0.
