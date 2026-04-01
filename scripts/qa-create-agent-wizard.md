# QA: Create Agent Wizard — Full 7-Stage End-to-End Test

## Task

You are a QA agent. Your job is to walk through the entire 7-step Create Agent wizard at `http://localhost:3001/agents/create`, validate every stage works correctly, take screenshots as evidence, and fix any bugs you find in real-time.

**Use `/browse` (gstack headless browser) for all browser interactions. Never use `mcp__claude-in-chrome__*` tools.**

---

## Pre-flight Checks

Before starting, verify:

1. **Dev server running:** `lsof -i :3001` should show a Next.js process. If not, run `cd agent-builder-ui && npm run dev` in background.
2. **Backend running:** `lsof -i :8000` should show the ruh-backend. If not, run `cd ruh-backend && bun run dev` in background.
3. **Docker running:** `docker ps` should show at least postgres. The wizard needs Docker for sandbox provisioning in the Ship stage.
4. **Tests pass:** Run `cd agent-builder-ui && bun test lib/openclaw/copilot-state.test.ts lib/openclaw/api.test.ts lib/openclaw/ag-ui/__tests__/event-consumer-map.test.ts lib/openclaw/ag-ui/__tests__/builder-agent.test.ts "app/(platform)/agents/create/_components/copilot/__tests__/lifecycle-stage-logic.test.ts"` — all 76+ tests should pass.
5. **TypeScript compiles:** `cd agent-builder-ui && npx tsc --noEmit` — no errors.

---

## Agent Description to Use

Enter this exact text as the agent description:

```
Inventory Alert Bot - An agent that monitors product inventory levels from a Shopify store every hour, detects items below restock threshold, generates a restocking report, and posts alerts to a Slack channel with priority rankings
```

This description is chosen because it triggers known tool/trigger/channel detection in the local template builder (Shopify, Slack, hourly cron) and produces a rich PRD/TRD.

---

## Stage-by-Stage Protocol

### Stage 1: THINK ("Define Requirements")

**Expected state:** Fresh wizard at `/agents/create`. Stepper shows Think as active, all other stages locked (disabled).

**Actions:**
1. Navigate to `http://localhost:3001/agents/create`
2. Take a screenshot — confirm stepper shows 7 stages, Think is active
3. Type the agent description into the chat input and press Enter
4. Wait for the architect to respond (may take 60-180 seconds for gateway connection)
5. Monitor for `ready_for_review` or `discovery_documents` in the page text
6. Once response arrives, take a screenshot

