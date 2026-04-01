# Agent Builder Gated Skill And Tool Flow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Lock the builder until purpose metadata exists, auto-generate registry-aware skills, require a build-first path for missing skills, and change tool recommendations to prefer CLI before MCP before API.

**Architecture:** Extend the existing `/agents/create` Co-Pilot and configure flow rather than creating a second builder surface. Add a thin backend skill-registry read API, resolve architect-generated skills against that registry in the frontend, keep unresolved skills actionable through inline custom-skill drafts, and make deploy/review fail closed until all selected required skills are deployable. Update the shared tool-research contract so architect recommendations use `cli > mcp > api` as the default preference order.

**Tech Stack:** Next.js 15 client components, Zustand, Bun tests, existing `/api/openclaw` architect bridge, Bun/Express backend routes, file-backed skill registry seed data.

---

### Task 1: Document the feature contract first

**Files:**
- Modify: `TODOS.md`
- Create: `docs/knowledge-base/specs/SPEC-agent-builder-gated-skill-tool-flow.md`
- Modify: `docs/knowledge-base/000-INDEX.md`
- Modify: `docs/knowledge-base/008-agent-builder-ui.md`
- Modify: `docs/knowledge-base/011-key-flows.md`
- Modify: `docs/knowledge-base/004-api-reference.md`
- Modify: `docs/knowledge-base/005-data-models.md`
- Modify: `docs/journal/2026-03-26.md`

**Step 1: Write the spec**

Document:
- purpose/tab locking rules
- auto skill generation trigger
- skill availability states (`native`, `registry_match`, `needs_build`, `custom_built`)
- review/deploy blocking rules
- CLI > MCP > API tool recommendation order
- first-slice inline custom-skill draft path

**Step 2: Add backlinks**

Link the spec from the KB notes above and add it to `000-INDEX.md`.

**Step 3: Append journal context**

Add a short pre-implementation journal entry noting that this package extends the real skill registry task with operator-facing builder gating.

### Task 2: Add the backend skill registry read surface

**Files:**
- Create: `ruh-backend/src/skillRegistry.ts`
- Modify: `ruh-backend/src/app.ts`
- Create: `ruh-backend/tests/unit/skillRegistry.test.ts`
- Modify: `ruh-backend/tests/unit/app` (or the closest route test file already covering agent APIs)

**Step 1: Write the failing registry unit test**

Test exact match, hyphen/underscore normalization, and `null` for unknown skill ids.

**Step 2: Run it to verify it fails**

Run: `cd ruh-backend && bun test tests/unit/skillRegistry.test.ts`
Expected: FAIL because `skillRegistry.ts` does not exist yet.

**Step 3: Implement the minimal registry module**

Add:
- `SkillRegistryEntry`
- static seed entries
- `listSkills()`
- `findSkill(skillId)`
- normalization helper

**Step 4: Run the unit test to verify it passes**

Run: `cd ruh-backend && bun test tests/unit/skillRegistry.test.ts`
Expected: PASS

**Step 5: Write the failing route test**

Cover:
- `GET /api/skills`
- `GET /api/skills/:skill_id`

**Step 6: Run it to verify it fails**

Run the specific backend route test file.
Expected: FAIL because the routes are not registered yet.

**Step 7: Implement the minimal routes**

Wire the registry reads into `ruh-backend/src/app.ts`.

**Step 8: Run the route test to verify it passes**

Run the same backend route test command.
Expected: PASS

### Task 3: Add frontend skill availability types and registry client helpers

**Files:**
- Create: `agent-builder-ui/lib/skills/registry.ts`
- Create: `agent-builder-ui/lib/skills/availability.ts`
- Create: `agent-builder-ui/lib/skills/availability.test.ts`
- Modify: `agent-builder-ui/app/(platform)/agents/create/_components/configure/types.ts`
- Modify: `agent-builder-ui/lib/openclaw/types.ts`

**Step 1: Write the failing availability test**

