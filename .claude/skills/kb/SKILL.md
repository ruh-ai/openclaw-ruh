---
name: kb
version: 1.0.0
description: |
  Knowledge base maintenance and agent access for openclaw-ruh-enterprise.
  Five modes: read (orient before any task), spec (create a feature spec),
  link (verify and fix wikilink graph), audit (full KB health check),
  update (update existing notes after code changes).
  Use when asked to "check the KB", "create a spec", "update the knowledge base",
  "audit KB health", or at the start of any development task.
  Proactively suggest at Think phase and Ship phase of the gstack sprint.
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Grep
  - Glob
  - AskUserQuestion
---

# /kb — Knowledge Base Maintenance & Agent Access

Manage the Obsidian-style knowledge base for openclaw-ruh-enterprise. This skill ensures
every feature is documented, every note is connected, and agents can orient instantly.

**KB location:** `docs/knowledge-base/`
**Index:** `docs/knowledge-base/000-INDEX.md`
**Specs:** `docs/knowledge-base/specs/`

---

## Modes

| Mode | Syntax | When | Purpose |
|------|--------|------|---------|
| **read** | `/kb` or `/kb read` | Think phase — start of any task | Orient: find what the KB knows about the current task |
| **spec** | `/kb spec <short-name>` | Plan phase — after plan approved | Create a feature spec with wikilinks |
| **link** | `/kb link` | After any KB edit | Verify and fix the wikilink graph |
| **audit** | `/kb audit` | Ship phase, weekly retro | Full KB health check |
| **update** | `/kb update` | Ship phase — after code changes | Diff-driven update of existing notes |

If no mode is specified, default to **read**.

---

## Mode: read

**Purpose:** Orient the agent before starting any task. Run this first.

### Step 1: Read the index

```bash
cat docs/knowledge-base/000-INDEX.md
```

### Step 2: Identify relevant notes

Based on the user's task description or the current work context, identify the 2-4 most
relevant KB notes. Use this mapping:

| Task involves | Read these notes |
|---|---|
| Backend API endpoints | `[[004-api-reference]]` + `[[002-backend-overview]]` |
| Sandbox creation / Docker | `[[003-sandbox-lifecycle]]` |
| Database / data models | `[[005-data-models]]` |
| Telegram / Slack channels | `[[006-channel-manager]]` |
| Conversations / chat | `[[007-conversation-store]]` |
| Agent builder UI | `[[008-agent-builder-ui]]` |
| Developer dashboard UI | `[[009-ruh-frontend]]` |
| Deployment / infra | `[[010-deployment]]` |
| End-to-end user flows | `[[011-key-flows]]` |
| System architecture | `[[001-architecture]]` |

### Step 3: Read those notes

Read each identified note in full. Extract key facts relevant to the task.

### Step 4: Check for existing specs

```bash
ls docs/knowledge-base/specs/ 2>/dev/null || echo "No specs directory"
```

If specs exist, scan their filenames for relevance to the current task. Read any that match.

### Step 5: Output orientation

Provide a brief summary to the user:

```
KB Orientation:
  Relevant notes: [list with one-line summary of key facts from each]
  Existing specs: [list any related specs, or "none"]
  Coverage gaps: [areas the task touches that have no KB note or spec]
  Recommendation: [suggest /kb spec if a new spec is needed]
```

---

## Mode: spec

**Purpose:** Create a feature specification in the knowledge base with proper Obsidian graph links.

**Syntax:** `/kb spec <short-name>`

### Step 1: Validate and prepare

Generate the filename: `SPEC-<short-name>.md`
Full path: `docs/knowledge-base/specs/SPEC-<short-name>.md`

Check if it already exists:
```bash
ls docs/knowledge-base/specs/SPEC-<short-name>.md 2>/dev/null && echo "EXISTS" || echo "NEW"
```

If EXISTS, read it and ask whether to update or abort.

### Step 2: Determine affected KB notes

Either infer from context or ask:

Use AskUserQuestion:
- "Which areas of the system does this feature touch?"
- Options based on KB notes: Backend API, Sandbox lifecycle, Data models, Channels, Conversations,
  Agent builder UI, Developer UI, Deployment, Key flows