**Validations:**
- [ ] Chat input was NOT disabled while waiting (fix #7 — builder mode keeps input enabled)
- [ ] Agent name populated in the header (should show "Inventory Alert Bot")
- [ ] PRD/TRD sections visible in the chat response OR skill graph returned
- [ ] Config tab shows Think stage content with "Continue" or "Skip & Continue" button
- [ ] Stepper locked all future stages during generation (fix #16)
- [ ] If architect returned `type: "ready_for_review"`, wizard auto-advanced to Review (fix for one-shot responses)
- [ ] If architect returned `type: "discovery"`, Think stage shows PRD/TRD with approval button

**If Think stage shows PRD/TRD:**
- Click the Config tab
- Find and click "Continue" or "Skip & Continue" to advance to Plan stage
- Confirm devStage transitions to "plan"

**Known issues:**
- Gateway connection can take 60-180s. This is a backend/sandbox issue, not a UI bug.
- "Draft save failed" badge may appear — known local dev issue, not a blocker.
- The `Stage: think` badge in the top bar is from DevMockBar (dev-only) and may lag behind the actual stepper.

---

### Stage 2: PLAN ("Lock Architecture")

**Expected state:** devStage = "plan", planStatus transitions from "generating" to "ready".

**Actions:**
1. After Think is approved, the wizard sends a plan generation message to the architect automatically
2. Wait for the architecture plan to appear in the Config tab
3. Take a screenshot when plan sections appear (Skills, Workflow, Integrations, Triggers, Channels, Env Vars)

**Validations:**
- [ ] Plan stage shows a loading spinner while planStatus === "generating"
- [ ] Architecture plan sections render: Skills, Workflow, Integrations, Triggers, Channels, Environment Variables
- [ ] Each section has cards with relevant details
- [ ] Approval button shows "Approve & Start Build" (fix #14 — was "Lock Architecture & Build")
- [ ] Subtitle text below button: "Skills will be generated from this plan." (fix #14)
- [ ] Stepper buttons are disabled during plan generation (fix #16)
- [ ] Chat input remains enabled in builder mode (fix #7)

**Action:** Click "Approve & Start Build" to advance to Build stage.

---

### Stage 3: BUILD ("Create Skills & Config")

**Expected state:** devStage = "build", buildStatus = "building".

**Actions:**
1. After plan approval, build starts automatically via `triggerSkillGeneration()`
2. The Config tab should show the build progress UI
3. Wait for build to complete

**Validations:**
- [ ] Build stage shows "Building Agent" title with spinner (fix #21 — was generic placeholder)
- [ ] Status text: "Generating skills and configuration..." while building
- [ ] Stepper shows Build stage with loading spinner
- [ ] All stepper buttons disabled during build (fix #16)
- [ ] On completion: buildStatus transitions to "done", devStage auto-advances to "review" (fix #1)
- [ ] Build shows green checkmark and "Build complete. Advancing to review..." before transitioning

**If build fails:**
- [ ] Error message displayed with red border (fix #9)
- [ ] `skillGenerationError` text shown (fix #9)
- [ ] "Retry Build" button appears (fix #9)
- [ ] Clicking "Retry Build" restarts the build

---

### Stage 4: REVIEW ("Inspect Configuration")

**Expected state:** devStage = "review".

**Actions:**
1. Review the generated configuration in the Config tab
2. Expand/collapse sections
3. Take a screenshot of the full review

**Validations:**
- [ ] Review stage shows all sections: Agent Identity, Skills, Workflow, Integrations, Triggers, Channels, Runtime Inputs, Agent Rules
- [ ] Skills show with names, descriptions, dependencies, env vars
- [ ] Workflow steps display correctly (field should be `step.skill` from WorkflowDefinition or `step.skillId` from ArchitecturePlanWorkflow)
- [ ] Approval button shows "Approve Configuration"
- [ ] Stepper shows Review as active, Think/Plan/Build as done (green checkmarks)

**Action:** Click "Approve Configuration" to advance to Test stage.

---

### Stage 5: TEST ("Run Evaluations")

**Expected state:** devStage = "test".

**Actions:**
1. Check if eval tasks are defined
2. If tasks exist, click "Run All Tests"
3. If no tasks, click "Skip Tests & Continue"

**Validations:**
- [ ] If no eval tasks: shows "No evaluation tasks defined" with "Skip Tests & Continue" button
- [ ] If eval tasks exist: shows task cards with pass/fail/pending status
- [ ] "Simulated" badge visible near the test summary (fix #18)
- [ ] "Run All Tests" button runs pending tasks (not all tasks)
- [ ] After tests complete, "Re-run Failed" button only re-runs failed tasks, not all (fix #17)
- [ ] "Approve Tests" or "Approve with Failures" button available
- [ ] When skipping tests, evalStatus should be set to "done" (fix #19)

**Action:** Click approve/skip to advance to Ship stage.

---

### Stage 6: SHIP ("Deploy Agent")

**Expected state:** devStage = "ship".

**Actions:**
1. Ship stage should show "Deploy Agent" title with deploy button
2. Click "Deploy Agent"
3. Wait for deployment to complete (creates Docker container, installs OpenClaw, ~60-120s)

**Validations:**
- [ ] Ship stage shows "Deploy Agent" title with description (fix #3 — was generic placeholder)
- [ ] "Deploy Agent" button visible when deployStatus is idle
- [ ] Clicking "Deploy Agent" sets deployStatus to "running" (fix #3)
- [ ] Loading spinner shows during deployment (fix #4 — was inverted)
- [ ] Stepper shows Ship stage with loading spinner during deploy
- [ ] On completion: shows green checkmark "Agent deployed successfully"
- [ ] "Draft save failed" badge may appear — known local dev issue

**Known issues:**
- Deployment takes 60-120s for sandbox provisioning
- Missing runtime inputs (SHOPIFY_STORE_DOMAIN, SLACK_BOT_TOKEN etc.) will show warnings but should not block

---

### Stage 7: REFLECT ("Build Summary")

**Expected state:** devStage = "reflect".

**Actions:**
1. Reflect stage should show "Build Summary" with "Done" button
2. Click "Done"

**Validations:**
- [ ] Reflect stage shows "Build Summary" title and description
- [ ] "Done" button is functional (fix #2 — was empty callback)
- [ ] Clicking "Done" navigates to `/agents` page
- [ ] Agent appears in the agents list with correct name and status

---

## Back Navigation Tests

After completing at least through Review stage, test back navigation:

1. From Review, click "Back" button → should go to Build
2. Verify buildStatus reset to "idle" (fix #11)
3. Click "Back" again → should go to Plan
4. Verify planStatus reset to "idle" (fix #11)
5. Click "Back" again → should go to Think
6. Verify thinkStatus reset to "idle" (fix #11)
7. "Back" button should be disabled at Think (first stage)

---

## Error Handling Tests

### SSE Timeout (fix #5)
- If the architect gateway doesn't respond within 90 seconds, the SSE stream should timeout with a clear error instead of hanging forever
- Check browser console for timeout errors if connection appears stuck

### Event Drop Warnings (fix #12)
- If any custom events are dropped (coPilotStore null), a system message should appear in the chat: `"Event X was not processed: reason"`
- Check chat messages for any system warnings

### Build Failure Recovery (fix #9)
- If build fails (skill generation error), the Build stage should show:
  - Red error banner with the error message
  - "Retry Build" button
  - Clicking retry should restart the build

---

## Screenshot Checklist

Take and save screenshots at these moments:

1. `/tmp/qa-01-initial-load.png` — Fresh wizard, Think stage active
2. `/tmp/qa-02-think-generating.png` — After submitting description, architect connecting
3. `/tmp/qa-03-think-complete.png` — PRD/TRD received or skill graph arrived
4. `/tmp/qa-04-plan-generating.png` — Plan stage loading
5. `/tmp/qa-05-plan-ready.png` — Architecture plan displayed with approval button
6. `/tmp/qa-06-build-progress.png` — Build stage with spinner
7. `/tmp/qa-07-build-complete.png` — Build complete, transitioning to review
8. `/tmp/qa-08-review.png` — Full review with all sections
9. `/tmp/qa-09-test.png` — Test stage (eval tasks or skip)
10. `/tmp/qa-10-ship-deploy.png` — Ship stage with deploy button or deploying
11. `/tmp/qa-11-ship-complete.png` — Deployment complete
12. `/tmp/qa-12-reflect.png` — Build summary with Done button
13. `/tmp/qa-13-agents-list.png` — Agents list showing the new agent
14. `/tmp/qa-14-back-nav.png` — After back navigation, status reset verified

---

## Bug Fix Protocol

If you encounter a bug during testing:

1. **Document it:** Take a screenshot, note the stage, what you expected vs what happened
2. **Diagnose:** Read the relevant source code to understand the root cause
3. **Fix it:** Make the minimal code change to fix the issue
4. **Test it:** Write a bun:test regression test in the appropriate test file
5. **Verify:** Run `npx tsc --noEmit` and `bun test` to confirm no regressions
6. **Continue:** Resume the QA flow from where you left off

### Key files for fixes:
- `agent-builder-ui/lib/openclaw/copilot-state.ts` — State management
- `agent-builder-ui/app/(platform)/agents/create/_components/copilot/LifecycleStepRenderer.tsx` — Stage UI
- `agent-builder-ui/app/(platform)/agents/create/_components/copilot/CoPilotLayout.tsx` — Event handlers
- `agent-builder-ui/lib/openclaw/ag-ui/event-consumer-map.ts` — Event dispatch
- `agent-builder-ui/lib/openclaw/api.ts` — SSE streaming
- `agent-builder-ui/lib/openclaw/ag-ui/builder-agent.ts` — System instructions
- `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChat.tsx` — Chat UI

### Test files:
- `agent-builder-ui/lib/openclaw/copilot-state.test.ts`
- `agent-builder-ui/lib/openclaw/ag-ui/__tests__/event-consumer-map.test.ts`
- `agent-builder-ui/lib/openclaw/api.test.ts`
- `agent-builder-ui/lib/openclaw/ag-ui/__tests__/builder-agent.test.ts`
- `agent-builder-ui/app/(platform)/agents/create/_components/copilot/__tests__/lifecycle-stage-logic.test.ts`

---

## Timing Expectations

| Stage | Expected Duration | Notes |
|-------|------------------|-------|
| Think | 60-180s | Gateway connection is slow in local dev |
| Plan | 30-120s | Architect generates architecture plan |
| Build | 10-60s | Skill generation from plan |
| Review | Instant | User reviews and approves |
| Test | 2s (simulated) | Tests are currently simulated |
| Ship | 60-120s | Docker sandbox provisioning |
| Reflect | Instant | Summary and navigation |
| **Total** | **~5-10 minutes** | Mostly gateway latency |

---

## Success Criteria

The QA session is successful if:

1. All 7 stages are visited in order
2. Each stage's validations pass (checkboxes above)
3. The agent appears in `/agents` list at the end
4. Back navigation resets stage statuses correctly
5. No JavaScript errors in the browser console (check with `$B console --errors`)
6. Any bugs found are fixed with regression tests
7. All screenshots saved and readable

---

## Final Report Format

At the end, produce a report:

```
## QA Report: Create Agent Wizard

**Date:** YYYY-MM-DD
**Agent Created:** [name]
**Total Duration:** [time]
**Result:** PASS / FAIL / PARTIAL

### Stage Results
| Stage | Status | Duration | Notes |
|-------|--------|----------|-------|
| Think | PASS/FAIL | Xs | ... |
| Plan | PASS/FAIL | Xs | ... |
| ... | ... | ... | ... |

### Bugs Found & Fixed
- [Bug description] — [fix description] — [test added]

### Bugs Found & NOT Fixed
- [Bug description] — [reason not fixed]

### Screenshots
- [list of saved screenshots with descriptions]
```