Cover:
- registry match resolves to `registry_match`
- native tool skill resolves to `native`
- missing registry entry resolves to `needs_build`

**Step 2: Run it to verify it fails**

Run: `bun test agent-builder-ui/lib/skills/availability.test.ts`
Expected: FAIL because the helper files do not exist yet.

**Step 3: Implement the minimal helpers**

Add:
- `fetchSkillRegistry()`
- `resolveSkillAvailability(node, registryEntries)`
- `resolveSkillAvailabilityMap(nodes, registryEntries)`

**Step 4: Run the availability test to verify it passes**

Run: `bun test agent-builder-ui/lib/skills/availability.test.ts`
Expected: PASS

### Task 4: Lock the builder tabs and phases until purpose exists

**Files:**
- Modify: `agent-builder-ui/lib/openclaw/copilot-state.ts`
- Modify: `agent-builder-ui/app/(platform)/agents/create/_components/copilot/WizardStepRenderer.tsx`
- Modify: `agent-builder-ui/app/(platform)/agents/create/_components/copilot/CoPilotLayout.tsx`
- Modify: `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChat.tsx`
- Create: `agent-builder-ui/lib/openclaw/copilot-state.test.ts`

**Step 1: Write the failing state test**

Cover:
- `purpose` is the only available phase before both `name` and `description`
- workspace tabs stay locked except `config`

**Step 2: Run it to verify it fails**

Run the new test file with Bun.
Expected: FAIL because gating state does not exist yet.

**Step 3: Implement the minimal gate state**

Add derived helpers such as:
- `hasPurposeMetadata`
- `canAccessSkills`
- `canAccessTools`
- `canDeploy`

**Step 4: Update the UI to honor the gate**

Disable:
- phase stepper buttons before unlock
- non-config Agent’s Computer tabs before unlock
- deploy button before review requirements are satisfied

**Step 5: Run the state/UI tests to verify they pass**

Run the targeted Bun tests.
Expected: PASS

### Task 5: Auto-generate skills after purpose input

**Files:**
- Modify: `agent-builder-ui/app/(platform)/agents/create/_config/generate-skills.ts`
- Modify: `agent-builder-ui/app/(platform)/agents/create/_components/copilot/WizardStepRenderer.tsx`
- Modify: `agent-builder-ui/app/(platform)/agents/create/_components/wizard/PhaseSkills.tsx`
- Create: `agent-builder-ui/app/(platform)/agents/create/_config/generate-skills.test.ts`

**Step 1: Write the failing auto-generation test**

Cover:
- when both `name` and `description` are present, generation is triggered after debounce
- when one field is empty, generation does not run

**Step 2: Run it to verify it fails**

Run the focused test.
Expected: FAIL because the flow still requires a manual button.

**Step 3: Implement minimal debounce-driven generation**

Move generation trigger into the shared builder/co-pilot path so both wizard and Co-Pilot benefit.

**Step 4: Run the auto-generation test to verify it passes**

Run the same test command.
Expected: PASS

### Task 6: Make StepChooseSkills registry-aware and build-first capable

**Files:**
- Modify: `agent-builder-ui/app/(platform)/agents/create/_components/configure/StepChooseSkills.tsx`
- Modify: `agent-builder-ui/app/(platform)/agents/create/_components/configure/types.ts`
- Modify: `agent-builder-ui/lib/openclaw/copilot-state.ts`
- Create: `agent-builder-ui/app/(platform)/agents/create/_components/configure/StepChooseSkills.test.tsx`

**Step 1: Write the failing component test**

Cover:
- registry-matched skills show a registry badge
- unresolved skills show `Build Custom Skill`
- accepted custom-skill draft marks the skill `custom_built`

**Step 2: Run it to verify it fails**

Run the component test.
Expected: FAIL because StepChooseSkills has no registry/build state.

**Step 3: Implement minimal registry-aware rendering**

Add:
- availability badge row
- inline custom-skill draft action
- local/custom draft acceptance callback

