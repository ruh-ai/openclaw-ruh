# SPEC: Agent as Software Project

[[000-INDEX|<- Index]] | [[008-agent-builder-ui]] | [[001-architecture]] | [[011-key-flows]] | [[003-sandbox-lifecycle]] | [[005-data-models]]

## Status

draft

## Summary

Treats each agent as a persistent software project with one GitHub repo, branch-based improvements, PR-driven reviews, and a full development lifecycle. First build creates the repo. Subsequent improvements happen on feature branches with PRs back to main. The agent's repo is its permanent home — never recreated, always evolved.

This replaces the current throwaway-repo model where every Ship creates a new `agent-name-{random}` repo with no connection to the agent record.

## Related Notes

- [[008-agent-builder-ui]] — Builder UI, lifecycle stages, ship flow
- [[001-architecture]] — System design, sandbox model, key decisions
- [[011-key-flows]] — Agent creation and deploy flows end-to-end
- [[003-sandbox-lifecycle]] — Container provisioning, workspace, git clone
- [[005-data-models]] — Agent record schema, marketplace models
- [[SPEC-agent-creation-v3-build-pipeline]] — V3/V4 build pipeline that produces the code
- [[SPEC-gateway-ws-proxy]] — WebSocket proxy for real-time build events

## Problem

### No persistent repo
Every Ship creates a new GitHub repo with a random suffix (`armond-hotel-manager-4ekg`). The agent record doesn't store `repo_url`. There's no way to push updates to the same repo. Each ship is a throwaway export.

### No improvement workflow
After an agent is built, there's no mechanism to modify it incrementally. "Add webhook support" means rebuilding from scratch. There are no branches, no PRs, no diffs, no code review.

### No version history
The agent has no commit history. You can't see what changed between versions. You can't roll back a bad change. You can't audit who changed what and when.

### No project discipline
Real software projects have: persistent repos, branches for features, PRs for review, CI for testing, main branch as production. Agents have none of this.

## Specification

### 1. One Agent = One Repo

Each agent gets a permanent GitHub repo created on first ship. The repo URL is stored on the agent record and never changes.

#### Schema changes

```sql
-- New columns on agents table
ALTER TABLE agents ADD COLUMN IF NOT EXISTS repo_url TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS repo_owner TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS repo_name TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS repo_default_branch TEXT DEFAULT 'main';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS current_branch TEXT DEFAULT 'main';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS repo_created_at TIMESTAMPTZ;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS repo_last_pushed_at TIMESTAMPTZ;
```

#### Repo naming
- First ship: `{owner}/{agent-name-slugified}` — clean name, no random suffix
- If name conflicts: append short hash of agent ID (`armond-hotel-manager-a1b2`)
- Owner comes from the GitHub PAT's authenticated user

#### First ship flow
```
User clicks Ship
    |
    v
Agent has repo_url? ──NO──> Create repo (owner/agent-name)
    |                          Store repo_url, repo_owner, repo_name on agent
    |                          Push workspace to main branch
    YES                        
    |
    v
Push to existing repo (commit on main or current branch)
```

### 2. Improvement Cycle = Branch + PR

When a user wants to improve an existing agent, the system creates a feature branch, runs the build on that branch, and opens a PR.

#### Improvement table

```sql
CREATE TABLE agent_improvements (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL REFERENCES agents(id),
    title TEXT NOT NULL,
    description TEXT,
    spec_path TEXT,                    -- workspace path to the improvement spec
    branch_name TEXT NOT NULL,         -- feature/invoice-support
    base_branch TEXT NOT NULL DEFAULT 'main',
    pr_number INTEGER,
    pr_url TEXT,
    pr_state TEXT DEFAULT 'draft',     -- draft, open, merged, closed
    status TEXT NOT NULL DEFAULT 'planning',
    -- Lifecycle: planning → building → pr_open → reviewing → merged → deployed → rolled_back
    build_manifest_path TEXT,          -- .openclaw/plan/build-manifest.json on the branch
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    merged_at TIMESTAMPTZ,
    deployed_at TIMESTAMPTZ
);
```