Map selections to KB note filenames.

### Step 3: Create the spec

Write `docs/knowledge-base/specs/SPEC-<short-name>.md` using this template:

```markdown
# SPEC: <Feature Name>

[[000-INDEX|← Index]] | [[<primary-related-note>]]

## Status

draft

## Summary

<!-- 2-3 sentences: what this feature does and why it exists -->

## Related Notes

- [[<note-1>]] — <one-line reason this note is related>
- [[<note-2>]] — <one-line reason>
<!-- List every KB note this feature touches -->

## Specification

<!-- Full spec content:
  - New endpoints (method, path, request body, response, errors)
  - New data models or schema changes
  - UI behavior changes
  - New flows or changes to existing flows
  - Configuration changes
-->

## Implementation Notes

<!-- Key files to change, patterns to follow, gotchas -->

## Test Plan

<!-- What tests cover this spec:
  - Unit tests
  - Integration tests
  - E2E tests
  - Manual verification steps
-->
```

Fill in as much as possible from context. Leave sections with `<!-- TODO -->` if information
is not yet available.

### Step 4: Add backlinks to affected KB notes

For each related KB note identified in Step 2:

1. Read the note
2. Find the appropriate place to add a backlink (typically a "Related Specs" section, or
   inline where the affected feature is discussed)
3. Add `[[SPEC-<short-name>]]` link

If the note doesn't have a "Related Specs" section, add one at the bottom:

```markdown
---

## Related Specs

- [[SPEC-<short-name>]] — <one-line description>
```

### Step 5: Update 000-INDEX.md

Add the new spec to the "Feature Specs" section in `000-INDEX.md`:

```markdown
- [[SPEC-<short-name>]] — <one-line description>
```

### Step 6: Verify graph integrity

Run the link verification from Mode: link (Steps 1-4 only — scan, extract, verify, report).

### Step 7: Output

```
Spec created: docs/knowledge-base/specs/SPEC-<short-name>.md
  Status: draft
  Linked to: [[note-1]], [[note-2]], ...
  Backlinks added to: [list of notes updated]
  Index updated: yes
  Graph: [healthy | N issues found]
```

---

## Mode: link

**Purpose:** Verify and fix the Obsidian wikilink graph. Ensures all notes are properly connected.

### Step 1: Scan all KB files

```bash
find docs/knowledge-base -name "*.md" -type f | sort
```

### Step 2: Extract all wikilinks from every file

For each file, extract all `[[...]]` patterns:

```bash
grep -oP '\[\[[^\]]+\]\]' docs/knowledge-base/*.md docs/knowledge-base/specs/*.md 2>/dev/null | sort
```

### Step 3: Build link map

For each file, record:
- Outgoing links: what `[[wikilinks]]` does this file contain?
- The target of each link (strip display text after `|`)

### Step 4: Verify link targets

For each extracted wikilink target:
1. Strip display text (everything after `|`)
2. Check if a file named `<target>.md` exists in `docs/knowledge-base/` or `docs/knowledge-base/specs/`
3. If not found: **broken link**

### Step 5: Check bidirectionality

For each link A → B:
- Does B contain any `[[...]]` link back to A?
- If not: **missing backlink**

### Step 6: Check minimum connectivity

For each file:
- Count outgoing links (must be ≥ 2)
- Count incoming links (must be ≥ 1)
- Files with 0 incoming links: **orphan**
- Files with < 2 outgoing links: **under-connected**

Exception: `000-INDEX.md` is the root — it doesn't need incoming links from every note,
but every note should link to it (via breadcrumb header).

### Step 7: Report

```
Link Health Report:
  Files scanned: N
  Total links: N
  Broken links: [list: file → target]
  Missing backlinks: [list: A links to B but B doesn't link to A]
  Orphan notes: [list: files with 0 incoming links]
  Under-connected: [list: files with < 2 outgoing links]
  Status: HEALTHY | N issues found
```

### Step 8: Auto-fix (with confirmation)

For each issue found:

**Broken links:** Ask user — the target may have been renamed or deleted.

**Missing backlinks:** Auto-add a backlink in the target note's navigation header or
"Related Specs" section. Show the change and ask for confirmation if adding a new section.