**Step 4: Run the component test to verify it passes**

Run the same test command.
Expected: PASS

### Task 7: Block review and deploy on unresolved required skills

**Files:**
- Modify: `agent-builder-ui/app/(platform)/agents/create/_components/copilot/CoPilotLayout.tsx`
- Modify: `agent-builder-ui/app/(platform)/agents/create/_components/review/ReviewAgent.tsx`
- Modify: `agent-builder-ui/app/(platform)/agents/create/page.tsx`
- Create: `agent-builder-ui/app/(platform)/agents/create/_components/review/ReviewAgent.test.tsx`

**Step 1: Write the failing review/deploy test**

Cover:
- deploy button disabled while selected required skills remain `needs_build`
- review explains which skills are blocking deploy

**Step 2: Run it to verify it fails**

Run the review component test.
Expected: FAIL because deploy currently only checks a minimal name/graph condition.

**Step 3: Implement the minimal blocking logic**

Compute unresolved required skills from selected skill state and custom drafts, then feed that into review and deploy button state.

**Step 4: Run the review/deploy test to verify it passes**

Run the same test command.
Expected: PASS

### Task 8: Update tool research priority to CLI > MCP > API

**Files:**
- Modify: `agent-builder-ui/lib/tools/tool-integration.ts`
- Modify: `agent-builder-ui/app/(platform)/tools/_components/ToolResearchWorkspace.tsx`
- Create: `agent-builder-ui/lib/tools/tool-integration-priority.test.ts`
- Modify: `agent-builder-ui/app/api/openclaw/route.test.ts`

**Step 1: Write the failing tool-priority test**

Cover:
- prompt instructions explicitly prefer CLI first, then MCP, then API
- the UI labels/reasoning still support all three outcomes

**Step 2: Run it to verify it fails**

Run the new tool-priority test.
Expected: FAIL because the current prompt still prefers MCP first.

**Step 3: Implement the minimal prompt and copy update**

Change the prompt and any explanatory UI text to the new preference ordering.

**Step 4: Run the tool-priority and route tests to verify they pass**

Run:
- `bun test agent-builder-ui/lib/tools/tool-integration-priority.test.ts`
- `bun test agent-builder-ui/app/api/openclaw/route.test.ts`

Expected: PASS

### Task 9: End-to-end verification and documentation sync

**Files:**
- Modify: `docs/knowledge-base/008-agent-builder-ui.md`
- Modify: `docs/knowledge-base/011-key-flows.md`
- Modify: `docs/knowledge-base/004-api-reference.md`
- Modify: `docs/knowledge-base/005-data-models.md`
- Modify: `docs/journal/2026-03-26.md`

**Step 1: Run the targeted frontend/backend suites**

Run:
- `bun test agent-builder-ui/lib/skills/availability.test.ts`
- `bun test agent-builder-ui/app/(platform)/agents/create/_components/configure/StepChooseSkills.test.tsx`
- `bun test agent-builder-ui/lib/tools/tool-integration*.test.ts`
- `cd ruh-backend && bun test tests/unit/skillRegistry.test.ts`
- plus any route tests added above

Expected: PASS

**Step 2: Run filtered typecheck verification**

Run a filtered `bunx tsc --noEmit` over the touched runtime files.
Expected: no new runtime-file errors for this package; existing unrelated repo errors may remain.

**Step 3: Update docs to match shipped behavior**

Capture:
- purpose/tab locking
- auto skill generation
- registry-aware skill statuses
- build-first custom skill path
- CLI > MCP > API tool recommendation order

**Step 4: Commit**

```bash
git add TODOS.md docs/plans/2026-03-26-agent-builder-gated-skill-tool-flow-design.md docs/plans/2026-03-26-agent-builder-gated-skill-tool-flow.md docs/knowledge-base docs/journal/2026-03-26.md agent-builder-ui ruh-backend
git commit -m "feat: gate builder flow on purpose and registry-backed skills"
```
