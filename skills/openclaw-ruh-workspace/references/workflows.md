# OpenClaw Ruh Workflow Reference

## Repository Map

- `README.md`: top-level repo overview and setup.
- `CONTRIBUTING.md`: contributor expectations and validation rules.
- `docs/Home.md`: generated vault entry point. Do not hand-edit.
- `docs/01 Sources/README.md`: source library overview.
- `docs/02 Operations/README.md`: operations-area overview.
- `docs/02 Operations/Build Plan.md`: phased implementation and rollout plan.
- `docs/02 Operations/Linear/README.md`: Linear operating model, project defaults, and import guidance.
- `docs/Knowledge Base/Project Knowledge/Project Knowledge Hub.md`: fastest reading path for later sessions.
- `scripts/sync_obsidian_kb.py`: regenerate `docs/Home.md`, `docs/Knowledge Base/Documents/`, `docs/Knowledge Base/Indexes/`, and `docs/Knowledge Base/Maps/`.
- `scripts/import_linear_backlog.py`: seed or bulk-import backlog issues into Linear from CSV.
- `.linear.toml`: repo-local defaults for `@schpet/linear-cli`.
- `package.json`: repo-local Linear CLI scripts.

## Project Snapshot

- Treat Ruh.ai as a digital employee operating system layered on top of OpenClaw.
- Treat the employee pack as the reusable unit.
- Treat tenant overlays as the customer-specific binding layer.
- Remember the first delivery domains are AI BuildOps and Construction Project Operations.
- Preserve the pilot-first delivery model: monitor, draft, approval, then constrained autonomy.

## Common Commands

Install repo-local Node tooling:

```bash
npm install
```

Install the Python dependencies used by the sync script:

```bash
python3 -m pip install pypdf PyYAML
```

Regenerate the knowledge base after changing `docs/`:

```bash
python3 scripts/sync_obsidian_kb.py
```

Authenticate the repo-local Linear CLI:

```bash
npm run linear:auth
npm run linear:whoami
```

Inspect the current Linear project state:

```bash
npm run linear:projects
npm run linear -- project view 361c1092df93
npm run linear -- milestone list --project 361c1092df93
npm run linear -- label list
npm run linear -- issue list --all-assignees --all-states --project openclaw-ruh --no-pager
```

Dry-run the backlog importer:

```bash
python3 scripts/import_linear_backlog.py \
  --project "https://linear.app/ruh-ai/project/openclaw-ruh-361c1092df93/overview" \
  --csv "docs/02 Operations/Linear/openclaw-ruh-backlog.csv" \
  --create-labels
```

Apply the backlog import after the dry run looks correct:

```bash
python3 scripts/import_linear_backlog.py \
  --project "https://linear.app/ruh-ai/project/openclaw-ruh-361c1092df93/overview" \
  --csv "docs/02 Operations/Linear/openclaw-ruh-backlog.csv" \
  --create-labels \
  --set-priority \
  --apply
```

## Task Checklists

### Update Documents

1. Edit the raw source, curated note, or operations note instead of a generated file.
2. Run `python3 scripts/sync_obsidian_kb.py` if anything under `docs/` changed.
3. Review the generated diffs for `docs/Home.md`, `docs/Knowledge Base/Documents/`, `docs/Knowledge Base/Indexes/`, and `docs/Knowledge Base/Maps/`.
4. Keep the generated output in the same change as the source edit.

### Update Linear

1. Verify auth with `npm run linear:whoami`.
2. Inspect the current project, milestone, label, and issue state before writing.
3. Apply changes with `npm run linear -- ...`.
4. Re-read the affected objects after the write.
5. Update `docs/02 Operations/Build Plan.md` if the execution plan changed materially.
6. Update `docs/02 Operations/Linear/README.md` if the Linear operating model changed.

### Update The Operating Workflow

1. Change the relevant docs in `README.md`, `CONTRIBUTING.md`, or `docs/02 Operations/Linear/README.md`.
2. Keep the shared skill in `skills/openclaw-ruh-workspace/` aligned with the new workflow.
3. Re-run the skill validator when the skill files change.