#### Improvement flow

```
User: "Add webhook support to Armond"
    |
    v
[Think] Research webhook patterns for this agent's domain
    |
    v
[Plan] Generate improvement spec
    |-- What skills to add/modify
    |-- What API endpoints change
    |-- What schema migrations to add (incremental: 003_add_webhooks.sql)
    |-- What dashboard pages change
    |
    v
[Build] Run specialists on feature branch
    |-- git checkout -b feature/webhook-support
    |-- Specialists write ONLY the changes (not full rebuild)
    |-- New migration: db/migrations/003_add_webhooks.sql
    |-- New skill: skills/webhook-handler/handler.ts
    |-- Modified route: backend/routes/webhooks.ts
    |
    v
[PR] Create pull request
    |-- feature/webhook-support → main
    |-- Description from the improvement spec
    |-- Diff shows exactly what changed
    |-- Link back to agent builder UI
    |
    v
[Review] User reviews PR
    |-- In GitHub: read the diff, comment, request changes
    |-- In builder UI: see PR status, click to open in GitHub
    |-- CI runs tests on the PR branch (if configured)
    |
    v
[Merge] User merges PR
    |-- Main branch updated
    |-- agent_improvements.status → merged
    |
    v
[Deploy] Sync workspace from main
    |-- Container pulls latest main
    |-- New migration runs (003_add_webhooks.sql)
    |-- Services restart with new code
    |-- agent_improvements.status → deployed
```

### 3. Incremental Builder

The improvement build is fundamentally different from the initial build:

| | Initial Build | Improvement Build |
|---|---|---|
| **Input** | Architecture plan (from scratch) | Improvement spec (delta only) |
| **Output** | Full workspace | Only changed/new files |
| **Migrations** | `001_initial.sql` | `003_add_webhooks.sql` (incremental) |
| **Skills** | All skills | Only new/modified skills |
| **Base** | Empty workspace | Existing main branch |
| **Branch** | `main` | `feature/{name}` |
| **Result** | Direct push | Pull request |

The incremental builder:
1. Clones the agent's repo (`main` branch) into the workspace
2. Creates a feature branch
3. Reads the existing code to understand what's there
4. Generates ONLY the delta — new files, modified files, new migrations
5. Commits the changes
6. Pushes the branch
7. Opens a PR

### 4. Workspace-Repo Sync

The container workspace and the GitHub repo stay in sync:

```
GitHub repo (source of truth)
    |
    |-- git pull origin main
    v
Container workspace (~/.openclaw/workspace)
    |
    |-- Agent runs here
    |-- Skills execute, backend serves, dashboard renders
    |
    |-- On improvement: git checkout feature/xxx, build, push
    v
GitHub repo (PR created)
    |
    |-- PR merged
    v
Container workspace
    |-- git pull origin main
    |-- Run new migrations
    |-- Restart services
```

### 5. API Endpoints

#### Ship (first time or update)
```
POST /api/agents/:id/ship
Body: { githubToken: string, commitMessage?: string }
Response: { ok, repoUrl, commitSha, filesPushed, isFirstShip }

- If agent.repo_url is null: creates repo, pushes, stores repo_url
- If agent.repo_url exists: commits and pushes to main
```

#### Start improvement
```
POST /api/agents/:id/improvements
Body: { title: string, description: string }
Response: { id, branchName, status: "planning" }

- Creates agent_improvements record
- Creates branch in the repo
- Switches container workspace to the branch
```

#### Create PR
```
POST /api/agents/:id/improvements/:improvementId/pr
Body: { title?: string, body?: string }
Response: { prNumber, prUrl }

- Pushes current branch to GitHub
- Creates PR via GitHub API
- Stores pr_number, pr_url on improvement record
```

