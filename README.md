# openclaw-ruh

`openclaw-ruh` is the working repository for the Ruh.ai platform initiative built on top of OpenClaw. It combines source documents, an Obsidian-friendly knowledge base, execution planning artifacts, and small automation scripts used to keep planning assets synchronized.

## What is in this repository

- Product, architecture, rollout, and overlay source material under `docs/01 Sources/`
- Operational planning assets, including Linear backlog data, under `docs/02 Operations/`
- A generated knowledge base for faster onboarding and review under `docs/Knowledge Base/`
- Helper scripts for regenerating knowledge artifacts and bootstrapping Linear from CSV
- A shared project-local Codex skill under `skills/` for repo-specific agent workflows

## Repository layout

```text
.
|-- docs/
|   |-- 01 Sources/
|   |-- 02 Operations/
|   |-- 98 Templates/
|   |-- 99 Inbox/
|   `-- Knowledge Base/
|-- skills/
|-- scripts/
|-- package.json
`-- .linear.toml
```

## Quick start

Install the repo-local Node tooling:

```bash
npm install
```

Install the Python dependencies used by the sync script:

```bash
python3 -m pip install pypdf PyYAML
```

Regenerate the knowledge base after changing files under `docs/`:

```bash
python3 scripts/sync_obsidian_kb.py
```

## Shared Codex skill

This repo includes a reusable project-local skill at `skills/openclaw-ruh-workspace/`. It captures the repo's reading order, source-of-truth rules, knowledge-base regeneration flow, and repo-local Linear workflow so other contributors can reuse the same project instructions.

## Linear tooling

This repo includes a pinned copy of `@schpet/linear-cli` plus repo-local defaults in `.linear.toml`.

Authenticate and verify access:

```bash
npm run linear:auth
npm run linear:whoami
```

Useful commands:

```bash
npm run linear:projects
npm run linear -- issue list
npm run linear -- project list
```

To seed a Linear project from the backlog CSV, use:

```bash
python3 scripts/import_linear_backlog.py \
  --project "https://linear.app/ruh-ai/project/openclaw-ruh-361c1092df93/overview" \
  --csv "docs/02 Operations/Linear/openclaw-ruh-backlog.csv" \
  --create-labels
```

Add `--apply` once the dry run looks correct.

## Notes on the knowledge base

The `docs/` directory is structured as an Obsidian vault. `docs/Home.md` is the generated entry point, `docs/Knowledge Base/` contains synthesized notes, and `docs/01 Sources/` remains the source of truth for raw inputs.

## Project status

This repository is being opened in stages. The current public history includes planning material, source artifacts, and operational tooling that were used to shape the early Ruh.ai workstream.

## Contributing

See `CONTRIBUTING.md` for development workflow, contribution expectations, and pull request guidance.

Community participation is governed by `CODE_OF_CONDUCT.md`.

For security disclosures, follow `SECURITY.md` instead of opening a public issue.

## License

Licensed under the Apache License, Version 2.0. See `LICENSE`.