**Orphan notes:** Ask user where to add an incoming link (suggest INDEX or the most
related existing note).

**Under-connected:** Suggest additional links based on content overlap. Ask user to confirm.

---

## Mode: audit

**Purpose:** Full KB health check. Run at Ship phase and during weekly `/retro`.

### Step 1: Run link mode

Execute Mode: link (all steps). Capture the report.

### Step 2: Check spec lifecycle

For each file in `docs/knowledge-base/specs/`:

1. Read the spec
2. Extract the `## Status` value
3. If status is `draft`:
   - Check if the feature described has been implemented (search for key files/functions
     mentioned in the spec's Implementation Notes)
   - If implemented: flag as **stale draft** — should be `implemented`
4. If status is `approved`:
   - Same check — if code exists, flag as **should be implemented**
5. If status is `deprecated`:
   - Check if any KB notes still reference it — flag as **deprecated but still linked**

### Step 3: Check code coverage

Scan the codebase for modules/files not covered by any KB note:

```bash
# Backend modules
ls ruh-backend/src/*.ts 2>/dev/null

# Frontend components
ls agent-builder-ui/app/(platform)/**/*.tsx 2>/dev/null
ls ruh-frontend/components/*.tsx 2>/dev/null
```

Compare against what's documented in KB notes. Any significant source file not mentioned
in any KB note is a **coverage gap**.

### Step 4: Check staleness

For each KB note, compare its git last-modified date against the source files it documents:

```bash
git log -1 --format="%ai" -- docs/knowledge-base/<note>.md
git log -1 --format="%ai" -- <source-file-it-documents>
```

If the source file is significantly newer (> 1 week) than the KB note: flag as **potentially stale**.

### Step 5: Check INDEX completeness

Verify that every file in `docs/knowledge-base/` and `docs/knowledge-base/specs/` appears
in `000-INDEX.md` (either in the main sections or the Feature Specs section).

### Step 6: Validate @kb: source annotations

Run the annotation validator to check that source files properly reference KB notes:

```bash
bun scripts/check-kb-annotations.ts
```

This checks:
- **Broken references:** `@kb:` annotations pointing to KB notes that don't exist (renamed or deleted)
- **Missing annotations:** Critical source files that lack any `@kb:` annotation

If the script is not available, manually grep for annotations and verify:

```bash
grep -rn '@kb:' ruh-backend/src/ agent-builder-ui/app/ ruh-frontend/ --include='*.ts' --include='*.tsx'
```

For each `@kb:` reference, confirm the target file exists in `docs/knowledge-base/`.

### Step 7: Output health report

```
=== KB AUDIT REPORT ===

Graph Health:
  Files: N total (M core notes, K specs)
  Links: N total, N bidirectional
  Broken links: [count] [details if any]
  Missing backlinks: [count]
  Orphans: [count]
  Under-connected: [count]

Spec Lifecycle:
  Draft: N [list if stale]
  Approved: N
  Implemented: N
  Deprecated: N
  Issues: [stale drafts, etc.]

Code Coverage:
  Covered modules: [list]
  Coverage gaps: [list of uncovered files/modules]

Staleness:
  Up to date: N notes
  Potentially stale: N notes [list with dates]

Index Completeness:
  Listed in INDEX: N / M total files
  Missing from INDEX: [list]

Source Annotations (@kb:):
  Annotated files: N
  Total references: N
  Broken references: [count] [details if any]
  Critical files missing @kb: [count] [details if any]

Overall: HEALTHY | NEEDS_ATTENTION | UNHEALTHY
```

### Step 8: Suggest fixes

For each issue, suggest a concrete action:
- Stale draft → "Run `/kb spec <name>` to update, or change status to `implemented`"
- Coverage gap → "Add section to `[[<note>]]` covering `<file>`" or "Create new note"
- Stale note → "Read `<source-file>` and update `[[<note>]]`"
- Missing from INDEX → "Add `[[<note>]]` to `000-INDEX.md` section: <suggested section>"
- Broken @kb: ref → "Update annotation in `<file>` — KB note `<ref>` was renamed/removed"
- Missing @kb: → "Add `// @kb: <note>` to `<file>` (see critical files list in `scripts/check-kb-annotations.ts`)"

---

## Mode: update

**Purpose:** After code changes, update existing KB notes to match what changed.

### Step 1: Detect what changed

```bash
git diff --name-only HEAD~1..HEAD 2>/dev/null || git diff --name-only
```

If on a feature branch, diff against base:
```bash
_BASE=$(gh pr view --json baseRefName -q .baseRefName 2>/dev/null || echo "dev")
git diff --name-only "$_BASE"...HEAD
```

### Step 2: Map changed files to KB notes

Use this mapping table:

| File pattern | KB notes to check |
|---|---|
| `ruh-backend/src/app.ts` | `[[002-backend-overview]]`, `[[004-api-reference]]` |
| `ruh-backend/src/sandboxManager.ts` | `[[003-sandbox-lifecycle]]` |
| `ruh-backend/src/channelManager.ts` | `[[006-channel-manager]]` |
| `ruh-backend/src/conversationStore.ts` | `[[007-conversation-store]]` |
| `ruh-backend/src/store.ts` | `[[005-data-models]]` |
| `ruh-backend/src/db.ts` | `[[002-backend-overview]]`, `[[005-data-models]]` |
| `ruh-backend/src/utils.ts` | `[[002-backend-overview]]` |
| `agent-builder-ui/**` | `[[008-agent-builder-ui]]` |
| `agent-builder-ui/app/api/openclaw/**` | `[[008-agent-builder-ui]]`, `[[001-architecture]]` |
| `agent-builder-ui/hooks/**` | `[[008-agent-builder-ui]]` |
| `agent-builder-ui/lib/openclaw/**` | `[[008-agent-builder-ui]]`, `[[005-data-models]]` |
| `ruh-frontend/components/**` | `[[009-ruh-frontend]]` |
| `ruh-frontend/app/**` | `[[009-ruh-frontend]]` |
| `docker-compose*` | `[[010-deployment]]` |
| `k8s/**` | `[[010-deployment]]` |
| `nginx/**` | `[[010-deployment]]` |
| `.env*` | `[[010-deployment]]`, `[[001-architecture]]` |
| `docs/knowledge-base/specs/**` | `[[000-INDEX]]` |

### Step 3: Read changed files and corresponding KB notes

For each mapping hit:
1. Read the changed source file(s) — focus on the diff, not the full file
2. Read the corresponding KB note

### Step 4: Identify what's out of date

Compare the KB note's content against the current code. Look for:

- **New endpoints** not listed in `[[004-api-reference]]`
- **New/changed TypeScript interfaces** not in `[[005-data-models]]`
- **New components** not in `[[008-agent-builder-ui]]` or `[[009-ruh-frontend]]`
- **Changed flow steps** not reflected in `[[011-key-flows]]`
- **New environment variables** not in `[[010-deployment]]` or `[[001-architecture]]`
- **Changed module responsibilities** not in `[[002-backend-overview]]`
- **New CLI commands** run via `docker exec` not in relevant notes

### Step 5: Apply updates

**Auto-update (no confirmation needed):**
- Adding a new row to an endpoint table
- Adding a new interface/type to the data models note
- Adding a new component to a frontend note's file listing
- Updating a port number, file path, or version
- Adding a new environment variable to the env vars table

**Ask user (AskUserQuestion):**
- Rewriting a section's narrative
- Removing content from a note
- Adding entirely new sections
- Changing architecture descriptions or design decisions
- Anything that changes the "why" rather than the "what"

### Step 6: Maintain @kb: source annotations

If any source files were renamed, moved, or created:
1. Ensure renamed/moved files keep their `@kb:` annotation
2. Add `@kb:` annotations to new source files that implement significant KB-documented behavior
3. If a KB note is renamed, update all `@kb:` references in source files that pointed to it

### Step 7: Update wikilinks if new notes were created

If any new KB notes were created during the update:
1. Add them to `000-INDEX.md`
2. Add `[[wikilinks]]` from related existing notes
3. Add backlinks in the new notes to existing notes

### Step 8: Run link verification

Execute Mode: link to verify graph integrity after all updates.

### Step 9: Output

```
KB Update Report:
  Files changed in code: N
  KB notes affected: N
  Notes updated: [list with what changed in each]
  Notes created: [list, if any]
  No changes needed: [list of notes that were already current]
  Annotations: [new/updated @kb: refs, if any]
  Graph: HEALTHY | N issues
```

---

## File → KB Note Reference

This is the canonical mapping. Agents should consult this when determining which notes
to read or update for any task.

| Source area | Primary KB note | Secondary KB notes |
|---|---|---|
| `ruh-backend/src/app.ts` | `[[004-api-reference]]` | `[[002-backend-overview]]` |
| `ruh-backend/src/index.ts` | `[[002-backend-overview]]` | `[[001-architecture]]` |
| `ruh-backend/src/db.ts` | `[[002-backend-overview]]` | `[[005-data-models]]` |
| `ruh-backend/src/store.ts` | `[[005-data-models]]` | `[[002-backend-overview]]` |
| `ruh-backend/src/conversationStore.ts` | `[[007-conversation-store]]` | `[[005-data-models]]` |
| `ruh-backend/src/sandboxManager.ts` | `[[003-sandbox-lifecycle]]` | `[[001-architecture]]` |
| `ruh-backend/src/channelManager.ts` | `[[006-channel-manager]]` | `[[004-api-reference]]` |
| `ruh-backend/src/utils.ts` | `[[002-backend-overview]]` | — |
| `agent-builder-ui/app/api/openclaw/` | `[[008-agent-builder-ui]]` | `[[001-architecture]]` |
| `agent-builder-ui/hooks/` | `[[008-agent-builder-ui]]` | — |
| `agent-builder-ui/lib/openclaw/` | `[[008-agent-builder-ui]]` | `[[005-data-models]]` |
| `agent-builder-ui/app/(platform)/agents/create/` | `[[008-agent-builder-ui]]` | `[[011-key-flows]]` |
| `ruh-frontend/components/` | `[[009-ruh-frontend]]` | `[[011-key-flows]]` |
| `ruh-frontend/app/` | `[[009-ruh-frontend]]` | — |
| `docker-compose*`, `Dockerfile*` | `[[010-deployment]]` | `[[001-architecture]]` |
| `k8s/**` | `[[010-deployment]]` | — |
| `nginx/**` | `[[010-deployment]]` | `[[001-architecture]]` |

---

## Spec Status Lifecycle

```
draft → approved → implemented → deprecated
```

| Status | Meaning | Transition trigger |
|---|---|---|
| `draft` | Spec written, not yet reviewed | Created by `/kb spec` |
| `approved` | Plan reviews passed (`/plan-ceo-review`, `/plan-eng-review`) | After plan approval |
| `implemented` | Code shipped and tests pass | After `/ship` |
| `deprecated` | Feature removed or superseded | Manual decision |

Agents should update spec status at each transition. The `/kb audit` mode flags specs
whose status doesn't match reality.

---

## Obsidian Graph Rules (enforced by /kb link and /kb audit)

1. **Every note must have ≥ 2 outgoing `[[wikilinks]]`.**
2. **Every note must have ≥ 1 incoming link** (reachable from at least one other note).
3. **Every note must be reachable from `[[000-INDEX]]` within 2 hops.**
4. **Backlinks are mandatory.** If A → B, then B should → A (at minimum via nav header).
5. **No orphan notes.** Files with 0 incoming links are flagged.
6. **All notes use breadcrumb navigation:** `[[000-INDEX|← Index]] | [[prev]] | [[next →]]`
7. **Specs link to all notes they affect**, and those notes link back to the spec.

---

## When to Suggest This Skill

Proactively suggest `/kb` at these points in the gstack sprint:

| Context | Suggest |
|---|---|
| Agent starts any task | `/kb read` — "Let me check the KB first" |
| Plan is approved, about to build | `/kb spec <name>` — "Should I create a spec for this?" |
| Code changes are complete, about to ship | `/kb update` — "Let me update the KB for these changes" |
| Before opening PR | `/kb audit` — "Let me verify KB health before shipping" |
| During `/retro` | `/kb audit` — "Including KB health in the retro" |
| After `/document-release` | `/kb link` — "Verifying graph after doc updates" |