#### Sync after merge
```
POST /api/agents/:id/sync
Body: {}
Response: { ok, updatedFiles, migrationsRun }

- git pull origin main in the container
- Run any new migrations
- Restart services
- Update repo_last_synced_at
```

#### Get repo status
```
GET /api/agents/:id/repo
Response: {
    repoUrl, repoOwner, repoName,
    currentBranch, defaultBranch,
    lastPushedAt, lastSyncedAt,
    openImprovements: [{ id, title, branchName, prUrl, status }]
}
```

### 6. UI Changes

#### Ship stage (LifecycleStepRenderer StageShip)

First ship:
```
[Ship to GitHub]
  Repo: {owner}/{agent-name}     ← clean name, no random suffix
  [x] Private repo
  [ ] Create README from plan
  
  [Push to GitHub]                ← creates repo + pushes
```

Subsequent ships:
```
[Push Update]
  Repo: github.com/prasanjit-cmd/armond-hotel-manager  ← stored, not editable
  Last pushed: 2 hours ago
  Changes: 3 files modified
  
  Commit message: [________________]
  [Push Update]                   ← commits to main
```

#### Improve Agent page (new)

```
[Improve Agent]
  Current repo: github.com/prasanjit-cmd/armond-hotel-manager
  
  What do you want to improve?
  [Add webhook support for real-time booking updates___]
  
  [Start Improvement]  ← creates branch, enters Think→Plan→Build cycle
  
  Active Improvements:
  ┌──────────────────────────────────────────────────┐
  │ #1 Add webhook support    feature/webhooks  PR #3 │
  │    Status: reviewing      [View PR →]            │
  │                                                    │
  │ #2 Fix rate limiting      feature/rate-fix  PR #4 │
  │    Status: merged         [Deploy →]             │
  └──────────────────────────────────────────────────┘
```

### 7. Container Workspace Management

The container workspace is a **git working tree**:

```
~/.openclaw/workspace/
    .git/                    ← real git repo, not throwaway
    .gitignore               ← node_modules, .env, dist, etc.
    backend/
    dashboard/
    db/
    skills/
    ...
```

#### On agent launch (installed from marketplace)
```
1. Provision container
2. git clone {repo_url} --depth 10 into workspace
3. npm install
4. Run migrations
5. Start services
6. Agent ready
```

#### On improvement build
```
1. git fetch origin
2. git checkout -b feature/{name} origin/main
3. Run specialists (write only changed files)
4. git add -A && git commit
5. git push origin feature/{name}
6. Create PR
```

#### On PR merge
```
1. git checkout main
2. git pull origin main
3. npm install (if package.json changed)
4. Run new migrations
5. Restart changed services
```

## Implementation Notes

### Key files to create
| File | Purpose |
|------|---------|
| `ruh-backend/src/agentRepo.ts` | Repo management: create, push, branch, PR, sync |
| `ruh-backend/src/agentImprovement.ts` | Improvement lifecycle: plan, build, PR, merge, deploy |
| `ruh-backend/src/agentImprovementStore.ts` | CRUD for agent_improvements table |

### Key files to modify
| File | Change |
|------|--------|
| `ruh-backend/src/schemaMigrations.ts` | Add repo columns + agent_improvements table |
| `ruh-backend/src/agentStore.ts` | Add repo fields to AgentRecord |
| `ruh-backend/src/app.ts` | Add ship, improvements, sync endpoints |
| `ruh-backend/src/workspaceGitPush.ts` | Refactor into agentRepo.ts with branch support |
| `agent-builder-ui/.../LifecycleStepRenderer.tsx` StageShip | Use persistent repo, show update vs first ship |
| `agent-builder-ui/.../copilot/CoPilotLayout.tsx` | Support improvement mode (branch-based build) |

