# openclaw-ruh

`openclaw-ruh` is the planning and operating workspace for Ruh.ai, a governed digital-employee platform being built on top of OpenClaw.

## Why this project exists

Most AI agent efforts fail for the same reasons: they become one-off demos, accumulate customer-specific prompt logic, blur trust boundaries, and automate risky actions without enough governance. Ruh.ai is trying to build a better model.

The goal is to create digital employees that are reusable, supervised, auditable, and deployable inside real customer environments. Instead of treating agents as isolated experiments, Ruh.ai treats them as productized systems with defined workflows, artifacts, approvals, evals, and operational controls.

This repository exists to turn that vision into an executable program. It is where the product thesis, architecture, source material, operating plans, and supporting automation are kept in one place so the team can move from concept to implementation without losing the reasoning behind the platform.

## What we are building

Ruh.ai is positioned as a horizontal control plane for governed digital employees.

- OpenClaw provides the runtime layer: agents, workspaces, sessions, routing, tools, hooks, cron, and sandbox controls.
- Ruh.ai adds the control plane: pack definitions, overlay compilation, orchestration, approvals, secrets brokerage, evals, analytics, and deployment governance.
- The reusable product unit is an employee pack, not a bespoke agent setup for each customer.
- Customer-specific mappings belong in tenant overlays, not in shared pack source.
- Every deployment should respect a tenant trust boundary instead of relying on a shared multi-tenant runtime bus.

In practical terms, Ruh.ai is trying to make AI workers feel less like ad hoc automation and more like governed software products.

## Mission and operating principles

- Build governed digital employees, not black-box autonomy.
- Start with narrow, measurable workflows before expanding scope.
- Keep systems of record such as GitHub, Linear, Slack, Sentry, Procore, and SharePoint at the center of the workflow.
- Require human approvals for medium-risk and high-risk actions.
- Preserve auditability, replayability, and security as core product behavior, not cleanup work.
- Generalize through packs and overlays so new customer value comes from reusable platform assets rather than one-off custom logic.

## Why this repository matters

This is not the application runtime or product implementation repository yet. It is the docs-first workspace used to shape and operate the program:

- raw source documents live under `docs/01 Sources/`
- execution plans, backlog structure, and operating material live under `docs/02 Operations/`
- generated notes under `docs/Knowledge Base/` make the source set easier to navigate and review
- helper scripts keep the knowledge base and Linear planning assets synchronized
- repo-local skills under `skills/` keep agent workflows consistent for contributors working inside this workspace

## Current focus

The current V1 direction is:

- prove the platform with the AI BuildOps wedge first
- keep the architecture reusable enough to support Construction Project Operations as the second pack
- preserve the boundary that OpenClaw is the runtime plane and Ruh.ai is the control plane
- treat security hardening, approval posture, and trust-boundary isolation as first-order requirements

## Start here

- [Project Brief](docs/Knowledge%20Base/Project%20Knowledge/Project%20Brief.md) for the shortest summary of the product thesis
- [Build Plan](docs/02%20Operations/Build%20Plan.md) for the current delivery order and execution model
- [Source Library](docs/01%20Sources/README.md) for the raw source-of-truth document set
- [Operations](docs/02%20Operations/README.md) for planning and operational assets
- [Knowledge Base Home](docs/Home.md) for the generated Obsidian entry point

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

If you only want to read the material, no setup is required. If you want to use the repo tooling locally, install the Node and Python dependencies first.

Install the repo-local Node tooling:

```bash
npm install
```

Install the Python dependencies used by the knowledge-base sync script:

```bash
python3 -m pip install pypdf PyYAML
```

Regenerate the knowledge base after changing files under `docs/`:

```bash
python3 scripts/sync_obsidian_kb.py
```

## Source-of-truth rules

- `docs/01 Sources/` contains the raw project inputs and remains the source of truth.
- `docs/Knowledge Base/` contains generated or curated synthesis for faster onboarding and review.
- `docs/02 Operations/` contains the working execution layer for planning, backlog management, and delivery coordination.
- When the source documents or curated planning notes change materially, regenerate the knowledge base so `docs/Home.md` and related generated notes stay current.

## Linear tooling

This repo includes a pinned copy of `@schpet/linear-cli` and repo-local defaults in `.linear.toml`.

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

## Shared Codex skill

This repo includes a reusable project-local skill at `skills/openclaw-ruh-workspace/`. It captures the repo's reading order, source-of-truth rules, knowledge-base regeneration flow, and repo-local Linear workflow so contributors can reuse the same operating model.

## Project status

This repository is being opened in stages. The current public history focuses on product definition, source artifacts, operational planning, and tooling that support the early Ruh.ai workstream. The platform implementation itself is still ahead of this repo's current scope.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development workflow, contribution expectations, and pull request guidance.

Community participation is governed by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

For security disclosures, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE).
