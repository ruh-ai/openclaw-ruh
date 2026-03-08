# Linear setup for Ruh.ai

This folder turns the current strategy docs into a usable Linear operating model.

Confirmed target

- Existing Linear project URL: `https://linear.app/ruh-ai/project/openclaw-ruh-361c1092df93/overview`
- Recommended usage: keep one project, `openclaw-ruh`, and organize work with labels and views instead of splitting the repo into multiple Linear projects.
- Primary execution plan: [../Build Plan.md](/Users/prasanjitdey/projects/openclaw-ruh/docs/02%20Operations/Build%20Plan.md)

CLI setup in this repo

- CLI: `@schpet/linear-cli` pinned in [package.json](/Users/prasanjitdey/projects/openclaw-ruh/package.json)
- Repo config: [.linear.toml](/Users/prasanjitdey/projects/openclaw-ruh/.linear.toml)
- Install: `npm install`
- Auth with stored credentials: `npm run linear:auth`
- Or use env auth for one session: `export LINEAR_API_KEY=lin_api_...`
- Verify access: `npm run linear:whoami`
- List projects: `npm run linear:projects`
- Run arbitrary Linear commands: `npm run linear -- issue list`, `npm run linear -- project list`
- Team default: `RUH`
- Project default: `openclaw-ruh` (`361c1092df93`)

Obsidian sync rule

- The Obsidian plan note is [../Build Plan.md](/Users/prasanjitdey/projects/openclaw-ruh/docs/02%20Operations/Build%20Plan.md).
- Whenever the project development plan changes materially in Linear, update that note in the same session.
- Material plan changes include milestone changes, backlog restructuring, current or next cycle reshaping, and dependency changes that affect execution order.
- Routine issue status or assignment changes do not require a plan-note rewrite unless they change the actual execution plan.
- If the Linear operating model changes, update both the project in Linear and this README.

Recommended Linear structure

- Initiative: `Ruh.ai V1`
- Project: `Platform Core`
  Summary: control plane, runtime plane, data model, deployment compiler, workflow orchestration, approvals, secrets, observability, and evals.
- Project: `AI BuildOps Pack + Overlay`
  Summary: reference pack plus the GitHub + Linear + Slack + Sentry tenant overlay.
- Project: `Construction Pack + Overlay`
  Summary: construction project operations pack plus the Procore + SharePoint + Teams tenant overlay.
- Project: `Design Partner Pilot`
  Summary: qualification, baseline, rollout phases, scorecards, approvals, and promotion gates.

Suggested placeholder teams

- `CORE`: platform and runtime work
- `SOLUTIONS`: packs, overlays, and connector behavior
- `PILOT`: implementation, rollout, and design-partner execution

Suggested label groups

- Track: `platform`, `ai-buildops`, `construction`, `pilot`
- Capability: `runtime`, `pack-system`, `workflow`, `artifact`, `connector`, `approvals`, `secrets`, `evals`, `observability`
- Scope: `mvp`, `overlay`, `design-partner`

Suggested views

- `MVP Critical Path`: project in `Platform Core` or `Design Partner Pilot`, priority `high` or `urgent`
- `Connector Readiness`: label `connector`
- `Pack Quality`: labels `pack-system` or `evals`
- `Pilot Gates`: project `Design Partner Pilot`

How to use `initial-backlog.csv`

1. Create the four projects above in Linear first.
2. Export a sample issue CSV from your workspace so you have a template with your exact team names and workflow states.
3. Copy the rows from [initial-backlog.csv](/Users/prasanjitdey/projects/openclaw-ruh/docs/02%20Operations/Linear/initial-backlog.csv) into that template, or map the columns manually during import.
4. Replace the placeholder team names if your workspace does not use `CORE`, `SOLUTIONS`, and `PILOT`.
5. If your workflow uses `Todo` instead of `Backlog`, bulk-replace that status before import.

How to use the existing `openclaw-ruh` project instead

1. Keep the existing Linear project and do not create the four extra projects.
2. Import [openclaw-ruh-backlog.csv](/Users/prasanjitdey/projects/openclaw-ruh/docs/02%20Operations/Linear/openclaw-ruh-backlog.csv) into that project, or paste its rows into a CSV exported from your workspace.
3. Use labels to separate the workstreams:
   `platform`, `ai-buildops`, `construction`, and `pilot`.
4. Optionally create project milestones for:
   `Platform Core`, `AI BuildOps Pack + Overlay`, `Construction Pack + Overlay`, and `Design Partner Pilot`.
5. If your team names or statuses differ, bulk-replace them before import.

Direct API import

1. Set a Linear API token in `LINEAR_API_KEY` or `LINEAR_API_TOKEN`.
2. Run a dry-run first:

```bash
python3 scripts/import_linear_backlog.py \
  --project "https://linear.app/ruh-ai/project/openclaw-ruh-361c1092df93/overview" \
  --csv "docs/02 Operations/Linear/openclaw-ruh-backlog.csv" \
  --create-labels
```

3. Apply once the dry-run looks clean:

```bash
python3 scripts/import_linear_backlog.py \
  --project "https://linear.app/ruh-ai/project/openclaw-ruh-361c1092df93/overview" \
  --csv "docs/02 Operations/Linear/openclaw-ruh-backlog.csv" \
  --create-labels \
  --set-priority \
  --apply
```

What the script does

- Resolves the Linear project from the URL, slug, name, or project ID.
- Maps CSV team names to Linear teams by key or name.
- Uses the requested status when a matching workflow state exists; otherwise it falls back to the team default state.
- Creates missing labels when `--create-labels` is set.
- Skips duplicate issue titles already present in the target project.

Notes

- The backlog is derived from the current docs set in `docs/`.
- It assumes the first management layer should be product execution, not low-level task decomposition.
- I could not verify the current project contents because the Linear web session in this environment is not authenticated.
- Once the workspace is authenticated, these issues can be created directly instead of imported.
- If the broader CLI is authenticated, prefer it for day-to-day issue/project work and keep `scripts/import_linear_backlog.py` for backlog seeding or bulk bootstrap.