### Reusable patterns
- `workspaceGitPush.ts` already does `docker exec git` — refactor into `agentRepo.ts` with branch support
- `build-orchestrator.ts` already runs specialists — add incremental mode that reads existing code first
- `scaffold-templates.ts` generates `.gitignore` — already excludes node_modules

### Migration strategy
- Phase 1: Persistent repo (store repo_url, reuse on subsequent ships)
- Phase 2: Improvement branches + PRs
- Phase 3: Post-merge sync + deploy
- Phase 4: Incremental builder (delta-only builds)

## Test Plan

### Unit tests

**agentRepo.ts**
- `createAgentRepo(agentId, token)` — creates repo, returns URL
- `pushToRepo(sandboxId, token)` — commits and pushes workspace
- `createBranch(sandboxId, branchName)` — creates feature branch
- `createPR(token, repo, head, base, title, body)` — opens PR via GitHub API
- `syncFromMain(sandboxId)` — pulls main, runs migrations
- Repo name generation: clean slug, collision handling
- Idempotent: pushing twice doesn't create duplicate repos

**agentImprovementStore.ts**
- CRUD operations on agent_improvements table
- Status transitions: planning → building → pr_open → merged → deployed
- Constraint: only one active improvement per branch

**Incremental builder**
- Reads existing workspace, generates only delta
- Migration numbering: finds latest migration number, increments
- Doesn't overwrite unchanged files

### Integration tests

**Ship flow (first time)**
1. Create agent with no repo_url
2. Ship → repo created on GitHub
3. Verify repo has all workspace files
4. Verify agent.repo_url is set
5. Ship again → same repo, new commit (not new repo)

**Ship flow (update)**
1. Create agent, ship (creates repo)
2. Modify a skill in the workspace
3. Ship again → verify only the changed file is in the new commit
4. Verify repo URL unchanged

**Improvement flow**
1. Create agent, ship
2. Start improvement "Add webhooks"
3. Verify branch created: `feature/add-webhooks`
4. Build runs on branch
5. PR created
6. Merge PR (via GitHub API)
7. Sync → verify workspace has merged code
8. Verify new migration ran

**Marketplace install with repo**
1. Publish agent with repo_url
2. Customer installs
3. Verify customer sandbox clones from repo_url
4. Verify npm install + migrations run
5. Verify services start

### E2E tests (Playwright)

**Ship creates persistent repo**
```typescript
test("first ship creates repo and stores URL", async ({ page }) => {
  // Create agent, complete build
  // Click Ship
  // Enter GitHub token
  // Verify repo created (mock GitHub API)
  // Verify agent record has repo_url
  // Ship again → same repo, no new repo created
});
```

**Improvement cycle**
```typescript
test("improve agent creates branch and PR", async ({ page }) => {
  // Open existing agent with repo_url
  // Click "Improve Agent"
  // Enter improvement description
  // Verify branch created
  // Build completes on branch
  // PR created with correct base/head
  // Verify improvement record status transitions
});
```

### Manual verification

1. **First ship**: Create agent → Build → Ship → check GitHub repo has all files
2. **Second ship**: Modify agent → Ship → same repo, new commit, diff shows changes
3. **Improvement**: Start improvement → feature branch → build → PR → merge → sync
4. **Marketplace round-trip**: Ship → publish → install → verify customer gets full repo
5. **Rollback**: Merge bad PR → revert in GitHub → sync → verify agent recovers
6. **Conflict resolution**: Two improvements on different branches → merge one → other has conflict → verify UI shows conflict

### Performance benchmarks

| Operation | Target | How to measure |
|-----------|--------|---------------|
| First ship (create + push) | < 30s | Timer in ship flow |
| Update push (commit + push) | < 10s | Timer in ship flow |
| Branch creation | < 5s | Timer in improvement start |
| PR creation | < 5s | GitHub API call timing |
| Post-merge sync | < 30s | Timer including migrations |
| Improvement build (delta) | < 3 min | Build orchestrator timing |
