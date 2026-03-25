# TODOS

`TODOS.md` is the canonical work log for agent activity in this repo. Read it before any non-trivial task and update it as work starts, changes, pauses, or completes so a future agent can understand what was being done.

## Entry Template

### TASK-YYYY-MM-DD-XX: <title>
- Status: `active` | `blocked` | `paused` | `completed` | `deferred`
- Owner: `<agent name>`
- Started: `YYYY-MM-DD`
- Updated: `YYYY-MM-DD`
- Areas: `path/one`, `path/two`
- Summary: `<what is being worked on and why>`
- Next step: `<best next action for the next agent>`
- Blockers: `<none or concrete blocker>`

For `Analyst-1` and `Worker-1`, a single TODO entry may represent one feature package rather than one isolated code change. In that mode, include the testable outcome, implementation outline, verification expectations, and evaluation criteria needed to finish the whole feature.

## Active Work Log

### TASK-2026-03-25-85: Add persistent workspace memory to deployed-agent chat
- Status: `active`
- Owner: `Analyst-1`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `agent-builder-ui/app/(platform)/agents/[id]/chat/page.tsx`, `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChat.tsx`, `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabMissionControl.tsx`, `agent-builder-ui/hooks/use-agents-store.ts`, `ruh-backend/src/app.ts`, `ruh-backend/src/agentStore.ts`, `ruh-backend/src/validation.ts`, `docs/knowledge-base/004-api-reference.md`, `docs/knowledge-base/005-data-models.md`, `docs/knowledge-base/008-agent-builder-ui.md`, `docs/knowledge-base/011-key-flows.md`, `docs/knowledge-base/specs/`
- Summary: `The active project focus still has one remaining ordered Manus-style parity slice that is not represented in \`TODOS.md\`: persistent project/workspace memory on the deployed-agent chat journey. TASK-2026-03-25-83 now captures the productization/operator surface, but the repo still has no worker-ready package for durable instructions, pinned knowledge/files, or continuity state that survives refreshes, new conversations, or redeploys on \`/agents/[id]/chat\`. In \`agent-builder-ui/app/(platform)/agents/[id]/chat/page.tsx\`, the deployed-agent page only loads agent metadata, sandbox selection, and tab state. In \`TabChat.tsx\` and \`TabMissionControl.tsx\`, there is no project brief, no reusable operator instructions, no pinned workspace assets, and no continuity summary carried into the next run. In \`ruh-backend/src/agentStore.ts\`, persisted agent state stops at metadata, \`skill_graph\`, \`workflow\`, \`agent_rules\`, and \`sandbox_ids\`, while \`ruh-backend/src/app.ts\` exposes no deployed-agent route for reading or updating durable workspace memory. Existing tasks cover browser workspace (TASK-2026-03-25-77), files/artifacts (TASK-2026-03-25-78), terminal/process state (TASK-2026-03-25-80), research outputs (TASK-2026-03-25-82), and productization (TASK-2026-03-25-83), but no active or deferred entry currently scopes the persistent project/workspace-memory layer that the focus document lists next.`
- Operator-testable outcome: `After one worker run, a human can open \`/agents/<id>/chat\`, review and edit a bounded Workspace Memory surface for that agent, save reusable project instructions plus a short continuity summary, optionally attach or pin safe workspace file references, refresh or switch away and back without losing that state, and start a new deployed-agent chat that clearly applies the saved memory context instead of behaving like a blank one-off session.`
- Next step: `Start by writing \`docs/knowledge-base/specs/SPEC-deployed-chat-workspace-memory.md\`, then add the minimal persisted backend memory contract plus the deployed-agent Workspace Memory surface and new-chat context injection/readout so the page can behave like a durable project workspace instead of chat-only history.`
- Blockers: `None. This should compose with TASK-2026-03-25-78 for richer file/artifact pinning and TASK-2026-03-25-83 for the adjacent operator surface, but the first slice can ship with bounded instructions, continuity text, and optional safe file-path references without waiting for full file-browser or publish automation coverage.`

#### Why this is important now

- `docs/project-focus.md` explicitly orders `Persistent project/workspace memory polish` after the productization/operator slice, and TASK-2026-03-25-83 now covers that productization gap.
- `agent-builder-ui/app/(platform)/agents/[id]/chat/page.tsx` still loads only sandboxes, tab state, and the existing deployed-chat surfaces; there is no project-level memory model visible anywhere on the page.
- `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChat.tsx` can create or resume conversations, but it has no contract for reusable instructions, continuity summaries, pinned workspace context, or explicit carry-forward state into the next conversation.
- `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabMissionControl.tsx` is still an operational panel for status, quick actions, skills, rules, and env-var hints; it does not act as a durable workspace-memory surface.
- `ruh-backend/src/agentStore.ts` persists agent metadata, graph/workflow, rules, and sandbox relations only; there is no DB field or route for project memory, pinned references, or continuity notes that should survive redeploys and handoffs.
- `ruh-backend/src/app.ts`, `docs/knowledge-base/004-api-reference.md`, and `docs/knowledge-base/005-data-models.md` expose no backend contract for reading/updating durable deployed-agent workspace memory today.

#### What to build

1. **Feature spec first** (`docs/knowledge-base/specs/SPEC-deployed-chat-workspace-memory.md`):
   - Define the first shipped persistent workspace-memory slice for deployed-agent chat.
   - Document the bounded data model for reusable instructions, continuity summary, optional pinned file/resource references, and explicit empty/unavailable states.
   - Specify how new conversations consume this saved memory without silently mutating old transcripts or requiring a separate builder-only flow.
   - Add backlinks in `[[004-api-reference]]`, `[[005-data-models]]`, `[[008-agent-builder-ui]]`, and `[[011-key-flows]]`.

2. **Backend persistence contract** (`ruh-backend/src/agentStore.ts`, `ruh-backend/src/app.ts`, validation/helpers chosen by the spec):
   - Add a persisted agent-level workspace-memory model that survives refreshes, chat restarts, and redeploys.
   - Support a first slice that stores: reusable project instructions, a short continuity summary, and a bounded list of safe pinned workspace references or operator notes.
   - Expose one read route and one update route with strict size limits, shape validation, and safe normalization for any file/resource references.
   - Fail closed on malformed or unsafe references rather than returning arbitrary host paths or secret-bearing metadata.

3. **Deployed-agent Workspace Memory surface** (`agent-builder-ui/app/(platform)/agents/[id]/chat/page.tsx`, `TabChat.tsx`, `TabMissionControl.tsx`, and extracted components if needed):
   - Add a visible Workspace Memory panel, section, or tab on `/agents/[id]/chat`.
   - Let operators view and edit reusable instructions and continuity text from the same page where they operate the deployed agent.
   - Surface pinned references and explicit empty states so the first slice is useful even before richer file-browser work is complete.
   - Preserve the current chat and mission-control flows while making durable context discoverable and editable in one operator journey.

4. **New-chat memory application flow** (`TabChat.tsx`, shared helpers, related store wiring):
   - When the operator starts a new deployed-agent conversation, apply the saved workspace memory through one explicit, bounded context mechanism chosen by the spec.
   - Make that application visible in the UI so operators can tell when reusable instructions/continuity were included.
   - Keep the memory scoped to the active agent and avoid leaking saved context across different agents or old conversation transcripts.
   - Ensure existing conversation-history pagination and persisted messages remain compatible with the new memory layer.

5. **Regression coverage and docs** (`agent-builder-ui/e2e/`, backend tests, KB/API notes):
   - Extend deployed-agent tests so mocked workspace-memory state proves the UI can load, save, and apply reusable instructions/continuity predictably.
   - Add backend tests for validation, persistence, safe reference normalization, and bounded payload behavior.
   - Update KB/API/data-model notes so later project-files, richer artifact pinning, and long-lived workspace features build on one canonical memory contract instead of inventing separate stores.

#### Test suite

**Frontend workspace-memory tests** (`agent-builder-ui/e2e/` and targeted component/store tests if practical):
- A deployed-agent chat page with existing workspace memory renders the saved instructions, continuity summary, and pinned references.
- Saving updated workspace memory persists across refresh/reload and does not leak between different agents.
- Starting a new chat shows that workspace memory was applied through the documented UI affordance instead of silently disappearing.
- Empty or unsupported pinned-reference states render explicitly instead of looking like missing data.

**Backend workspace-memory tests** (`ruh-backend/tests/unit/`, `tests/integration/`, or the narrowest stable layer available):
- The chosen workspace-memory payload validates size limits, supported keys, and string trimming deterministically.
- Unsafe file/resource references are rejected or normalized according to the spec instead of being stored verbatim.
- Read/update helpers persist and reload workspace memory without overwriting unrelated agent fields.
- Route-level handlers return only the safe bounded memory shape chosen by the spec.

**Operator verification**:
- On `/agents/<id>/chat`, save reusable instructions and a continuity summary, refresh the page, and confirm the same state is still visible.
- Start a new deployed-agent conversation and confirm the page clearly indicates the saved workspace memory was applied.
- Switch to a different agent and confirm no workspace-memory leakage occurs.
- If pinned references are present, confirm the UI shows only safe normalized references and explicit unavailable states when a reference cannot be resolved.

#### Evaluation criteria

- [ ] Deployed-agent chat exposes a persistent Workspace Memory surface for the active agent
- [ ] Reusable instructions and continuity state survive refreshes, new chats, and redeploy-oriented operator handoffs
- [ ] New deployed-agent conversations can explicitly apply the saved memory context without mutating older transcripts
- [ ] Safe pinned references are bounded, validated, and non-secret-bearing
- [ ] Regression coverage proves workspace-memory load/save/apply behavior across empty and populated states
- [ ] KB/spec docs describe the workspace-memory contract so later project/workspace persistence work extends the same model

### TASK-2026-03-25-83: Add productization mission-control surface to deployed-agent chat
- Status: `active`
- Owner: `Analyst-1`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `agent-builder-ui/app/(platform)/agents/[id]/chat/page.tsx`, `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabMissionControl.tsx`, `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChat.tsx`, `agent-builder-ui/app/(platform)/agents/[id]/deploy/page.tsx`, `agent-builder-ui/hooks/use-agents-store.ts`, `ruh-backend/src/app.ts`, `docs/knowledge-base/004-api-reference.md`, `docs/knowledge-base/008-agent-builder-ui.md`, `docs/knowledge-base/011-key-flows.md`, `docs/knowledge-base/specs/`
- Summary: `The active project focus says the next missing Manus-style parity slice after connector-aware research is publish/auth/analytics/data operator surfaces on the deployed-agent chat journey, but the current repo still has no worker-ready package for that gap. In \`agent-builder-ui/app/(platform)/agents/[id]/chat/page.tsx\`, the operator journey stops at Chat, All Chats, Mission Control, and Settings. In \`TabMissionControl.tsx\`, the shipped surface only shows gateway health, conversation count, loaded skills, env-var hints, and quick actions like redeploy or improve; it does not show whether a generated app is previewable or published, whether end-user auth/access control is configured, whether the sandbox has any analytics/operator telemetry worth inspecting, or whether the run produced app/data resources that can be managed as a product. In \`ruh-backend/src/app.ts\` and \`docs/knowledge-base/004-api-reference.md\`, there is no deployed-agent productization contract for preview URLs, publish status, access-control readiness, analytics snapshots, or data-resource visibility. Existing tasks cover browser workspace (TASK-2026-03-25-77), files/artifact preview (TASK-2026-03-25-78), terminal/process state (TASK-2026-03-25-80), and connector-aware research outputs (TASK-2026-03-25-82), but none currently define the first operator-facing productization surface that lets a human turn agent output into something reviewable and operable from \`/agents/[id]/chat\`.`
- Operator-testable outcome: `After one worker run, a human can open \`/agents/<id>/chat\`, switch to a new productization surface in Mission Control or an equivalent bounded tab, and see a truthful readiness view for the active sandbox: preview URL or explicit unavailable state, publish/deploy state, access-control/auth readiness, bounded analytics counters, and a summary of app/data resources the operator can inspect next. The same surface exposes the first clear operator actions for previewing, redeploying/publishing, and opening the relevant app/data endpoint without reverse-engineering those details from chat prose or container logs.`
- Next step: `Start by writing \`docs/knowledge-base/specs/SPEC-deployed-chat-productization-surface.md\`, then add the minimal backend read contract plus the deployed-agent Mission Control/Product surface so preview/publish/access/analytics/data state becomes a visible operator workflow instead of an inferred post-build guess.`
- Blockers: `None. This should compose with TASK-2026-03-25-78 for artifact previews, TASK-2026-03-25-82 for research deliverables, TASK-2026-03-25-74 for deploy relation correctness, and the broader auth/security tasks already in the backlog, but the first slice can ship with bounded read-only readiness states and explicit unsupported/unavailable messaging instead of waiting for full publish automation or end-user auth provisioning.`

#### Why this is important now

- `docs/project-focus.md` lists `Publish/auth/analytics/data operator surfaces` as the next suggested delivery slice after connector-aware research, and `TODOS.md` already has explicit packages for the earlier browser, files/artifacts, terminal/process, and research slices.
- `agent-builder-ui/app/(platform)/agents/[id]/chat/page.tsx` still frames the deployed-agent experience as chat + mission-control utilities; there is no first-class product/operator surface between "the agent generated something" and "the operator can preview, publish, or inspect it."
- `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabMissionControl.tsx` currently fetches sandbox status and conversation count only, then renders static skill/env metadata and quick actions. That is useful infrastructure, but it is not a productization workflow.
- The existing browser preview support in `BrowserPanel.tsx` is a heuristic localhost iframe for active browser use, not a documented operator-facing contract for app preview, published URLs, analytics, or data resources.
- `ruh-backend/src/app.ts` and `docs/knowledge-base/004-api-reference.md` expose no route or SSE normalization for product preview metadata, publish status, auth/access readiness, analytics summaries, or data-resource inspection tied to the deployed-agent journey.
- The active focus explicitly asks for each worker run to leave a human-testable improvement on `/agents/[id]/chat`; a bounded productization surface is the highest-leverage remaining gap before the later persistent-workspace-memory polish.

#### What to build

1. **Feature spec first** (`docs/knowledge-base/specs/SPEC-deployed-chat-productization-surface.md`):
   - Define the first shipped productization/operator slice for the deployed-agent chat journey.
   - Document the bounded read model the UI expects for preview status, publish/deploy state, auth/access-control readiness, analytics counters, and app/data resources.
   - Specify what the first slice does **not** automate yet: full custom-domain publishing, end-user auth setup flows, or arbitrary database management.
   - Add backlinks in `[[004-api-reference]]`, `[[008-agent-builder-ui]]`, and `[[011-key-flows]]`.

2. **Backend productization read contract** (`ruh-backend/src/app.ts` plus helper(s) chosen by the spec):
   - Add one bounded endpoint or normalized read contract for deployed-agent productization state tied to a sandbox/agent.
   - Support a first slice that can return: preview URL or preview-unavailable reason, deploy/publish status, access/auth readiness state, bounded analytics metrics, and a list of app/data resources the operator can open next.
   - Fail closed when the sandbox cannot prove a preview, publish target, or analytics source instead of fabricating green states in the UI.
   - Keep secret-bearing config or credentials out of the payload; return masked readiness booleans, labels, and safe URLs only.

3. **Mission Control / product surface UI** (`agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabMissionControl.tsx`, `page.tsx`, and extracted components if needed):
   - Add a new productization panel, section group, or tab that makes generated-app operability visible from the chat page.
   - Render preview/publish cards, access-control readiness, analytics summary, and app/data-resource links with explicit empty or unavailable states.
   - Reuse existing deploy/redeploy actions where possible, but pair them with truthful state instead of offering blind actions.
   - Preserve current chat/workspace behavior while making "what can I do with this generated product now?" answerable from the same operator journey.

4. **Agent/resource state wiring** (`agent-builder-ui/hooks/use-agents-store.ts`, deploy page, related helpers):
   - Extend the agent/sandbox read model only as far as needed to surface productization metadata without turning the store into an unbounded app-runtime cache.
   - Keep productization state scoped to the active sandbox so switching deployments does not leak preview links, analytics counters, or data resources across instances.
   - Define graceful fallbacks when a sandbox only supports some of the productization signals in the first slice.

5. **Regression coverage and docs** (`agent-builder-ui/e2e/`, backend tests, KB/API notes):
   - Extend deployed-agent Playwright coverage so mocked productization metadata proves the operator surface renders preview/publish/access/analytics/data states correctly.
   - Add backend tests for preview URL safety, unavailable-state normalization, bounded analytics payloads, and resource-list redaction.
   - Update KB/API notes so later publish automation, app auth, analytics expansion, and data-management work extends the same operator surface instead of fragmenting into unrelated panels.

#### Test suite

**Frontend productization-surface tests** (`agent-builder-ui/e2e/` and targeted component tests if practical):
- A mocked deployed sandbox with preview and analytics metadata renders the productization surface with the expected cards and links.
- Missing preview or publish support renders explicit unavailable states rather than empty success-looking UI.
- Switching active sandboxes updates preview/publish/access/analytics/data state without leaking stale metadata from the previous instance.
- Preview/open actions route the operator to the documented target without breaking the rest of the chat page.

**Backend/route tests** (`ruh-backend/tests/unit/`, `ruh-backend/tests/integration/` as appropriate):
- The productization contract returns only safe, bounded metadata for preview/publish/access/analytics/data state.
- Invalid or unsafe preview targets are rejected or normalized to unavailable-state responses instead of being returned directly.
- Analytics/data-resource payloads stay bounded and deterministic when the sandbox has no product signals or only partial signals.

**Operator verification**:
- On `/agents/<id>/chat`, the operator can tell whether the active sandbox has something previewable/publishable without reading the full transcript.
- The page shows explicit auth/access readiness and analytics/data visibility states instead of forcing the operator to inspect container internals.
- The operator has at least one clear next action from the same page: open preview, redeploy/publish, or inspect the surfaced app/data resource.

#### Evaluation — task is done when
- [ ] Deployed-agent chat exposes a productization/operator surface for the active sandbox
- [ ] Preview, publish/deploy, access/auth readiness, analytics, and app/data-resource states reach the UI through a documented bounded contract
- [ ] The first slice renders explicit unavailable/unsupported states instead of inventing green status where evidence is missing
- [ ] Productization state is isolated per sandbox and does not leak secret-bearing configuration details
- [ ] Regression coverage proves the productization surface behaves predictably across available and unavailable states
- [ ] KB/spec notes describe the productization surface so later publish/auth/analytics/data work builds on the same contract

### TASK-2026-03-25-82: Add connector-aware research workspace and sourced deliverables to deployed-agent chat
- Status: `active`
- Owner: `Analyst-1`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `agent-builder-ui/app/(platform)/agents/[id]/chat/page.tsx`, `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChat.tsx`, `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/BrowserPanel.tsx`, `agent-builder-ui/hooks/use-agents-store.ts`, `agent-builder-ui/app/(platform)/agents/create/_components/configure/StepConnectTools.tsx`, `ruh-backend/src/app.ts`, `docs/knowledge-base/004-api-reference.md`, `docs/knowledge-base/008-agent-builder-ui.md`, `docs/knowledge-base/011-key-flows.md`, `docs/knowledge-base/specs/`
- Summary: `The active project focus says the next missing Manus-style parity slice after browser, files/artifacts, and richer terminal work is connector-aware workflows plus research outputs on the deployed-agent chat page, but the current repo still has no worker-ready package for that gap. In \`agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChat.tsx\` and \`page.tsx\`, the deployed-agent surface can stream chat, browser heuristics, and workspace toggles, but it has no research workspace, no source/citation model, no connector-status view, and no operator-visible bundle for sourced deliverables. In \`agent-builder-ui/app/(platform)/agents/create/_components/configure/StepConnectTools.tsx\`, tool connections are still builder-side setup affordances only, while \`agent-builder-ui/hooks/use-agents-store.ts\` and \`ruh-backend/src/app.ts\` expose no deployed-chat contract for showing which connectors were available, which sources were used, or which research/report artifact came out of a run. Existing tasks cover browser workspace (TASK-2026-03-25-77), files/artifact preview (TASK-2026-03-25-78), terminal/process state (TASK-2026-03-25-80), tool-connection persistence (TASK-2026-03-25-02), and secret storage (TASK-2026-03-25-20), but none currently define the operator-facing connector-aware research workspace that the active focus lists next.`
- User-testable outcome: `After one worker run, a human can open \`/agents/<id>/chat\`, ask the deployed agent to perform a research task that uses web browsing and any configured tools, switch to a new Research workspace surface, inspect a run-scoped list of sources with URLs and connector/tool badges, see whether referenced connectors were available or unavailable for that run, open the final research brief/result bundle from the same page, and copy or download the generated deliverable without reconstructing provenance from chat prose.`
- Next step: `Start by writing \`docs/knowledge-base/specs/SPEC-deployed-chat-research-workspace.md\`, then add the minimal backend/runtime event contract plus the deployed-chat Research workspace UI so sourced research and connector/tool provenance become a visible operator workflow instead of a chat-only narrative.`
- Blockers: `None. This should explicitly compose with TASK-2026-03-25-02 and TASK-2026-03-25-20 for connector metadata and secret handling, but the first slice can ship with read-only configured/unavailable connector state and explicit empty states rather than waiting for full connector-management UX on the chat page.`

#### Why this is important now

- `docs/project-focus.md` lists `Connector-aware workflows + research outputs` as the next suggested delivery slice after browser visibility, files/artifacts, and richer terminal/process state, and those first three slices are already represented by TASK-2026-03-25-77, TASK-2026-03-25-78, and TASK-2026-03-25-80.
- `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChat.tsx` and `BrowserPanel.tsx` can currently show heuristic browser activity and terminal-like steps, but they do not render source cards, citations, connector provenance, or a first-class research deliverable surface.
- `agent-builder-ui/app/(platform)/agents/[id]/chat/page.tsx` loads sandboxes and chat tabs only; it does not load connector/tool readiness or any run-scoped research/result metadata for the operator workspace.
- `agent-builder-ui/app/(platform)/agents/create/_components/configure/StepConnectTools.tsx` proves the product already wants connector-aware agents, but that setup remains disconnected from the deployed-agent operator experience.
- `agent-builder-ui/hooks/use-agents-store.ts` still serializes deployed-agent records without connector metadata, and `ruh-backend/src/app.ts` exposes no deployed-chat route or SSE normalization for source bundles, cited outputs, or connector/tool state tied to a research run.
- TASK-2026-03-25-02 and TASK-2026-03-25-20 cover persistence and secret safety for tool connections, but neither task gives operators a visible run-time workflow for understanding what external context an agent used or what source-backed deliverable it produced on `/agents/[id]/chat`.

#### What to build

1. **Feature spec first** (`docs/knowledge-base/specs/SPEC-deployed-chat-research-workspace.md`):
   - Define the first shipped connector-aware research workspace slice for deployed-agent chat.
   - Document the event/read model the UI expects for research runs: source entries, connector/tool provenance, availability state, final brief/result bundle metadata, and explicit unsupported/unavailable states.
   - Specify how this surface composes with TASK-2026-03-25-77/78/80 so browser/files/terminal work can feed one shared workspace model instead of inventing parallel result panes.
   - Add backlinks in `[[004-api-reference]]`, `[[008-agent-builder-ui]]`, and `[[011-key-flows]]`.

2. **Backend/runtime research contract** (`ruh-backend/src/app.ts` plus helper(s) chosen by the spec):
   - Extend the deployed-chat proxy path so research-oriented runtime metadata can reach the UI as structured frames or bounded read endpoints instead of only assistant prose.
   - Support a first slice that carries source title/URL, source kind (`web`, `connector`, `file`, or equivalent chosen by the spec), connector/tool identifier when applicable, and a final deliverable descriptor for the generated brief/report bundle.
   - Fail closed when source metadata is incomplete or malformed rather than fabricating citations or connector success in the client.
   - Keep secret-bearing connector details out of the workspace payload and reuse the masked/configured-state contract from TASK-2026-03-25-20 when connector metadata exists.

3. **Deployed-agent Research workspace UI** (`agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChat.tsx`, `page.tsx`, and any extracted component):
   - Add a `research` workspace tab or equivalent bounded surface alongside the existing workspace model.
   - Render run-scoped source cards with connector/tool badges, availability state, and explicit source links so operators can audit provenance quickly.
   - Surface the final research brief/result bundle in the same workspace with copy/download affordances and a clear empty state when the run produced no research artifact.
   - Preserve the current chat, browser, and terminal behavior while making the research surface a first-class operator view rather than an assistant-text summary.

4. **Connector-aware state wiring** (`agent-builder-ui/hooks/use-agents-store.ts`, deployed-chat state, related helpers):
   - Add only the minimum safe metadata the chat page needs to show connector availability or “not configured” state; do not duplicate credential-management UX from the builder configure flow.
   - Keep source/deliverable state scoped to the active conversation or run so research results from one sandbox/chat do not leak into another.
   - Reuse the existing agent/tool configuration work where possible, but make the first slice resilient when connector metadata is absent by rendering explicit unavailable states instead of hiding the feature entirely.

5. **Regression coverage and docs** (`agent-builder-ui/e2e/`, backend tests, KB/API notes):
   - Extend deployed-chat Playwright coverage so mocked research metadata proves the workspace renders sources, connector badges, and result-bundle actions correctly.
   - Add backend route/helper tests for source normalization, malformed-payload handling, and safe connector metadata redaction.
   - Update KB/API notes so later connector-management and wide-research work extend the same sourced-output contract instead of bypassing it.

#### Test suite

**Frontend research-workspace tests** (`agent-builder-ui/e2e/` and targeted component tests if practical):
- A mocked research-heavy chat run exposes a Research workspace surface and renders multiple source cards in run order.
- Source cards show the expected URL/title plus a connector/tool badge or explicit `web`/`unavailable` state without breaking the rest of the chat workspace.
- The final research brief/result bundle opens in the workspace and exposes copy/download actions from the same page.
- Switching conversations or sandboxes clears or isolates research source state correctly.

**Backend/route tests** (`ruh-backend/tests/unit/`, `ruh-backend/tests/integration/` as appropriate):
- Structured source and deliverable metadata survive the deployed-chat proxy with stable run identity and source classification.
- Malformed or partial research payloads fail in the documented way rather than producing misleading citations or connector-success UI.
- Connector metadata in research payloads remains masked/safe and never exposes raw secrets or tokens.

**Operator verification**:
- On `/agents/<id>/chat`, a research-oriented prompt produces a visible source-backed workspace instead of burying provenance in assistant prose.
- The operator can tell which sources came from the web versus a configured connector and can see when a requested connector was unavailable.
- The final research brief or result bundle is inspectable and exportable from the same chat page without manual transcript reconstruction.

#### Evaluation — task is done when
- [ ] Deployed-agent chat exposes a research workspace surface for source-backed runs
- [ ] Research/source metadata reaches the UI through a documented structured contract rather than only free-form assistant text
- [ ] The workspace shows source cards, connector/tool provenance, and explicit unavailable states in a regression-tested way
- [ ] Operators can inspect and export the final research brief or result bundle from the same page
- [ ] Research workspace state remains isolated per conversation/sandbox and does not leak secret-bearing connector details
- [ ] KB/spec notes describe the research-workspace contract so later connector-management and wide-research work can build on the same surface

### TASK-2026-03-25-80: Add structured terminal process state and file navigation to deployed-agent chat
- Status: `active`
- Owner: `Analyst-1`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `agent-builder-ui/app/(platform)/agents/[id]/chat/page.tsx`, `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChat.tsx`, `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/BrowserPanel.tsx`, `agent-builder-ui/e2e/tab-chat-terminal.spec.ts`, `ruh-backend/src/app.ts`, `docs/knowledge-base/004-api-reference.md`, `docs/knowledge-base/008-agent-builder-ui.md`, `docs/knowledge-base/011-key-flows.md`, `docs/knowledge-base/specs/`
- Summary: `The active project focus says the deployed-agent chat surface should next ship richer terminal/process state plus file navigation after the browser and files/artifact slices, and the current repo still has no worker-ready package for that gap. In \`agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChat.tsx\`, the terminal workspace only renders command-like strings inferred from markdown code blocks, XML-ish tool markup, or OpenAI tool-call arguments; it does not expose a structured run model with cwd, stdout/stderr, exit status, touched paths, or durable command history. The same file's Browser tab already exists, but it is also heuristic text parsing rather than a backend-defined runtime contract, which means the next highest-value parity win is not another tab but a truthful process/workspace surface on \`/agents/[id]/chat\`. Existing tasks cover browser workspace (TASK-2026-03-25-77), files/artifact preview (TASK-2026-03-25-78), cancellation primitives (TASK-2026-03-25-61), history pagination (TASK-2026-03-25-72), and deployment integrity (TASK-2026-03-25-74), but none currently define the richer terminal/process + file-navigation package that the active focus explicitly lists next.`
- User-testable outcome: `After one worker run, a human can open \`/agents/<id>/chat\`, ask the deployed agent to perform command-heavy work, and use the workspace to inspect each command/process with live or completed status, cwd, duration, exit outcome, and bounded stdout/stderr output. The operator can also jump from touched file paths in that terminal/process surface into the file workspace when available, or otherwise copy/open the documented path from the same page without reverse-engineering it from chat prose.`
- Next step: `Start by writing \`docs/knowledge-base/specs/SPEC-deployed-chat-terminal-process-state.md\`, then add the minimal backend/runtime event contract plus the deployed-chat terminal/process UI so command execution becomes a first-class operator surface instead of a best-effort markdown parser.`
- Blockers: `None. This should explicitly compose with TASK-2026-03-25-61 for stop/cancel semantics and with TASK-2026-03-25-78 for deeper file-opening flows, but the package itself is not captured anywhere in the backlog today and can define graceful interim behavior when those related slices are still in flight.`

#### Why this is important now

- `docs/project-focus.md` lists `Richer terminal/process state + file navigation` as the next suggested delivery slice after browser visibility and files/editor + artifact preview, so this is now the strongest remaining focus-aligned gap not already captured in `TODOS.md`.
- `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChat.tsx` already ships a browser workspace tab, but both the browser and terminal views still derive state by scraping streamed assistant text instead of consuming a structured runtime contract.
- The terminal workspace currently shows command strings only. It does not surface cwd, stdout/stderr separation, exit code, command grouping, process lifecycle, or touched-file navigation, so operators still have to infer what really happened from chat prose.
- `ruh-backend/src/app.ts` exposes no deployed-chat event normalization for terminal/process telemetry, which means the UI has no canonical source of truth for run state beyond whatever the model happened to print.
- `agent-builder-ui/e2e/tab-chat-terminal.spec.ts` currently proves parser behavior and terminal command visibility only; it does not assert truthful process state, output panes, touched paths, or terminal-to-file navigation.
- The active focus requires each worker run to leave a visible operator win on `/agents/[id]/chat`, and a structured terminal/process surface materially improves trust, debuggability, and handoff value even before broader connectors or productization work lands.

#### What to build

1. **Feature spec first** (`docs/knowledge-base/specs/SPEC-deployed-chat-terminal-process-state.md`):
   - Define the first shipped terminal/process-state contract for deployed-agent chat.
   - Document the event model the UI expects for command/process runs: run id, tool name, cwd, command/argv, lifecycle state, duration, exit status, bounded stdout/stderr payloads, and touched file paths.
   - Specify how terminal file-navigation composes with TASK-2026-03-25-78: open-in-files when the Files surface exists, and a documented fallback when it does not.
   - Reuse or reference TASK-2026-03-25-61 rather than inventing a second cancel/stop transport contract inside this spec.

2. **Backend/runtime event contract** (`ruh-backend/src/app.ts` plus helper(s) chosen by the spec):
   - Extend the deployed-chat streaming path so command/process activity can reach the UI as structured frames instead of only assistant-text heuristics.
   - Keep the first slice bounded: start event, optional incremental output/update event, finish event, and touched-path metadata are sufficient.
   - Fail closed when structured telemetry is missing or malformed rather than fabricating process state from partial text.

3. **Deployed-agent terminal/process UI** (`agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChat.tsx` and any extracted component):
   - Replace the current flat command list with grouped process rows/cards that show status, cwd, duration, exit outcome, and bounded output summaries.
   - Add output affordances that distinguish stdout from stderr and make it obvious when output was truncated or unavailable.
   - Preserve the existing reasoning/chat flow while making the workspace a truthful operator view of what ran during the task.

4. **Terminal-to-file navigation and controls** (`agent-builder-ui` deployed-chat workspace state, related helpers):
   - Surface touched file paths as explicit chips/rows so operators can navigate from command activity to affected files instead of copying paths out of prose.
   - When the Files workspace from TASK-2026-03-25-78 exists, wire those paths into that surface; otherwise provide a deterministic copy/open-path fallback documented by the spec.
   - If stop/retry controls are included in the first slice, keep them bound to the same run identity and cancellation semantics defined by TASK-2026-03-25-61 rather than inventing a parallel lifecycle.

5. **Regression coverage and docs** (`agent-builder-ui/e2e/tab-chat-terminal.spec.ts`, backend tests, KB/API docs):
   - Extend deployed-chat Playwright coverage so mocked process events prove the terminal workspace renders lifecycle state, outputs, and touched-path actions correctly.
   - Add backend route or helper tests for event normalization, output truncation rules, and malformed telemetry handling.
   - Update the KB/API notes so later browser/files/connectors slices extend the same runtime-workspace contract instead of adding more text-scraping heuristics.

#### Test suite

**Frontend terminal/process workspace tests** (`agent-builder-ui/e2e/` and targeted component tests if practical):
- A mocked command-heavy chat run renders grouped terminal/process rows with status, cwd, and duration rather than only raw command strings.
- Finished runs show the documented stdout/stderr and exit-state presentation without breaking active chat state.
- Touched file paths expose the expected open/copy affordance and stay scoped to the active conversation/sandbox.
- If stop/retry controls land in the first slice, the UI reflects the documented lifecycle transitions without stale cross-run state.

**Backend/route tests** (`ruh-backend/tests/unit/`, `ruh-backend/tests/integration/` as appropriate):
- Structured process events survive the deployed-chat proxy and retain run identity, lifecycle state, and bounded output metadata.
- Malformed or incomplete process payloads fail in the documented way rather than producing misleading terminal UI state.
- Non-process chat runs continue to work without emitting terminal-process frames.

**Operator verification**:
- On `/agents/<id>/chat`, a command-heavy prompt produces a terminal/process workspace that explains what ran, where it ran, and whether it succeeded.
- The operator can inspect touched file paths from that same workspace and move toward file ownership without mining assistant prose.
- Terminal/process visibility remains readable after the run completes and when switching between recent conversations on the same page.

#### Evaluation — task is done when
- [ ] Deployed-agent chat exposes a structured terminal/process workspace rather than only command strings inferred from free-form text
- [ ] Each supported command/process run shows lifecycle state, cwd, duration, and exit outcome in the workspace
- [ ] The first slice surfaces bounded stdout/stderr output and touched file paths in a documented, regression-tested way
- [ ] Terminal-to-file navigation composes with the Files workspace contract or provides the documented fallback when that workspace is unavailable
- [ ] Existing non-process chat behavior still works and workspace state remains isolated per conversation/sandbox
- [ ] KB/spec notes describe the terminal/process-state contract so later browser/files/connectors work can build on one shared runtime workspace model

### TASK-2026-03-25-78: Add files workspace and artifact preview surface to deployed-agent chat
- Status: `completed`
- Owner: `Worker-1`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChat.tsx`, `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/FilesPanel.tsx`, `agent-builder-ui/lib/openclaw/files-workspace.ts`, `agent-builder-ui/lib/openclaw/files-workspace.test.ts`, `agent-builder-ui/e2e/tab-chat-terminal.spec.ts`, `ruh-backend/src/app.ts`, `ruh-backend/src/workspaceFiles.ts`, `ruh-backend/tests/unit/workspaceFiles.test.ts`, `ruh-backend/tests/unit/auditApp.test.ts`, `docs/knowledge-base/000-INDEX.md`, `docs/knowledge-base/004-api-reference.md`, `docs/knowledge-base/008-agent-builder-ui.md`, `docs/knowledge-base/011-key-flows.md`, `docs/knowledge-base/specs/SPEC-deployed-chat-files-and-artifacts-workspace.md`
- Summary: `Completed the first deployed-agent files/artifacts slice. The chat workspace now includes a Files tab that lists recent sandbox outputs, reads inline-safe text previews, renders image previews, and exposes direct downloads. The backend now provides a bounded workspace-root list/read/download contract with relative-path enforcement so operators can inspect generated files from \`/agents/[id]/chat\` without leaving the product or reverse-engineering terminal output.`
- User-testable outcome: `After one worker run, a human can open \`/agents/<id>/chat\`, ask the deployed agent to create or modify workspace files, switch to a new Files workspace tab, inspect a file tree of touched workspace paths, open a text file in an inline viewer/editor, preview common generated artifacts such as markdown/HTML/images/PDF metadata in the same workspace, and download the selected file or artifact without digging through chat prose or raw terminal output.`
- Next step: `Build TASK-2026-03-25-80 so richer terminal/process state can deep-link into this new Files surface, then layer connector-aware research outputs and productization on top of the same workspace model.`
- Blockers: `None for the shipped slice. Full Playwright verification remains blocked in this environment by the local Chromium sandbox launch failure, and the repo-wide \`agent-builder-ui\` typecheck still fails on pre-existing issues in \`hooks/use-agents-store.test.ts\` and \`next.config.ts\`.`

#### Why this is important now

- `docs/project-focus.md` explicitly marks `Files/editor + artifact preview` as the next suggested delivery slice after browser visibility + takeover, so this is the strongest remaining focus-aligned gap once TASK-2026-03-25-77 exists.
- `docs/knowledge-base/008-agent-builder-ui.md` still documents the deployed-agent `Agent's Workspace` as `terminal` plus `thinking` only, which means files, editor state, and generated artifacts remain a confirmed product gap rather than a speculative enhancement.
- `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChat.tsx` parses streamed markdown and tool calls into reasoning plus terminal-like output, but it has no file tree state, no selected-path model, and no artifact preview surface.
- `ruh-backend/src/app.ts` currently exposes no deployed-chat route for listing workspace files, reading a file body, or returning artifact metadata/download URLs, so the UI has no canonical backend contract to build on.
- `agent-builder-ui/e2e/tab-chat-terminal.spec.ts` already includes terminal-oriented expectations like `List workspace files`, but that command still resolves only to chat/terminal text today; there is no assertionable workspace-files surface yet.
- The active focus specifically asks for visible operator wins on `/agents/[id]/chat`, and files/artifacts are the next highest-leverage way to turn agent output into inspectable, portable work instead of opaque chat responses.

#### What to build

1. **Feature spec first** (`docs/knowledge-base/specs/SPEC-deployed-chat-files-and-artifacts-workspace.md`):
   - Define the first shipped files/editor + artifact parity slice for deployed-agent chat.
   - Document the backend contract for listing workspace paths, reading file content, and classifying previewable artifacts versus plain files.
   - Define the UI state model: touched-files list vs browsable tree, selected file, preview type, download behavior, and what remains explicitly out of scope for the first slice.
   - Add backlinks in `[[004-api-reference]]`, `[[008-agent-builder-ui]]`, and `[[011-key-flows]]`.

2. **Backend workspace file/artifact read contract** (`ruh-backend/src/app.ts` plus helper(s) chosen by the spec):
   - Add one bounded route for listing relevant workspace files for the active sandbox, with the first slice allowed to focus on touched/generated files rather than an unbounded recursive browser of the whole filesystem.
   - Add one bounded file-read route for text-safe content plus metadata such as size, mime-ish type, modified time, and whether the file is previewable inline.
   - Add one download/stream path for selected files or artifacts so the browser UI can hand the operator the real output rather than a lossy chat copy.
   - Fail closed on paths outside the intended sandbox workspace root instead of letting the client request arbitrary container paths.

3. **Deployed-agent chat Files workspace UI** (`agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChat.tsx`, `page.tsx` if needed):
   - Add a `files` workspace tab alongside the existing `terminal` and `thinking` tabs, and design it so the browser slice can later coexist with the same workspace model.
   - Render a file list/tree for the active run plus a recent persisted view when available, with an empty state that explains when files/artifacts appear.
   - Show a text viewer/editor pane for editable text formats and a preview pane for common generated artifacts such as markdown, HTML, JSON, images, and PDF metadata/download state.
   - Add clear download/copy actions so operators can take ownership of generated code/assets directly from the chat workspace.

4. **Workspace state wiring and boundaries** (`agent-builder-ui` chat state, route docs, related helpers):
   - Keep selected-file and artifact state scoped to the active conversation/run so switching chats or sandboxes does not leak one run's files into another.
   - Decide and document whether the first slice persists only metadata for recent files/artifacts or also caches file content; if caching is deferred, make the empty/loading states explicit.
   - Preserve current reasoning/terminal behavior while layering the new Files surface in parallel rather than replacing the existing workspace panel.

5. **Regression coverage and docs** (`agent-builder-ui/e2e/tab-chat-terminal.spec.ts`, backend tests, KB updates):
   - Extend deployed-chat Playwright coverage so mocked file/artifact responses prove the Files tab renders file lists, previews, and download affordances correctly.
   - Add backend route tests for workspace-root enforcement, preview classification, and bounded reads.
   - Update KB/API notes so later richer editor/diff/export work and artifact gallery work extend the same contract instead of inventing parallel surfaces.

#### Test suite

**Frontend files/artifact workspace tests** (`agent-builder-ui/e2e/` and targeted component tests if practical):
- A mocked file-producing chat run exposes a Files workspace tab and shows the expected touched/generated paths.
- Selecting a text file opens its contents in the inline viewer/editor pane without breaking the active chat state.
- Selecting a previewable artifact shows the correct preview or preview metadata state and exposes download/copy actions.
- Switching conversations or sandboxes clears or isolates file/artifact workspace state correctly.

**Backend/route tests** (`ruh-backend/tests/unit/`, `ruh-backend/tests/integration/` as appropriate):
- Workspace file listing and read routes enforce the intended sandbox workspace root and reject traversal/out-of-root requests.
- Preview classification is deterministic for the supported first-slice formats and does not mislabel unknown binaries as inline-safe text.
- Nonexistent files, oversized/unsupported previews, or unreadable paths fail in the documented way rather than returning misleading empty content.

**Operator verification**:
- On `/agents/<id>/chat`, a file-creating prompt produces a visible Files workspace surface instead of burying generated paths in assistant prose or terminal snippets.
- The operator can inspect the content of a touched text file and preview a supported generated artifact from the same chat page.
- Downloading the selected file or artifact yields the underlying sandbox output the operator expects to keep or hand off.

#### Evaluation — task is done when
- [ ] Deployed-agent chat exposes a Files workspace tab alongside the existing terminal and thinking surfaces
- [ ] The backend exposes a documented bounded contract for listing, reading, and downloading workspace files/artifacts under the intended sandbox root
- [ ] Operators can inspect a touched text file in an inline viewer/editor and preview at least one class of generated artifact from the same workspace
- [ ] File/artifact workspace state is isolated per conversation/sandbox and does not leak across chat switches
- [ ] Regression coverage proves the Files workspace UI and backend path-safety contract work as documented
- [ ] KB/spec notes describe the files/editor + artifact workspace contract so later diff/export/gallery work builds on the same surface

### TASK-2026-03-25-84: Add parseJsonOutput malformed-prefix recovery regression
- Status: `completed`
- Owner: `Tester-1`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `ruh-backend/tests/unit/parseJsonOutputRecovery.test.ts`, `/Users/prasanjitdey/.codex/automations/tester-1/memory.md`
- Summary: `Added one bounded backend unit regression for \`parseJsonOutput()\` so malformed earlier JSON-like log fragments do not mask a later valid payload in the same CLI output stream. This extends the existing parser coverage without changing production code or overlapping the active feature-package work.`
- Next step: `Look for the next cheap pure-helper branch in backend or builder parsing code that can be locked with a single-file unit test.`
- Blockers: `None`

### TASK-2026-03-25-77: Add browser workspace timeline and takeover surface to deployed-agent chat
- Status: `completed`
- Owner: `Worker-1`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChat.tsx`, `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/BrowserPanel.tsx`, `agent-builder-ui/lib/openclaw/browser-workspace.ts`, `agent-builder-ui/lib/openclaw/browser-workspace.test.ts`, `agent-builder-ui/e2e/tab-chat-terminal.spec.ts`, `docs/knowledge-base/000-INDEX.md`, `docs/knowledge-base/004-api-reference.md`, `docs/knowledge-base/008-agent-builder-ui.md`, `docs/knowledge-base/011-key-flows.md`, `docs/knowledge-base/specs/SPEC-deployed-chat-browser-workspace.md`
- Summary: `Completed the first browser workspace slice for deployed-agent chat. The Browser tab now consumes structured browser SSE frames (`browser` / `browser_event`) for navigation/action/screenshot/preview/takeover state, renders those events in a dedicated timeline, shows preview URLs and screenshots in the Browser panel, and exposes a visible operator takeover/resume banner instead of relying only on assistant prose.`
- Next step: `Build TASK-2026-03-25-78 on top of the same workspace model so file/artifact ownership composes with browser activity instead of introducing a separate ad hoc state shape.`
- Blockers: `None for this slice. The backend chat proxy already preserved raw SSE frames, so richer server-side normalization/replay persistence can remain future work if the browser event taxonomy expands.`

### TASK-2026-03-25-76: Activate Manus-style workspace parity project focus
- Status: `completed`
- Owner: `Codex`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `docs/project-focus.md`, `docs/journal/2026-03-25.md`, `docs/knowledge-base/learnings/LEARNING-2026-03-25-manus-parity-focus.md`, `docs/knowledge-base/008-agent-builder-ui.md`
- Summary: `The project focus document was still effectively empty, so analyst runs had no explicit product direction. This update turned \`docs/project-focus.md\` into an active, researched steering brief for Manus-style deployed-agent workspace parity on the chat page, with concrete capability buckets around browser use, code/editor use, terminal/computer use, artifact outputs, connectors/research, and productization surfaces.`
- Next step: `Let the next analyst run derive one feature package from the new focus brief, prioritizing visible improvements on \`/agents/[id]/chat\` such as browser workspace parity, file/editor surfaces, artifact previews, or connector-aware workflows.`
- Blockers: `None`

#### What changed

1. Set `docs/project-focus.md` to `active` and replaced the placeholder sections with an explicit parity brief tied to the deployed-agent chat surface.
2. Added a researched Manus feature baseline with official documentation links so future analyst runs do not need to rediscover the competitive scope from scratch.
3. Recorded the resulting durable guidance in a learning note and linked it from the Agent Builder UI KB note.

### TASK-2026-03-25-75: Shift maintainer automations to feature-at-a-time delivery
- Status: `completed`
- Owner: `Codex`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `docs/plans/2026-03-25-feature-at-a-time-automation-contract-design.md`, `docs/plans/2026-03-25-feature-at-a-time-automation-contract.md`, `docs/knowledge-base/000-INDEX.md`, `docs/knowledge-base/001-architecture.md`, `docs/knowledge-base/012-automation-architecture.md`, `docs/knowledge-base/013-agent-learning-system.md`, `docs/knowledge-base/specs/SPEC-feature-at-a-time-automation-contract.md`, `docs/knowledge-base/specs/SPEC-automation-agent-roles.md`, `docs/knowledge-base/specs/SPEC-analyst-project-focus.md`, `docs/knowledge-base/specs/SPEC-agent-learning-and-journal.md`, `agents/README.md`, `agents/analyst-1.md`, `agents/worker-1.md`, `.agents/agents/README.md`, `.agents/agents/analyst-1.md`, `.agents/agents/worker-1.md`, `docs/project-focus.md`, `CLAUDE.md`, `agents.md`, `docs/knowledge-base/learnings/LEARNING-2026-03-25-feature-at-a-time-automation-contract.md`, `docs/journal/2026-03-25.md`, `/Users/prasanjitdey/.codex/automations/analyst-1/automation.toml`, `/Users/prasanjitdey/.codex/automations/worker-1/automation.toml`, `/Users/prasanjitdey/.codex/automations/analyst-1/memory.md`, `/Users/prasanjitdey/.codex/automations/worker-1/memory.md`
- Summary: `The repo's maintainer automation contract previously told \`Analyst-1\` to add one missing task and \`Worker-1\` to execute one isolated task, which encouraged partial delivery and spec-only slices. This change redefines the unit of work as one feature package per run: analyst runs must add one feature-oriented TODO entry with a testable outcome and implementation path, and worker runs must complete one whole feature end-to-end unless a real blocker prevents safe completion.`
- Next step: `Let the next scheduled \`Analyst-1\` run create a feature package using the new contract, then let the next \`Worker-1\` run execute one such feature end-to-end and refine the wording only if that first live run exposes ambiguity.`
- Blockers: `None`

#### What changed

1. Added [[SPEC-feature-at-a-time-automation-contract]] and updated the KB/index/spec layer so the new feature-package contract is canonical.
2. Updated `CLAUDE.md`, `agents.md`, `agents/`, `.agents/agents/`, and `docs/project-focus.md` so the written role contracts now describe one feature package per run.
3. Updated the live `analyst-1` and `worker-1` automation TOMLs plus their memory files so the next scheduled run uses the new feature-oriented prompts immediately.

### TASK-2026-03-25-74: Normalize agent-to-sandbox deployments into a first-class relation
- Status: `active`
- Owner: `Analyst-1`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `ruh-backend/src/app.ts`, `ruh-backend/src/agentStore.ts`, `ruh-backend/src/store.ts`, `agent-builder-ui/hooks/use-agents-store.ts`, `agent-builder-ui/app/(platform)/agents/[id]/deploy/page.tsx`, `agent-builder-ui/app/(platform)/agents/[id]/chat/page.tsx`, `docs/knowledge-base/005-data-models.md`, `docs/knowledge-base/008-agent-builder-ui.md`, `docs/knowledge-base/011-key-flows.md`, `docs/knowledge-base/specs/`
- Summary: `Agent deployment state is still modeled as a loose JSONB array of sandbox IDs on the \`agents\` row instead of a first-class deployment relation. In \`ruh-backend/src/app.ts\`, \`POST /api/agents/:id/sandbox\` validates only that the agent exists and that the request body contains a non-empty \`sandbox_id\`, but it never checks that the referenced sandbox exists before persisting the association. In \`ruh-backend/src/agentStore.ts\`, \`addSandboxToAgent()\` just appends that ID into \`agents.sandbox_ids\`, which means the database cannot enforce referential integrity, ownership, deployment status, timestamps, or cleanup. Existing backlog items cover undeploy cleanup, create idempotency, config-apply fail-closed behavior, runtime drift, and ownership scoping, but none define the underlying deployment-state model those features can safely compose with.`
- Next step: `Start by writing \`docs/knowledge-base/specs/SPEC-agent-sandbox-deployment-relation.md\`, then replace the ad hoc \`agents.sandbox_ids\` array contract with a backend-owned deployment relation that validates sandbox existence on attach, tracks deployment status/metadata explicitly, and gives frontend deploy/chat views a canonical source of truth.`
- Blockers: `None. This complements TASK-2026-03-25-12 (undeploy cleanup), TASK-2026-03-25-19 (create quotas/idempotency), TASK-2026-03-25-24 (config-apply fail-closed), TASK-2026-03-25-31 (runtime drift), and TASK-2026-03-25-10 (ownership scoping), but none of those tasks currently replace the weak \`sandbox_ids\` data model itself.`

#### Why this is important now

- `ruh-backend/src/app.ts` currently accepts `POST /api/agents/:id/sandbox` after only `getAgentRecord()` plus body-shape validation, so a caller can persist an arbitrary sandbox ID that does not correspond to a real sandbox row.
- `ruh-backend/src/agentStore.ts` stores deployments as `agents.sandbox_ids JSONB`, which gives the repo no foreign keys, no attach/detach timestamps, no deployment status, and no place to record why an attachment is pending, failed, or stale.
- `agent-builder-ui/hooks/use-agents-store.ts` treats `sandbox_ids` as the canonical deployment source for the UI, so frontend state inherits any stale, deleted, or never-real sandbox IDs that the backend stored.
- TASK-2026-03-25-12 currently has to reason about undeploy and stale cleanup around that array, and TASK-2026-03-25-24 has to delay `addSandboxToAgent()` until config apply succeeds, but both are still building on a persistence model that cannot represent deployment lifecycle states directly.
- TASK-2026-03-25-19 and TASK-2026-03-25-32 need reliable create-job reuse and restart recovery; without a first-class deployment record, they can only infer intent indirectly from a mutable string array.
- TASK-2026-03-25-10 will add owner/workspace scoping, but a JSONB ID list cannot express per-deployment ownership checks or clean joins once multi-user authorization lands.

#### What to build

1. **Feature spec first** (`docs/knowledge-base/specs/SPEC-agent-sandbox-deployment-relation.md`):
   - Define the canonical deployment relation between agents and sandboxes.
   - Decide whether the first implementation uses a join table such as `agent_sandboxes` / `agent_deployments`, or an equivalent normalized model with one row per deployment.
   - Define required fields now: `agent_id`, `sandbox_id`, lifecycle `status`, `created_at`, `updated_at`, and any bounded attach metadata needed by deploy, undeploy, and recovery flows.
   - Add backlinks in `[[005-data-models]]`, `[[008-agent-builder-ui]]`, and `[[011-key-flows]]`.

2. **Backend data-model normalization** (`ruh-backend/src/agentStore.ts`, `ruh-backend/src/store.ts`, migration path chosen in TASK-2026-03-25-23):
   - Introduce one backend-owned persistence path for deployment relations instead of treating `agents.sandbox_ids` as the long-term source of truth.
   - Validate sandbox existence before an attach is accepted.
   - Define cleanup semantics for deleted sandboxes and deleted agents so stale relations are removed transactionally rather than by best-effort array edits.
   - Keep any temporary compatibility layer explicit if the frontend still reads `sandbox_ids` during migration.

3. **Route contract updates** (`ruh-backend/src/app.ts`, `docs/knowledge-base/004-api-reference.md`):
   - Make `POST /api/agents/:id/sandbox` fail closed when the sandbox does not exist or cannot be attached under the current deployment contract.
   - Add one canonical read shape for agent deployments so consumers do not have to infer lifecycle state from a raw ID list.
   - Ensure future undeploy and ownership work can reuse the same relation helpers instead of editing array JSON in multiple places.

4. **Frontend deployment-state consumers** (`agent-builder-ui/hooks/use-agents-store.ts`, `agent-builder-ui/app/(platform)/agents/[id]/deploy/page.tsx`, `agent-builder-ui/app/(platform)/agents/[id]/chat/page.tsx`):
   - Stop assuming `sandboxIds: string[]` is sufficient to represent deployment state.
   - Consume the normalized backend deployment shape so deploy UI, chat-page sandbox selection, and future undeploy actions can distinguish `attached`, `pending_config`, `failed`, `deleted`, or other states chosen by the spec.
   - Keep current UX working during the migration, but avoid duplicating business rules in the client that belong in the backend relation model.

5. **Docs and compatibility guidance** (`docs/knowledge-base/005-data-models.md`, `docs/knowledge-base/008-agent-builder-ui.md`, `docs/knowledge-base/011-key-flows.md`):
   - Replace the implicit “agent owns a JSONB array of sandbox IDs” narrative with the explicit deployment-relation contract.
   - Document how this relation composes with undeploy cleanup, deployment verification, runtime drift repair, and future ownership scoping.
   - Call out any temporary compatibility fields so future agents know which field is canonical during rollout.

#### Test suite

**Backend unit/integration tests** (`ruh-backend/tests/unit/`, `ruh-backend/tests/integration/`):
- Attaching a sandbox fails with `404` or the documented non-success response when the sandbox row does not exist.
- The backend persists one normalized deployment relation per valid attach and does not create duplicate active relations for the same agent/sandbox pair.
- Deleting a sandbox or deleting an agent removes or transitions the related deployment rows according to the spec instead of leaving orphaned deploy state.
- Deployment read helpers return stable lifecycle metadata rather than an untyped raw ID array.

**Frontend tests** (`agent-builder-ui` store/page tests as appropriate):
- Agent fetch/store logic preserves the new deployment relation shape and no longer assumes `sandboxIds` is the only source of truth.
- Deploy flow does not render a sandbox as fully deployed unless the backend relation reaches the documented success state.
- Chat/deployed-agent screens handle missing, deleted, or failed deployment entries deterministically instead of trying to use stale IDs.

**Operational verification**:
- A manual or buggy `POST /api/agents/:id/sandbox` request cannot create a deployment to a nonexistent sandbox.
- Deleting a sandbox no longer leaves agent deployment state pointing at a row that no longer exists.
- The normalized relation provides enough lifecycle information that TASK-12 undeploy cleanup, TASK-24 config verification, and TASK-31 runtime drift work can build on one canonical deployment source of truth.

#### Evaluation — task is done when
- [ ] Agent-to-sandbox deployment state is represented by a documented normalized relation instead of only `agents.sandbox_ids`
- [ ] Attach routes validate sandbox existence before persisting deployment state
- [ ] Backend helpers and delete flows maintain deployment referential integrity without best-effort array cleanup
- [ ] Frontend deploy/chat surfaces consume the canonical deployment relation rather than inferring state from a raw ID list
- [ ] Tests cover invalid attach, duplicate attach, delete cleanup, and deployment-state reads
- [ ] KB/API notes describe the deployment relation and how future lifecycle work should extend it

### TASK-2026-03-25-72: Add paginated conversation history and bounded transcript loading
- Status: `completed`
- Owner: `Worker-1`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `ruh-backend/src/app.ts`, `ruh-backend/src/conversationStore.ts`, `ruh-backend/tests/unit/conversationStore.test.ts`, `ruh-backend/tests/e2e/conversationLifecycle.test.ts`, `ruh-frontend/components/ChatPanel.tsx`, `ruh-frontend/components/HistoryPanel.tsx`, `ruh-frontend/components/MissionControlPanel.tsx`, `ruh-frontend/__tests__/components/HistoryPanel.test.tsx`, `ruh-frontend/__tests__/components/ChatPanel.test.tsx`, `ruh-frontend/__tests__/helpers/server.ts`, `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChat.tsx`, `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChats.tsx`, `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabMissionControl.tsx`, `agent-builder-ui/e2e/tab-chat-terminal.spec.ts`, `agent-builder-ui/e2e/tab-settings-model.spec.ts`, `docs/knowledge-base/000-INDEX.md`, `docs/knowledge-base/004-api-reference.md`, `docs/knowledge-base/007-conversation-store.md`, `docs/knowledge-base/008-agent-builder-ui.md`, `docs/knowledge-base/009-ruh-frontend.md`, `docs/knowledge-base/specs/SPEC-conversation-history-pagination.md`
- Summary: `Completed the bounded conversation-history read contract. Added [[SPEC-conversation-history-pagination]], implemented cursor-based backend helpers for conversation lists and per-conversation message windows, updated both chat UIs to load only the newest page first with explicit load-more controls for older history, and aligned supporting mission-control counts plus test fixtures with the new page shape.`
- Next step: `Follow up separately on the repo test harness issues that limited broader verification: the Bun + supertest route harness still cannot bind a local listener in this sandbox, and ruh-frontend's Jest/TypeScript setup still depends on missing \`ts-node\` / test-runner typings.`
- Blockers: `Feature implementation is complete. Broader verification remains partially blocked by existing repo test-environment issues rather than this pagination work.`

#### Why this is important now

- `ruh-backend/src/conversationStore.ts:listConversations()` runs `SELECT * FROM conversations WHERE sandbox_id = $1 ORDER BY updated_at DESC` and returns the full row set for every sandbox with no default cap or cursor.
- `ruh-backend/src/conversationStore.ts:getMessages()` runs `SELECT role, content FROM messages WHERE conversation_id = $1 ORDER BY id` and returns the full transcript, so message payload size grows monotonically with conversation age.
- `ruh-frontend/components/HistoryPanel.tsx` calls `GET /api/sandboxes/:sandbox_id/conversations` on load and holds the whole list in memory before sorting again in the browser.
- `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChats.tsx` does the same for deployed-agent conversation history, so both UIs inherit the same unbounded list behavior.
- `ruh-frontend/components/ChatPanel.tsx` and `agent-builder-ui/.../TabChat.tsx` fetch `GET /api/sandboxes/:sandbox_id/conversations/:conv_id/messages` and render the complete transcript immediately whenever a conversation is opened.
- No KB note or API doc currently defines a pagination, cursor, or "newest window first" contract for conversation history, so future work has no canonical bounded-read pattern to extend.
- TASK-2026-03-25-38 makes chat persistence backend-owned and more reliable, which is good for user trust but also means these unbounded read paths will hit complete histories more often rather than silently missing data.

#### What to build

1. **Feature spec first** (`docs/knowledge-base/specs/SPEC-conversation-history-pagination.md`):
   - Define the read contract for sandbox conversation lists and per-conversation message history.
   - Pick stable pagination semantics that work well for append-only chat history: keyset/cursor pagination rather than offset scans.
   - Document default page sizes, maximum allowed limits, sort direction, and whether responses expose `next_cursor`, `has_more`, or both.
   - Add backlinks in `[[004-api-reference]]`, `[[007-conversation-store]]`, `[[008-agent-builder-ui]]`, and `[[009-ruh-frontend]]`.

2. **Backend pagination helpers** (`ruh-backend/src/conversationStore.ts`):
   - Replace the current unbounded helpers with bounded query functions such as `listConversationsPage()` and `getMessagesPage()`.
   - Use indexed keyset filters (`updated_at` + `id` for conversations, monotonic `id` for messages) so deeper history loads do not degrade into large offset scans.
   - Keep the message response compatible with existing role/content rendering while adding the metadata needed for incremental history loading.

3. **HTTP contract updates** (`ruh-backend/src/app.ts`, `docs/knowledge-base/004-api-reference.md`):
   - Extend `GET /api/sandboxes/:sandbox_id/conversations` to accept bounded pagination inputs such as `limit` and cursor params, and return a documented page shape instead of a bare array.
   - Extend `GET /api/sandboxes/:sandbox_id/conversations/:conv_id/messages` with the same bounded contract for transcript windows.
   - Validate and clamp page-size inputs so callers cannot bypass the intended limits with extreme query values.

4. **Frontend history loading** (`ruh-frontend/components/HistoryPanel.tsx`, `ruh-frontend/components/ChatPanel.tsx`, `agent-builder-ui/.../TabChats.tsx`, `agent-builder-ui/.../TabChat.tsx`):
   - Load only the newest conversation page and newest message window initially.
   - Add explicit "load more" affordances or reverse-infinite-scroll behavior for older conversations/messages instead of silently preloading everything.
   - Preserve current UX expectations around newest-first conversation lists and chronological message rendering when older pages are appended.
   - Keep selected-conversation transitions safe so opening one conversation does not briefly render stale history from another page load.

5. **Regression coverage and docs** (`ruh-backend/tests/unit/`, `ruh-backend/tests/integration/`, frontend tests if practical):
   - Add tests that lock the page-shape contract, default limits, cursor advancement, and boundary conditions.
   - Cover frontend behavior for initial page load plus one incremental older-history fetch so the new contract stays usable, not just theoretically bounded.
   - Update KB/API notes so future chat/history work reuses the same read-side scaling contract.

#### Test suite

**Backend unit/integration tests** (`ruh-backend/tests/unit/`, `ruh-backend/tests/integration/`):
- Conversation list endpoint returns only the documented default page size and includes pagination metadata.
- Message history endpoint returns the newest window first, then older messages when the caller supplies the next cursor.
- Invalid, missing, negative, zero, or oversized limit/cursor params fail cleanly per the documented contract.
- Pagination remains stable when new messages are appended between requests; callers do not receive duplicated or skipped messages within one traversal pattern.

**Frontend tests** (`ruh-frontend/__tests__/`, `agent-builder-ui` component/unit tests as appropriate):
- Opening history loads only the first page rather than the whole conversation set.
- Opening a conversation loads the newest message window and can fetch older pages explicitly.
- Older-page fetches append in the correct order without duplicating already-rendered messages.
- Switching conversations mid-load does not leak history from the prior conversation into the new one.

**Operational verification**:
- A sandbox with many conversations still opens the history tab promptly because the first response is capped.
- A long transcript can be opened and scrolled progressively without one oversized JSON payload or full re-render of every stored message.
- API docs clearly state the page contract so other clients do not assume bare-array full-history responses forever.

#### Evaluation — task is done when
- [ ] Conversation list and message history endpoints expose a documented bounded pagination contract instead of returning entire history sets
- [ ] Backend queries use cursor/keyset semantics and enforce sane default and maximum page sizes
- [ ] Both shipped chat UIs load the newest window first and fetch older history explicitly
- [ ] Opening large histories no longer requires one full transcript fetch before the UI becomes usable
- [ ] Tests cover page metadata, cursor traversal, invalid query params, and frontend incremental loading behavior
- [ ] KB/API notes describe the new history-read contract so future chat work composes with it

### TASK-2026-03-25-70: Fail backend readiness when Docker daemon is unavailable
- Status: `active`
- Owner: `Analyst-1`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `ruh-backend/src/startup.ts`, `ruh-backend/src/app.ts`, `ruh-backend/src/docker.ts`, `ruh-backend/src/backendReadiness.ts`, `ruh-backend/tests/unit/`, `ruh-backend/tests/integration/`, `docs/knowledge-base/002-backend-overview.md`, `docs/knowledge-base/003-sandbox-lifecycle.md`, `docs/knowledge-base/010-deployment.md`, `docs/knowledge-base/specs/`
- Summary: `The backend currently treats database initialization as the whole readiness contract even though the product's control plane depends just as heavily on Docker. \`startBackend()\` in \`ruh-backend/src/startup.ts\` initializes Postgres-backed stores and immediately starts listening without any Docker probe, \`GET /ready\` only reflects a process-local boolean, and \`GET /health\` returns unconditional success. Meanwhile sandbox creation, deletion, LLM reconfigure, shared-Codex retrofit, cron mutation, channel config, pairing approval, and most statusful sandbox operations all fail through Docker helpers. Operators and orchestrators can therefore see a "healthy" backend while every sandbox operation is already doomed because the Docker daemon is stopped, wedged, or unreachable. This task defines a fail-closed Docker dependency-health contract for startup, readiness, and Docker-backed route behavior.`
- Next step: `Start by writing \`docs/knowledge-base/specs/SPEC-docker-dependency-health.md\`, then add one shared Docker-daemon probe used by backend startup, \`/ready\`, and Docker-backed routes so daemon-unavailable states become deterministic startup or \`503\` failures instead of first-user-action surprises.`
- Blockers: `None. This complements TASK-2026-03-25-11 (DB readiness), TASK-2026-03-25-53 (real Docker timeouts), TASK-2026-03-25-60 (structured logging/health output), and TASK-2026-03-25-31 (sandbox runtime drift), but none of those currently make Docker availability part of the backend readiness contract itself.`

#### Why this is important now

- `ruh-backend/src/startup.ts` only validates the PostgreSQL path before listening. If Postgres is healthy but Docker is down, the backend still marks itself ready and accepts traffic.
- `ruh-backend/src/app.ts` exposes `GET /health` as unconditional `{ status: 'ok' }` and `GET /ready` as a wrapper around `backendReadiness.ts`, which currently tracks only startup completion rather than live dependency availability.
- `ruh-backend/src/sandboxManager.ts` drives sandbox create, retrofit, reconfigure, and cleanup through `dockerSpawn()` and `dockerExec()`, so the backend's core product flows are unavailable whenever the daemon is unavailable.
- `ruh-backend/src/app.ts` also routes configure-agent, cron operations, channel operations, and pairing approval through Docker-backed helpers; those endpoints do not have a dedicated dependency-health gate today.
- `docs/knowledge-base/010-deployment.md` correctly lists Docker as a prerequisite, but the runtime check section documents only DB-backed readiness. That mismatch makes operator health signals weaker than the actual runtime dependency graph.
- TASK-2026-03-25-60 notes in passing that `/health` does not probe Docker daemon availability, but its implementation scope is observability. The repo still lacks a separate requirement that says when startup should fail, when readiness should drop, and how Docker-backed routes should respond when Docker is unavailable.

#### What to build

1. **Feature spec first** (`docs/knowledge-base/specs/SPEC-docker-dependency-health.md`):
   - Define the backend's Docker dependency contract: what startup must verify before listening, what `/ready` and `/health` should report, and which routes must fail closed when Docker is unavailable.
   - Decide whether startup should hard-fail when Docker is missing/unreachable or whether a documented degraded mode is acceptable for any subset of routes.
   - Add backlinks in `[[002-backend-overview]]`, `[[003-sandbox-lifecycle]]`, and `[[010-deployment]]`.

2. **Shared Docker-daemon probe** (`ruh-backend/src/docker.ts` or a new helper module):
   - Add a small probe such as `docker info` / `docker version` with a real timeout and normalized success/failure shape.
   - Classify common dependency failures distinctly: docker binary missing, daemon unreachable, permission denied, timeout.
   - Keep the probe reusable by startup, health endpoints, and route-level dependency guards.

3. **Startup + readiness integration** (`ruh-backend/src/startup.ts`, `ruh-backend/src/backendReadiness.ts`, `ruh-backend/src/app.ts`):
   - Run the Docker probe during backend startup before the service is marked ready.
   - Make `/ready` return `503` whenever required dependencies are not currently available, not just when initial DB setup failed.
   - Keep `/health` as an operator-readable dependency view that includes Docker status even if the final spec keeps it liveness-friendly.

4. **Route-level fail-closed behavior** (`ruh-backend/src/app.ts`, Docker-backed helpers):
   - Introduce one shared guard or helper path so Docker-backed routes return a deterministic `503` dependency-unavailable response instead of surfacing raw spawn failures after partial work begins.
   - Cover at least the highest-value Docker-backed surfaces first: sandbox create/delete, configure-agent, cron mutation, channel mutation, pairing approval, shared-Codex retrofit, and LLM reconfigure.
   - Keep the failure contract aligned with TASK-2026-03-25-53 so a hung daemon and an unavailable daemon are distinguishable cases once timeout enforcement lands.

5. **Docs and verification** (`docs/knowledge-base/002-backend-overview.md`, `docs/knowledge-base/003-sandbox-lifecycle.md`, `docs/knowledge-base/010-deployment.md`):
   - Update the KB and deployment notes so they describe Docker as a first-class runtime dependency, not just a local prerequisite.
   - Document what operators should expect from startup logs, `/ready`, and route responses when Docker is down.
   - Note how this contract composes with structured logging and future sandbox drift/reconciliation work so agents do not duplicate health semantics later.

#### Test suite

**Unit tests** (`ruh-backend/tests/unit/`):
- Docker probe helper reports success when the daemon responds and returns a classified failure when the command exits non-zero, times out, or the binary is missing.
- `startBackend()` does not call `listen()` when the Docker dependency probe fails under the chosen startup contract.
- Readiness-state helpers surface Docker-unavailable reasons without losing the existing DB-readiness behavior.

**Integration / route tests** (`ruh-backend/tests/integration/` or targeted route tests):
- `GET /ready` returns `503` when Docker is unavailable even if DB initialization succeeded.
- Docker-backed routes return the documented `503` dependency-unavailable response before attempting partial lifecycle work when the daemon probe fails.
- `/health` returns component-level dependency status including Docker according to the selected response contract.

**Operational verification**:
- Starting the backend with Docker stopped fails closed or stays unready per the spec instead of advertising a healthy control plane.
- Restarting Docker after the backend is up restores readiness without a process restart if the chosen contract supports runtime recovery.
- Compose/Kubernetes probe guidance and local-dev docs describe the Docker dependency expectations accurately.

#### Evaluation — task is done when
- [ ] The backend has one documented Docker dependency-health spec instead of relying on ad hoc spawn failures
- [ ] Startup no longer advertises a ready backend when Docker is unavailable under the chosen contract
- [ ] `/ready` reflects Docker dependency availability, not just DB initialization state
- [ ] `/health` or an equivalent operator-facing endpoint reports Docker status explicitly
- [ ] Docker-backed routes fail with a deterministic dependency-unavailable contract instead of raw first-use spawn errors
- [ ] Automated tests cover startup failure/unready behavior, route behavior, and health/readiness reporting for Docker-unavailable scenarios
- [ ] KB/deployment docs describe Docker as a first-class runtime dependency for the backend control plane

### TASK-2026-03-25-71: Pin OpenClaw sandbox bootstrap version and remove `@latest` drift
- Status: `active`
- Owner: `Analyst-1`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `ruh-backend/src/sandboxManager.ts`, `ruh-backend/src/docker.ts`, `ruh-backend/tests/unit/`, `docs/knowledge-base/003-sandbox-lifecycle.md`, `docs/knowledge-base/010-deployment.md`, `docs/knowledge-base/specs/`
- Summary: `Sandbox creation still installs OpenClaw with \`npm install -g openclaw@latest\`, and the KB documents that same floating contract as a normal lifecycle step. That means every new sandbox can silently pick up a different OpenClaw release depending on npm publish timing, so onboarding behavior, gateway defaults, auth bootstrap, and downstream compatibility can drift across sandboxes without any repo change, operator decision, or rollback handle. Existing backlog items cover runtime resource caps, Docker timeout enforcement, request validation, gateway hardening, and env validation, but none make the sandbox runtime itself reproducible once the container is admitted and bootstrap begins.`
- Next step: `Write \`docs/knowledge-base/specs/SPEC-sandbox-openclaw-version-pinning.md\`, then replace the hardcoded \`openclaw@latest\` install path in \`createOpenclawSandbox()\` with a documented pinned package/version contract plus focused tests and deployment docs.`
- Blockers: `None. Coordinate with TASK-2026-03-25-69 (centralized config validation) if the chosen pinning mechanism is env-configurable, but the version-pinning contract itself is a separate reliability boundary and can be specified immediately.`

#### Why this is important now

- `ruh-backend/src/sandboxManager.ts` currently logs `Installing OpenClaw (npm install -g openclaw@latest)...` and runs `npm install -g openclaw@latest`, retrying the same floating package with `--unsafe-perm` on failure.
- `docs/knowledge-base/003-sandbox-lifecycle.md` codifies `docker exec: npm install -g openclaw@latest` as the expected create flow, so the repo currently documents non-determinism rather than treating it as an accident.
- A newly published OpenClaw release can therefore change onboarding flags, config-file shape, gateway behavior, auth bootstrap, or device-approval behavior for only newly created sandboxes while older sandboxes keep whatever version they already installed.
- That drift is hard to diagnose because the repo has no operator-controlled pin, no explicit upgrade workflow, and no documented rollback path when a fresh sandbox starts failing after an upstream npm release.
- Resource caps, timeouts, readiness, and auth hardening all assume the underlying sandbox bootstrap is reasonably reproducible; leaving the core runtime package floating undermines those contracts and makes regressions appear “random” across creation time.

#### What to build

1. **Feature spec first** (`docs/knowledge-base/specs/SPEC-sandbox-openclaw-version-pinning.md`):
   - Define the canonical bootstrap package contract for sandbox creation: pinned exact version vs pinned package string, default value, optional operator override, and rollback expectations.
   - Define how future OpenClaw upgrades are rolled out intentionally instead of piggybacking on every sandbox create.
   - Add backlinks in `[[003-sandbox-lifecycle]]`, `[[010-deployment]]`, and any config note that owns env-driven overrides.

2. **Pinned bootstrap helper** (`ruh-backend/src/sandboxManager.ts`, helper module if useful):
   - Replace the hardcoded `openclaw@latest` install command with a documented pinned package/version value.
   - Keep the retry path (`--unsafe-perm`) aligned with the same pinned package instead of falling back to `latest`.
   - Log the intended package/version before install and the resolved `openclaw --version` after install so operators can compare expected vs actual runtime.

3. **Operator-controlled configuration surface** (`ruh-backend/src/sandboxManager.ts`, `ruh-backend/src/config.ts` once TASK-69 lands, or equivalent local parser until then):
   - Introduce one explicit config input such as `OPENCLAW_NPM_PACKAGE` or `OPENCLAW_VERSION` so upgrades are intentional and reviewable.
   - Validate the chosen value strictly enough that malformed package strings fail before `docker exec` rather than becoming shell text or a surprise npm resolution.
   - Document the default and override behavior in deployment docs so local dev, Compose, and Kubernetes all know how to stay on the same runtime.

4. **Regression coverage** (`ruh-backend/tests/unit/`):
   - Add unit coverage for the helper or command-construction path that proves the default install uses the pinned package/version and that the retry path preserves the same target.
   - Add coverage for invalid override values so the backend fails deterministically instead of invoking npm with an unsafe or ambiguous package string.
   - Add a narrow verification path that confirms the logged installed version matches the configured package contract on success.

5. **Documentation updates** (`docs/knowledge-base/003-sandbox-lifecycle.md`, `docs/knowledge-base/010-deployment.md`):
   - Replace `openclaw@latest` in the documented create flow with the pinned-version contract.
   - Document how operators intentionally upgrade the sandbox runtime and how to revert to a prior known-good version.
   - Clarify that bootstrap reproducibility is a prerequisite for comparing failures across sandboxes created on different dates.

#### Test suite

**Unit tests** (`ruh-backend/tests/unit/`):
- Default bootstrap command uses the documented pinned package/version, not `openclaw@latest`.
- The `--unsafe-perm` retry path preserves the exact same package target.
- Invalid configured package/version values are rejected before `docker exec` is invoked.
- Success logging includes both the configured target and the installed `openclaw --version` result.

**Integration / command-level verification** (`ruh-backend/tests/integration/` or targeted helper tests):
- A newly created sandbox installs the configured OpenClaw version and still completes onboarding successfully.
- Changing the configured version alters the install target deterministically for new sandboxes only.
- A bad configured version fails sandbox create with a documented bootstrap error instead of hanging or silently installing a different package.

**Operational verification**:
- Two sandbox creates on different days but the same repo/config resolve to the same OpenClaw version.
- Operators can intentionally roll forward or back by changing one documented config value instead of editing code.
- KB/deployment docs describe the runtime-package policy clearly enough that “latest drift” is no longer part of the normal create contract.

#### Evaluation — task is done when
- [ ] Sandbox bootstrap no longer installs `openclaw@latest` implicitly
- [ ] The repo defines one documented pinned package/version contract for new sandboxes
- [ ] Operators have one explicit, validated way to roll the sandbox runtime forward or back intentionally
- [ ] Automated tests lock the default install target, retry path, and invalid-override behavior
- [ ] KB/deployment notes describe the pinned runtime contract and intentional upgrade path instead of documenting floating `latest`

### TASK-2026-03-25-69: Add centralized startup environment validation with typed config schema
- Status: `active`
- Owner: `Worker-1`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `ruh-backend/src/config.ts` (new), `ruh-backend/src/app.ts`, `ruh-backend/src/db.ts`, `ruh-backend/src/sandboxManager.ts`, `ruh-backend/src/startup.ts`, `ruh-backend/tests/unit/`, `docs/knowledge-base/002-backend-overview.md`, `docs/knowledge-base/010-deployment.md`
- Summary: `The backend reads 15+ environment variables scattered across \`app.ts\`, \`db.ts\`, \`sandboxManager.ts\`, and \`startup.ts\` with silent empty-string or hardcoded-default fallbacks (\`process.env.X ?? ''\` or \`?? 'default'\`). There is no centralized schema, no typed config object, and no startup-time validation. Critical variables like \`DATABASE_URL\` crash at runtime rather than at startup. Security-sensitive variables like \`OPENCLAW_ADMIN_TOKEN\`, \`ANTHROPIC_API_KEY\`, and \`OPENAI_API_KEY\` silently default to empty strings, and operator-facing variables like \`ALLOWED_ORIGINS\` and \`OLLAMA_BASE_URL\` accept anything without format validation. Existing TASK-11 (readiness) validates DB connectivity after pool creation but does not check whether the full env contract is satisfied before the process starts. This task introduces a single \`config.ts\` module that parses, validates, and types all env vars at import time, so misconfiguration is caught deterministically at startup rather than scattered across first-use runtime failures.`
- Next step: `Create \`ruh-backend/src/config.ts\` with a typed config schema that classifies each env var as required, optional-with-default, or optional-nullable, validates format where applicable (URLs, positive integers, non-empty strings), and exports a frozen typed config object. Then replace all \`process.env.*\` reads in backend source files with imports from this module.`
- Blockers: `None. Composes naturally with TASK-11 (readiness/startup), TASK-64 (pool resilience), and TASK-66 (sandbox resource caps), all of which introduce new env-configurable values that should be validated through the same schema.`

#### Why this is important now

- `ruh-backend/src/app.ts` reads `ALLOWED_ORIGINS`, `OPENCLAW_ADMIN_TOKEN`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `GEMINI_API_KEY`, `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, `TELEGRAM_BOT_TOKEN`, and `DISCORD_BOT_TOKEN` inline with `?? ''` or `?? 'default'` fallbacks. A typo in any var name produces a silently empty value with no startup error.
- `ruh-backend/src/db.ts` reads `DATABASE_URL` with no fallback; if missing, `initPool()` throws at runtime after the server is already listening (TASK-11 partially mitigates this for DB init ordering but not for the broader env contract).
- `ruh-backend/src/sandboxManager.ts` reads `OPENCLAW_SHARED_OAUTH_JSON_PATH`, `CODEX_AUTH_JSON_PATH`, and `OPENCLAW_SHARED_CODEX_MODEL` with optional semantics but no format validation, so a path that points to a non-existent file silently fails at sandbox creation time rather than at startup.
- `ruh-backend/src/startup.ts` reads `PORT` and coerces it with `Number(...)` without validating that the result is a valid port number.
- Every new feature task that adds env-configurable behavior (resource caps in TASK-66, pool timeouts in TASK-64, rate limit windows in TASK-42) will scatter more unvalidated `process.env` reads unless a centralized schema exists first.
- Operators deploying via Docker Compose or Kubernetes have no deterministic startup error when config is wrong — they get partial failures at first use of the misconfigured feature, which is harder to diagnose in production.

#### What to build

1. **Typed config module** (`ruh-backend/src/config.ts`, new file):
   - Define a TypeScript interface covering all env vars the backend reads today.
   - Classify each var: `required` (startup fails if missing), `optional-with-default` (documented default applied), or `optional-nullable` (absent means feature disabled).
   - Parse and validate at module load time: non-empty strings for required vars, valid URL format for URL vars, positive integer for PORT, valid file paths for `*_PATH` vars (existence check optional but logged).
   - Export a single frozen `config` object so the rest of the codebase imports typed values instead of reading `process.env` directly.
   - Throw a deterministic, aggregated error listing all validation failures at once (not one-at-a-time) so operators can fix all issues in one pass.

2. **Replace scattered process.env reads** (`ruh-backend/src/app.ts`, `ruh-backend/src/db.ts`, `ruh-backend/src/sandboxManager.ts`, `ruh-backend/src/startup.ts`):
   - Replace every `process.env.X ?? fallback` pattern with `config.x` imports.
   - Remove inline fallback logic from route handlers and service modules.
   - Keep the config module as the single source of truth for defaults and validation.

3. **Startup integration** (`ruh-backend/src/startup.ts` or `ruh-backend/src/index.ts`):
   - Import `config` before any other module initialization so validation runs before DB pool creation, Express app setup, or port binding.
   - Ensure startup aborts with a clear error message and non-zero exit code when required vars are missing or malformed.
   - Log the effective config (with secrets masked) at startup for operator debugging.

4. **Regression coverage** (`ruh-backend/tests/unit/config.test.ts`, new file):
   - Test that missing required vars produce a startup error listing all missing vars.
   - Test that malformed values (non-numeric PORT, invalid URL for OLLAMA_BASE_URL, empty OPENCLAW_ADMIN_TOKEN when admin routes exist) are rejected.
   - Test that optional vars with defaults produce the documented default values.
   - Test that the exported config object is frozen and typed correctly.

5. **Documentation** (`docs/knowledge-base/002-backend-overview.md`, `docs/knowledge-base/010-deployment.md`):
   - Add an env var reference table listing every var, its classification (required/optional), default value, and format constraints.
   - Document the startup validation behavior so operators know to check startup logs for config errors.
   - Link to the config module as the canonical env var contract.

#### Test suite

**Unit tests** (`ruh-backend/tests/unit/config.test.ts`):
- Missing `DATABASE_URL` → startup error that names the missing var.
- Missing `PORT` → default `8000` applied without error.
- `PORT=abc` → startup error for invalid port.
- `OLLAMA_BASE_URL=not-a-url` → startup error for invalid URL format.
- All required vars present → config object has typed values matching the env.
- Multiple missing required vars → single aggregated error listing all failures.
- Config object is frozen (mutations throw).

**Integration / startup tests** (`ruh-backend/tests/unit/` or `ruh-backend/tests/integration/`):
- Backend startup with valid config succeeds and the config object is accessible to route handlers.
- Backend startup with missing `DATABASE_URL` exits non-zero before opening a port.
- Config masking in startup logs does not leak secret values.

**Operational verification**:
- `docker-compose up` with a missing required env var fails with a clear error message before the backend accepts traffic.
- All existing backend functionality still works after the refactor (no behavioral change, only earlier failure for bad config).

#### Evaluation — task is done when
- [ ] A single `config.ts` module validates and types all backend env vars at startup
- [ ] Missing or malformed required vars produce an aggregated startup error with all failures listed
- [ ] No backend source file reads `process.env.*` directly — all access goes through the typed config object
- [ ] Optional vars with defaults are documented and applied consistently
- [ ] Unit tests cover required-missing, malformed-value, default-applied, and frozen-object scenarios
- [ ] KB/deployment docs include an env var reference table with classification, defaults, and format constraints
- [ ] Startup logs show the effective config with secrets masked for operator debugging

### TASK-2026-03-25-68: Add project-focus-driven analyst automation workflow
- Status: `completed`
- Owner: `Codex`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `docs/project-focus.md`, `docs/knowledge-base/000-INDEX.md`, `docs/knowledge-base/001-architecture.md`, `docs/knowledge-base/012-automation-architecture.md`, `docs/knowledge-base/013-agent-learning-system.md`, `docs/knowledge-base/specs/SPEC-analyst-project-focus.md`, `docs/knowledge-base/specs/SPEC-agent-learning-and-journal.md`, `docs/knowledge-base/specs/SPEC-automation-agent-roles.md`, `docs/plans/2026-03-25-analyst-project-focus-design.md`, `docs/plans/2026-03-25-analyst-project-focus.md`, `CLAUDE.md`, `AGENTS.md`, `agents.md`, `agents/README.md`, `agents/analyst-1.md`, `.agents/agents/analyst-1.md`, `/Users/prasanjitdey/.codex/automations/analyst-1/automation.toml`, `/Users/prasanjitdey/.codex/automations/analyst-1/memory.md`
- Summary: `Added a human-owned \`docs/project-focus.md\` steering template and documented the new analyst workflow in the KB, plan docs, role files, and shared instruction mirrors. The live \`analyst-1\` automation prompt now reads the matching role contract plus \`docs/project-focus.md\`, prioritizes missing requirements that advance an active focus, and falls back to normal repo-wide backlog analysis when the focus document is missing, inactive, empty, or already sufficiently covered.`
- Next step: `Populate \`docs/project-focus.md\` with active focus areas when you want to steer future analyst runs; leave \`Status\` as \`none\` to keep autonomous backlog discovery. Keep the role files, KB notes, and live automation prompt aligned if this workflow changes again.`
- Blockers: `None`

### TASK-2026-03-25-67: Bind live Codex automations to repo role files
- Status: `completed`
- Owner: `Codex`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `CLAUDE.md`, `agents.md`, `docs/knowledge-base/012-automation-architecture.md`, `docs/knowledge-base/013-agent-learning-system.md`, `docs/knowledge-base/specs/SPEC-agent-learning-and-journal.md`, `docs/knowledge-base/specs/SPEC-automation-agent-roles.md`, `docs/knowledge-base/learnings/LEARNING-2026-03-25-agent-learning-system.md`, `docs/journal/2026-03-25.md`, `/Users/prasanjitdey/.codex/automations/analyst-1/automation.toml`, `/Users/prasanjitdey/.codex/automations/worker-1/automation.toml`, `/Users/prasanjitdey/.codex/automations/tester-1/automation.toml`
- Summary: `Checked the live \`analyst-1\`, \`worker-1\`, and \`tester-1\` automation configs against the repo's role files. The schedules already matched the repo role names, but the runtime prompts were still generic and never loaded \`agents/analyst-1.md\`, \`agents/worker-1.md\`, or \`agents/tester-1.md\`, so the repo role catalog was descriptive rather than authoritative at runtime. Updated the KB/spec/instruction contract and the three live automation prompts so each recurring automation now reads its matching repo role file first and treats that file's mission, inputs, outputs, guardrails, and success criteria as part of the live run contract.`
- Next step: `When any repo-local role file changes, update the mirrored \`.agents/agents/\` copy and regenerate the matching live automation prompt under \`$CODEX_HOME/automations/\` in the same change so names, docs, and runtime behavior stay aligned.`
- Blockers: `None`

### TASK-2026-03-25-66: Enforce sandbox runtime resource caps and baseline container hardening
- Status: `active`
- Owner: `Analyst-1`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `ruh-backend/src/sandboxManager.ts`, `ruh-backend/src/docker.ts`, `ruh-backend/tests/unit/`, `ruh-backend/tests/integration/`, `docs/knowledge-base/003-sandbox-lifecycle.md`, `docs/knowledge-base/010-deployment.md`, `docs/knowledge-base/specs/`
- Summary: `Sandbox creation currently launches every OpenClaw container with a near-default \`docker run -d --name ... -p 18789 ... node:22-bookworm tail -f /dev/null\` contract. There are no per-sandbox CPU, memory, swap, or PID caps; no baseline hardening flags such as \`--cap-drop\`, \`--security-opt no-new-privileges\`, or \`--read-only\`; and no documented writable-path contract for the files OpenClaw actually needs. Existing backlog items cover create admission quotas, backend auth, rate limiting, gateway access policy, Docker timeout enforcement, and runtime drift, but none limit the blast radius of a sandbox after it has already been admitted and started. One buggy agent loop, runaway dependency install, or malicious workload can therefore consume disproportionate host resources or retain broader container privileges than required.`
- Next step: `Write \`docs/knowledge-base/specs/SPEC-sandbox-runtime-resource-guards.md\`, then harden \`createOpenclawSandbox()\` with documented Docker resource limits and a minimal writable-filesystem/runtime-privilege contract that still supports OpenClaw onboarding, gateway startup, cron jobs, and channel configuration.`
- Blockers: `None. Coordinate with TASK-2026-03-25-19 (create admission quotas), TASK-2026-03-25-49 (gateway access policy), and TASK-2026-03-25-53 (real Docker timeouts), but this is a distinct runtime-containment boundary.`

#### Why this is important now

- `ruh-backend/src/sandboxManager.ts` creates containers with `docker run -d --name <container> -p 18789 ... node:22-bookworm tail -f /dev/null` and no `--memory`, `--cpus`, `--pids-limit`, or similar cgroup constraints.
- The same create path runs the sandbox as the image default user with the default writable root filesystem and without explicit hardening flags such as `--cap-drop ALL` or `--security-opt no-new-privileges:true`, so the repo has not yet defined the minimum privileges OpenClaw actually needs.
- Sandbox creation quotas and route rate limits only control how many containers get started; they do not protect the host once a single admitted sandbox begins consuming CPU, RAM, processes, or disk aggressively.
- Several backend features intentionally execute arbitrary agent-controlled work inside these containers (chat, cron jobs, skill code, channel integrations), which makes resource containment and least-privilege runtime settings part of the core product safety boundary rather than an ops nice-to-have.
- `docs/knowledge-base/003-sandbox-lifecycle.md` and `docs/knowledge-base/010-deployment.md` currently document sandbox bootstrap and deployment without any resource-budget or container-hardening contract, so operators and future agents have no canonical guidance for safe defaults.

#### What to build

1. **Feature spec first** (`docs/knowledge-base/specs/SPEC-sandbox-runtime-resource-guards.md`):
   - Define default per-sandbox CPU, memory, swap, and PID limits plus which values are configurable via env.
   - Define the baseline Docker hardening contract: dropped capabilities, `no-new-privileges`, filesystem mutability, tmpfs mounts, and any required writable paths under the container home directory.
   - Document explicit non-goals for the first slice if full network egress restriction or rootless containers are not yet feasible.
   - Add backlinks in `[[003-sandbox-lifecycle]]`, `[[010-deployment]]`, and any related spec the contract composes with.

2. **Sandbox create hardening** (`ruh-backend/src/sandboxManager.ts`):
   - Extend the `docker run` invocation with documented resource controls such as `--memory`, `--memory-swap`, `--cpus`, and `--pids-limit`.
   - Add baseline privilege/file-system flags such as `--cap-drop`, `--security-opt no-new-privileges`, and a deliberate writable-path strategy (`tmpfs`, writable home subpaths, or another minimal contract) instead of relying on the fully writable default root filesystem.
   - Keep the chosen defaults compatible with current OpenClaw bootstrap steps: npm install, onboarding, auth seeding, config writes, gateway startup, cron jobs, and channel config updates.

3. **Configuration surface and validation** (`ruh-backend/src/sandboxManager.ts`, env docs if needed):
   - Introduce explicit env vars for the runtime budget so operators can tune limits without editing code.
   - Validate misconfigured limits early so the backend fails fast or returns deterministic create errors instead of starting partially constrained containers.
   - Surface the effective runtime-guard profile in create logs or sandbox metadata if needed for operator debugging.

4. **Regression coverage** (`ruh-backend/tests/unit/`, `ruh-backend/tests/integration/`):
   - Add unit tests that lock the generated `docker run` arguments for both default and overridden resource-limit configurations.
   - Add tests that verify hardening flags remain present and writable-path setup stays aligned with the documented OpenClaw file locations.
   - Add one integration or command-level verification path proving a created sandbox still boots, onboards, and reaches gateway health under the constrained runtime profile.

5. **Documentation updates** (`docs/knowledge-base/003-sandbox-lifecycle.md`, `docs/knowledge-base/010-deployment.md`, spec above):
   - Document the new resource-budget and hardening contract so create flow docs no longer imply unrestricted container defaults.
   - Clarify operator expectations when a sandbox exceeds limits (e.g. OOM kill, create failure, or runtime restart behavior if any).
   - Link the contract to create-admission quotas and Docker timeout work so future agents keep host-capacity protections layered rather than overlapping ambiguously.

#### Test suite

**Unit tests** (`ruh-backend/tests/unit/`):
- `createOpenclawSandbox()` or a factored helper emits the expected `docker run` arguments with default resource caps and hardening flags.
- Env-var overrides produce bounded, validated `docker run` flags and reject malformed values.
- The writable-path bootstrap contract stays aligned with where OpenClaw auth/config files are written during onboarding and retrofit flows.

**Integration / command-level verification** (`ruh-backend/tests/integration/` or targeted helper tests):
- A sandbox created under the default constrained profile still reaches the healthy gateway state.
- Representative bootstrap steps that write config/auth files succeed under the reduced filesystem/privilege contract.
- Exceeding a deliberately tiny configured limit fails in a deterministic, documented way instead of leaving an ambiguous half-configured sandbox.

**Operational verification**:
- `docker inspect` on a newly created sandbox shows the documented CPU/memory/PID constraints and hardening flags.
- One sandbox cannot consume unbounded host memory/process slots by default.
- KB/deployment docs describe the runtime budget and how operators can tune it safely.

#### Evaluation — task is done when
- [ ] New sandboxes start with documented CPU, memory, swap, and PID limits instead of default-unbounded container resources
- [ ] The runtime contract adds baseline container hardening flags and a deliberate writable-path strategy
- [ ] Limit configuration is operator-tunable, validated, and documented
- [ ] Automated tests lock the generated Docker args and prove bootstrap still works under the constrained profile
- [ ] KB/spec/deployment notes explain the sandbox runtime containment boundary and how it composes with quotas, timeout enforcement, and gateway hardening

### TASK-2026-03-25-65: Strengthen backend db helper unit coverage
- Status: `completed`
- Owner: `Tester-1`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `ruh-backend/tests/unit/db.test.ts`, `docs/journal/2026-03-25.md`
- Summary: `Replaced the old hand-simulated \`db\` assertions with a real mocked-module unit test for \`ruh-backend/src/db.ts\`. The new coverage verifies that \`initPool()\` passes the expected pool config into \`pg\`, \`withConn()\` begins and commits successful work, rolls back failed work, and still releases the client when \`COMMIT\` itself throws.`
- Next step: `Pick a different bounded target next run and avoid reusing \`ruh-backend/src/db.ts\` unless the pool contract changes.`
- Blockers: `None`

### TASK-2026-03-25-73: Add shell-safe file-write path rejection regression
- Status: `completed`
- Owner: `Tester-1`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `ruh-backend/tests/security/shellCommands.test.ts`, `docs/journal/2026-03-25.md`, `/Users/prasanjitdey/.codex/automations/tester-1/memory.md`
- Summary: `Added one bounded backend security test for \`buildHomeFileWriteCommand()\` so configure-agent file writes now have explicit regression coverage for the unsafe-path rejection branch. The new assertions lock two failure modes the helper is supposed to block before shell execution: path traversal segments and unexpected characters such as spaces inside the relative target path.`
- Next step: `Pick a different bounded target next run and avoid reusing \`buildHomeFileWriteCommand()\` unless the shell-path validation contract changes.`
- Blockers: `None`

### TASK-2026-03-25-79: Add backend readiness custom-reason regression
- Status: `completed`
- Owner: `Tester-1`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `ruh-backend/tests/unit/backendReadiness.test.ts`, `docs/journal/2026-03-25.md`, `/Users/prasanjitdey/.codex/automations/tester-1/memory.md`
- Summary: `Added one bounded backend unit regression for \`ruh-backend/src/backendReadiness.ts\` so the explicit \`markBackendNotReady(reason)\` branch is covered directly. The new assertion proves the helper preserves an operator-visible custom reason after the backend had already transitioned to ready, without broadening into startup or route changes.`
- Next step: `Pick a different bounded target next run and avoid reusing \`backendReadiness.ts\` unless the readiness-state contract changes.`
- Blockers: `None`

### TASK-2026-03-25-81: Add HistoryPanel delete-failure regression
- Status: `completed`
- Owner: `Tester-1`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `ruh-frontend/components/HistoryPanel.tsx`, `ruh-frontend/__tests__/components/HistoryPanel.test.tsx`, `docs/journal/2026-03-25.md`, `/Users/prasanjitdey/.codex/automations/tester-1/memory.md`
- Summary: `Added one bounded ruh-frontend component regression for conversation-history deletion and made the smallest matching fix in \`HistoryPanel\`. The new test proves a conversation stays visible when the backend DELETE request fails, and the component now keeps local state unchanged unless that delete response is successful.`
- Next step: `Pick a different bounded target next run and avoid reusing \`HistoryPanel\` delete behavior unless the conversation-history mutation contract changes again.`
- Blockers: `None`

### TASK-2026-03-25-83: Add architect SSE CRLF framing regression
- Status: `completed`
- Owner: `Tester-1`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `agent-builder-ui/lib/openclaw/api.ts`, `agent-builder-ui/lib/openclaw/api.test.ts`, `docs/knowledge-base/008-agent-builder-ui.md`, `docs/knowledge-base/learnings/LEARNING-2026-03-25-architect-sse-crlf-framing.md`, `docs/journal/2026-03-25.md`, `/Users/prasanjitdey/.codex/automations/tester-1/memory.md`
- Summary: `Added one bounded agent-builder unit regression for the architect SSE client and made the smallest matching parser fix in \`sendToArchitectStreaming()\`. The new test proves multi-event streams framed with CRLF line endings still deliver both \`status\` and \`result\` events, and the client now normalizes incoming line endings before splitting SSE event blocks.`
- Next step: `Pick a different bounded target next run and avoid reusing \`agent-builder-ui/lib/openclaw/api.ts\` unless the architect bridge framing contract changes again.`
- Blockers: `None`

### TASK-2026-03-25-64: Harden PostgreSQL connection pool resilience and runtime health
- Status: `active`
- Owner: `Worker-1`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `ruh-backend/src/db.ts`, `ruh-backend/src/app.ts`, `ruh-backend/tests/unit/`, `ruh-backend/tests/integration/`, `docs/knowledge-base/002-backend-overview.md`, `docs/knowledge-base/005-data-models.md`, `docs/knowledge-base/specs/`
- Summary: `The PostgreSQL connection pool in \`ruh-backend/src/db.ts\` is configured with only \`min\` and \`max\` settings but lacks \`idleTimeoutMillis\`, \`connectionTimeoutMillis\`, and \`statement_timeout\`. There is no \`pool.on('error', ...)\` handler, so a background client error is an unhandled event emitter error that can crash the process. The pool has no periodic health validation (\`SELECT 1\`), no connection eviction for stale connections, and \`withConn()\` can hang indefinitely when Postgres is slow or unreachable because \`pool.connect()\` has no timeout. Existing backlog items cover startup ordering (TASK-11), graceful shutdown pool teardown (TASK-55), and structured logging (TASK-60), but none address the pool's runtime resilience contract while the server is running.`
- Next step: `Write \`docs/knowledge-base/specs/SPEC-db-pool-resilience.md\`, then add timeout configuration, error handling, and health-check logic to \`ruh-backend/src/db.ts\`.`
- Blockers: `None. Composes well with TASK-11 (startup readiness) and TASK-55 (graceful shutdown). Should be done before TASK-60 (structured logging) so pool errors are observable once logging is in place.`

#### Why this is important now

- `ruh-backend/src/db.ts` creates the pool with `new Pool({ connectionString: dsn, min: 2, max: 10 })` and no other options. The `pg` library defaults `idleTimeoutMillis` to 10000 ms but has no `connectionTimeoutMillis` default — meaning `pool.connect()` can hang forever when Postgres is overloaded or unreachable.
- There is no `pool.on('error', cb)` handler. When `node-postgres` detects a background connection error (e.g., Postgres restarts, network partition), it emits an `error` event on the pool. Without a handler, this becomes an unhandled `EventEmitter` error that crashes the Bun/Node process.
- There is no `statement_timeout` or per-query timeout, so a single slow query (e.g., lock contention, full table scan on growing tables) can hold a pooled connection indefinitely, eventually starving the pool for other requests.
- The `/health` endpoint returns `{ status: 'ok' }` unconditionally and `/ready` (once TASK-11 lands) only checks initialization state — neither verifies that the pool can actually acquire a connection and execute a query at request time.
- Every route that calls `withConn()` inherits these risks silently: a transient Postgres issue can cascade into hung HTTP requests, pool exhaustion, and eventually a full backend outage with no error surface.
- The pool holds `min: 2` connections open at all times but never validates them, so connections that have been silently severed (e.g., by a firewall timeout or Postgres `idle_in_transaction_session_timeout`) will cause the first query after reconnection to fail.

#### What to build

1. **Feature spec first** (`docs/knowledge-base/specs/SPEC-db-pool-resilience.md`):
   - Define the pool configuration contract: `connectionTimeoutMillis`, `idleTimeoutMillis`, `statement_timeout`, `max`, `min`.
   - Define the pool error-handling contract: what happens on background errors, how they are logged, and how the pool recovers.
   - Define the health-check contract: what `/health` or `/ready` should probe and how often.
   - Add backlinks in `[[002-backend-overview]]` and `[[005-data-models]]`.

2. **Pool configuration hardening** (`ruh-backend/src/db.ts`):
   - Add `connectionTimeoutMillis: 5000` (or configurable via env) so `pool.connect()` fails fast instead of hanging.
   - Add `idleTimeoutMillis: 30000` to reap idle connections and prevent pool bloat.
   - Add `statement_timeout` via pool-level `options` or a post-connect `SET statement_timeout` so runaway queries are killed.
   - Add `pool.on('error', cb)` that logs the error (or `console.error` until structured logging lands) and does not crash the process.

3. **Connection validation** (`ruh-backend/src/db.ts` or `ruh-backend/src/app.ts`):
   - Add a lightweight connection validation query (`SELECT 1`) to the readiness probe so `/ready` can detect a pool that is initialized but can no longer reach Postgres.
   - Consider adding `pg` pool `allowExitOnIdle` or explicit eviction logic if the deployment pattern involves long-idle periods.

4. **withConn timeout wrapper** (`ruh-backend/src/db.ts`):
   - Add an optional per-call timeout to `withConn()` so callers can bound total transaction time independently of statement timeout.
   - Ensure timeout-aborted transactions still call `ROLLBACK` and `client.release()` cleanly.

5. **Regression coverage and docs** (`ruh-backend/tests/unit/`, `ruh-backend/tests/integration/`, KB notes):
   - Test that `pool.connect()` rejects within the configured timeout when the DB is unreachable.
   - Test that a pool `error` event is handled without crashing the process.
   - Test that `withConn()` releases the client and rolls back on timeout.
   - Update backend overview and data-model docs to describe the pool resilience contract.

#### Test suite

**Unit tests** (`ruh-backend/tests/unit/`):
- `initPool()` creates a pool with `connectionTimeoutMillis`, `idleTimeoutMillis`, and an error handler.
- Pool-level `error` events are caught and logged, not thrown as unhandled.
- `withConn()` releases the client and rolls back when the callback times out or throws.

**Integration tests** (`ruh-backend/tests/integration/`):
- `pool.connect()` rejects within the configured timeout when Postgres is unreachable (simulated by pointing at a non-listening port).
- A long-running query is killed by `statement_timeout` rather than blocking the pool indefinitely.
- The readiness probe returns non-200 when the pool cannot execute `SELECT 1`.

**Operational verification**:
- A Postgres restart during runtime does not crash the backend process (pool error handler absorbs the background error and connections are re-established on next acquire).
- Pool metrics (active/idle/waiting counts) are observable once structured logging is in place.

#### Evaluation — task is done when
- [ ] Pool is configured with `connectionTimeoutMillis`, `idleTimeoutMillis`, and `statement_timeout`
- [ ] `pool.on('error', ...)` handler prevents unhandled crashes on background connection failures
- [ ] `withConn()` cannot hang indefinitely — bounded by connection acquire timeout and statement timeout
- [ ] Readiness probe validates pool health with a live query, not just initialization state
- [ ] Unit and integration tests cover timeout, error-handler, and stale-connection scenarios
- [ ] KB/spec docs describe the pool resilience contract and how it composes with startup readiness and graceful shutdown

### TASK-2026-03-25-63: Redact backend error and diagnostic payloads before client exposure
- Status: `active`
- Owner: `Analyst-1`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `ruh-backend/src/app.ts`, `ruh-backend/src/channelManager.ts`, `ruh-backend/src/utils.ts`, `ruh-backend/tests/security/`, `ruh-backend/tests/integration/`, `docs/knowledge-base/002-backend-overview.md`, `docs/knowledge-base/004-api-reference.md`, `docs/knowledge-base/006-channel-manager.md`, `docs/knowledge-base/specs/`
- Summary: `The backend still exposes raw gateway and CLI diagnostics directly to API clients. In \`ruh-backend/src/app.ts\`, non-streaming chat converts upstream gateway errors into \`httpError(resp.status, JSON.stringify(resp.data))\`, multiple cron routes splice raw CLI stderr/stdout into \`detail\` strings, and the generic error middleware echoes \`err.message\` verbatim. In \`ruh-backend/src/channelManager.ts\`, channel probe and pairing flows return raw \`output\` strings from \`openclaw\` commands directly to the browser. Existing backlog items cover secret redaction on normal read paths, truthful channel-save outcomes, audit-log redaction, and structured logging, but none define a client-safe error/diagnostic boundary for backend API responses themselves.`
- Next step: `Start by writing \`docs/knowledge-base/specs/SPEC-backend-error-redaction.md\`, then replace raw CLI/gateway echoing with a documented client-safe error and diagnostics contract across chat, cron, channel, and generic backend error responses.`
- Blockers: `None. This should align with TASK-2026-03-25-60 (structured logging), TASK-2026-03-25-39 (audit redaction), TASK-2026-03-25-18 (sandbox secret handling), and TASK-2026-03-25-52 (truthful channel apply), but it is a distinct client-facing security boundary.`

#### Why this is important now

- `ruh-backend/src/app.ts` turns non-streaming gateway failures into `detail: JSON.stringify(resp.data)`, so upstream error bodies can be reflected directly back to callers without any redaction or size policy.
- The cron routes currently return raw slices of CLI output on failure (`openclaw cron ... failed: ${output.slice(...)}`) and even fall back to `res.json({ ok: true, output })` when CLI JSON parsing fails, which exposes implementation noise and potentially sensitive echoed values to browsers.
- `ruh-backend/src/channelManager.ts` returns raw `output` strings for channel status probing, pairing-list reads, and pairing approval results, so container-side diagnostics become part of the browser contract by default.
- The generic error middleware returns `{ detail: err.message }` for every thrown error, which means any upstream/raw diagnostic string included in an exception automatically crosses the API boundary.
- Existing tasks already promise secret redaction in logs, audit payloads, channel-save feedback, and sandbox read models, but none currently define what backend clients are allowed to see when a CLI or gateway call fails or emits noisy diagnostics.

#### What to build

1. **Feature spec first** (`docs/knowledge-base/specs/SPEC-backend-error-redaction.md`):
   - Define the client-safe backend error envelope: stable `detail`, optional machine-readable `code`, and which diagnostics are allowed in normal responses.
   - Specify route classes that need custom handling now: gateway proxying, cron mutation/read routes, channel status/pairing routes, and generic backend middleware errors.
   - Add backlinks in `[[002-backend-overview]]`, `[[004-api-reference]]`, and `[[006-channel-manager]]`.

2. **Shared client-safe error helpers** (`ruh-backend/src/app.ts`, `ruh-backend/src/utils.ts` or a new helper module):
   - Introduce a helper that converts raw gateway/CLI/internal errors into bounded client-safe messages before they reach the error middleware.
   - Preserve enough structure for callers to distinguish validation, auth, gateway-unreachable, upstream-rejected, and CLI-failed cases without reflecting raw stderr/stdout or upstream JSON bodies.
   - Keep the redaction rules centralized so future routes do not keep inventing route-local `output.slice(...)` or `JSON.stringify(resp.data)` behavior.

3. **Route cleanup for current exposure points** (`ruh-backend/src/app.ts`):
   - Replace `JSON.stringify(resp.data)` in `POST /api/sandboxes/:sandbox_id/chat` with a classified, bounded upstream-error contract.
   - Replace cron-route raw-output echoes and `res.json({ ok: true, output })` fallbacks with structured safe summaries plus parse-failure handling that does not dump raw CLI output to browsers.
   - Ensure `parseJsonOutput()` and other helper-thrown errors do not automatically expose raw command output through the shared middleware.

4. **Channel diagnostics boundary** (`ruh-backend/src/channelManager.ts`, routes/docs):
   - Decide which channel probe/pairing diagnostics are safe for ordinary callers versus which should be masked, summarized, or reserved for server-side logs/admin tooling.
   - Keep channel-save truthfulness and error redaction complementary: users should learn whether a step failed without receiving raw secret-bearing or overly verbose container output.
   - Document how future reveal/debug tooling should expose deeper diagnostics explicitly instead of piggybacking on ordinary API responses.

5. **Regression coverage and docs** (`ruh-backend/tests/security/`, `ruh-backend/tests/integration/`, KB notes above):
   - Add tests that prove representative gateway and CLI failures no longer leak raw upstream payloads or secret-like values in `detail` or JSON response fields.
   - Update the API reference so it documents the new error/diagnostic boundary rather than implying arbitrary route handlers can echo raw backend output.
   - Cross-link the contract with logging/audit work so future operator-facing diagnostics live in the right place.

#### Test suite

**Backend security / integration tests** (`ruh-backend/tests/security/`, `ruh-backend/tests/integration/`):
- A mocked non-streaming gateway `4xx` response does not come back to the client as raw `JSON.stringify(resp.data)`.
- Cron route failures return the documented safe error contract without exposing raw CLI stderr/stdout snippets that contain sensitive or user-supplied values.
- Channel probe and pairing routes return the documented redacted/summarized diagnostic shape instead of raw `output` blobs.
- Generic middleware-wrapped route errors no longer reflect raw helper output when the thrown message contains untrusted diagnostics.

**Helper / unit tests** (`ruh-backend/tests/unit/` if needed):
- Error-redaction helpers preserve stable error codes/messages while dropping or masking secret-like and oversized diagnostic content.
- `parseJsonOutput()`-adjacent failures map to safe client responses instead of surfacing raw parser input.

**Documentation verification**:
- API docs describe which diagnostics are intentionally exposed and which remain internal.
- KB notes link this client-facing redaction boundary to structured logging, audit logging, and secret-handling work so future agents do not reintroduce raw output echoes elsewhere.

#### Evaluation — task is done when
- [ ] Backend API responses no longer echo raw gateway JSON bodies or raw CLI output by default
- [ ] Chat, cron, and channel routes return documented client-safe error/diagnostic shapes
- [ ] The generic error middleware no longer turns raw upstream/helper messages into browser-visible `detail` leaks
- [ ] Security/integration tests cover representative gateway and CLI failure paths
- [ ] KB/API docs describe the backend error-redaction contract and how it composes with logging/audit work

### TASK-2026-03-25-62: Add parseJsonOutput array-tail regression
- Status: `completed`
- Owner: `Codex`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `ruh-backend/tests/unit/parseJsonOutputArrayLogs.test.ts`, `docs/journal/2026-03-25.md`, `/Users/prasanjitdey/.codex/automations/tester-template/memory.md`
- Summary: `Inspected the repo test setup, avoided the already-active backend auth/logging and builder SSE work, and chose one cheap backend unit gap in CLI-output parsing. Added a standalone regression proving \`parseJsonOutput()\` still returns a multiline JSON array even when OpenClaw-style trailing log noise follows the payload, which protects array-shaped CLI responses consumed by backend routes without broadening into route or parser changes.`
- Next step: `Pick a different bounded target next run and avoid reusing \`parseJsonOutput()\` unless the CLI parsing contract changes again.`
- Blockers: `None`

### TASK-2026-03-25-61: Make deployed sandbox chat cancelable end-to-end
- Status: `active`
- Owner: `Analyst-1`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `ruh-backend/src/app.ts`, `ruh-backend/tests/e2e/`, `ruh-backend/tests/integration/`, `ruh-frontend/components/ChatPanel.tsx`, `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChat.tsx`, `docs/knowledge-base/002-backend-overview.md`, `docs/knowledge-base/007-conversation-store.md`, `docs/knowledge-base/011-key-flows.md`, `docs/knowledge-base/specs/`
- Summary: `The deployed sandbox chat path has no client-abort or upstream-cancel contract. In both shipped chat UIs, streaming requests are started with plain \`fetch()\` and no \`AbortController\` or user-facing cancel flow. In \`ruh-backend/src/app.ts\`, \`POST /api/sandboxes/:sandbox_id/chat\` forwards streaming gateway requests with \`axios.post(... responseType: 'stream')\` and immediately \`resp.data.pipe(res)\`, but it never listens for request/response close events, never aborts the upstream axios request, and never tells the sandbox gateway to stop work when the browser disconnects. That means a tab close, route change, or flaky network can still leave the gateway and model provider finishing an expensive reply no user will ever receive. Existing backlog items cover atomic chat persistence, architect-route cancellation, rate limiting, and retries, but none define cancellation semantics for the deployed sandbox chat route itself.`
- Next step: `Start by writing \`docs/knowledge-base/specs/SPEC-deployed-chat-cancellation.md\`, then add a documented abort contract for \`POST /api/sandboxes/:sandbox_id/chat\` that propagates client disconnects through the backend proxy and exposes cancelable streaming fetches in both chat UIs.`
- Blockers: `None. This should be designed to compose with TASK-2026-03-25-38 (backend-owned chat persistence), TASK-2026-03-25-42 (rate limiting), and TASK-2026-03-25-33 (architect-route retry/cancel safety), but it is a distinct deployed-chat resource-lifecycle gap.`

#### Why this is important now

- `ruh-frontend/components/ChatPanel.tsx` sends streamed chat with plain `fetch()` and no `AbortController`, so leaving the page or replacing the request does not cancel the browser-side stream intentionally.
- `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChat.tsx` does the same for the deployed-agent chat surface, so both user-facing sandbox chat clients share the same missing cancellation boundary.
- `ruh-backend/src/app.ts` handles the streaming chat path by calling `axios.post(url, body, { timeout: 120000, responseType: 'stream' })` and then `resp.data.pipe(res)` with no `req.on('close')`, `res.on('close')`, or abort-signal wiring.
- The non-streaming chat path also has no request-abort propagation, so a disconnected client can still leave an upstream gateway request running until timeout or completion.
- TASK-2026-03-25-38 already notes that streamed replies need a documented terminalization rule for persistence, but it does not stop wasted upstream work when the client disappears before that terminal state.
- TASK-2026-03-25-33 adds cancellation for the architect bridge route in `agent-builder-ui/app/api/openclaw/route.ts`, which makes the missing cancelability of the deployed sandbox chat route more inconsistent and more expensive as usage grows.

#### What to build

1. **Feature spec first** (`docs/knowledge-base/specs/SPEC-deployed-chat-cancellation.md`):
   - Define when a deployed sandbox chat request is considered canceled vs failed vs completed.
   - Specify streamed vs non-streamed behavior, including what happens when the browser disconnects after the gateway has already started producing output.
   - Document how this contract composes with `[[SPEC-atomic-chat-persistence]]` once backend-owned persistence lands.
   - Add backlinks in `[[002-backend-overview]]`, `[[007-conversation-store]]`, and `[[011-key-flows]]`.

2. **Backend proxy abort propagation** (`ruh-backend/src/app.ts`):
   - Create an `AbortController` or equivalent cancellation path for `POST /api/sandboxes/:sandbox_id/chat`.
   - Tie the downstream gateway request lifecycle to `req` / `res` close events so the backend stops proxying when the client is gone.
   - For streaming responses, stop piping, destroy the upstream stream safely, and avoid leaving hanging listeners after disconnect.
   - For non-streaming responses, abort the upstream axios request when the HTTP client disconnects before completion.

3. **Gateway-side cancellation semantics** (`ruh-backend/src/app.ts`, gateway contract docs if needed):
   - Decide whether transport abort alone is sufficient or whether the backend must call a documented OpenClaw cancel endpoint / header / session-level interrupt if one exists.
   - Keep the contract fail-closed: when true cancellation is unsupported upstream, terminate the proxy deterministically and document the residual risk instead of pretending the run stopped.
   - Ensure cancellation outcomes remain distinguishable from gateway errors in logs and API semantics.

4. **Client-side cancelability in both chat UIs** (`ruh-frontend/components/ChatPanel.tsx`, `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChat.tsx`):
   - Wrap streaming chat requests in `AbortController`.
   - Abort the active request on unmount, sandbox/conversation switch, route change, or when the user sends a replacement message under the documented UX.
   - Add a visible canceled state instead of surfacing every abort as a generic assistant error.
   - Keep the final UX aligned with the backend persistence contract so canceled runs do not silently append half-finished replies later.

5. **Regression coverage and docs** (`ruh-backend/tests/`, frontend tests, KB notes above):
   - Add backend tests that prove client disconnect aborts the upstream proxy path before the full model run completes.
   - Add frontend tests that prove unmount/navigation aborts the active request and ignores late chunks from an already-canceled stream.
   - Update the key-flow documentation so sandbox chat no longer implies that every started run will continue regardless of client lifecycle.

#### Test suite

**Backend integration / e2e tests** (`ruh-backend/tests/integration/`, `ruh-backend/tests/e2e/`):
- Simulate a streaming chat client disconnect and assert the backend tears down the upstream proxy instead of reading the entire gateway stream.
- Simulate a non-streaming chat disconnect and assert the upstream axios request is aborted rather than allowed to run to timeout.
- Verify cancelation does not masquerade as a successful completed chat exchange for persistence and history flows.

**Frontend tests** (`ruh-frontend/__tests__/components/`, `agent-builder-ui/`):
- `ChatPanel` aborts the active streamed chat on unmount or sandbox/conversation switch and does not append a late assistant message afterward.
- `TabChat` aborts the active deployed-agent chat on unmount or replacement request and ignores stale chunks after cancellation.
- User-visible state distinguishes intentional cancelation from gateway/auth failures.

**Operational verification**:
- Closing a browser tab or navigating away from an active streamed sandbox chat stops backend proxy work promptly instead of consuming the full upstream run.
- Logs and docs distinguish canceled chats from ordinary proxy failures and from successfully completed responses.

#### Evaluation — task is done when
- [ ] Deployed sandbox chat requests can be canceled intentionally from both chat UIs
- [ ] Client disconnects propagate through the backend chat proxy and stop upstream gateway work or surface a documented residual limitation
- [ ] Canceled chat runs do not later appear as successful completed exchanges in the UI or persisted history
- [ ] Backend tests cover streaming and non-streaming disconnect behavior
- [ ] Frontend tests cover unmount/navigation/replacement-request abort behavior
- [ ] KB/spec docs describe the deployed-chat cancellation contract clearly

### TASK-2026-03-25-60: Add structured request logging, error logging, and correlation IDs to ruh-backend
- Status: `active`
- Owner: `Worker-1`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `ruh-backend/src/app.ts`, `ruh-backend/src/index.ts`, `ruh-backend/src/startup.ts`, `ruh-backend/src/utils.ts`, `ruh-backend/package.json`, `docs/knowledge-base/002-backend-overview.md`, `docs/knowledge-base/010-deployment.md`, `docs/knowledge-base/specs/`
- Summary: `The backend has zero structured logging, zero request logging, zero error logging, no correlation ID generation, and no request tracing. The error middleware at app.ts:612 silently returns \`{ detail: err.message }\` to clients but never logs the error, status, or stack. Route handlers produce no output at all — neither success nor failure. The single \`console.error\` in the entire backend is in index.ts for startup failures. This means production incidents are invisible unless a client reports them, 5xx errors vanish without a trace, slow requests cannot be profiled, and cross-service debugging between backend, nginx, and sandbox gateways is impossible. Every other reliability, security, and operational task in the backlog (graceful shutdown, audit trail, rate limiting, secret redaction, gateway hardening) will be harder to operate and verify without baseline observability.`
- Next step: `Write \`docs/knowledge-base/specs/SPEC-structured-logging.md\`, then add a lightweight structured logging layer with request correlation IDs, request/response logging middleware, and error logging — using pino for Bun-compatible JSON output.`
- Blockers: `None. This is a foundational infrastructure task with no dependencies on other backlog items.`

#### Why this is important now

- `ruh-backend/src/app.ts` has ~35 route handlers and zero log output in any of them — neither on request entry, response exit, nor error.
- The error middleware (app.ts:612-615) catches all unhandled errors and returns them as HTTP responses, but never logs the error message, status code, stack trace, or request context. A 500 error is completely invisible to operators.
- `ruh-backend/src/index.ts` has one `console.error` for startup failures. No other file in the backend produces any log output during normal operation.
- `package.json` has zero logging dependencies — no pino, winston, bunyan, or any structured logger.
- No middleware generates or propagates `x-request-id` or correlation headers, so correlating a frontend error with a backend request or a downstream sandbox gateway call is impossible.
- The `/health` endpoint returns `{ status: 'ok' }` unconditionally and the `/ready` endpoint checks a boolean flag, but neither probes actual dependencies (DB connection, Docker daemon availability).
- Existing tasks that depend on operational visibility (TASK-55 graceful shutdown, TASK-39 audit trail, TASK-42 rate limiting, TASK-53 Docker timeouts, TASK-52 channel config verification) will all be harder to validate and operate without structured logging in place.
- The SSE streaming routes for sandbox creation and architect bridge produce events to clients but no server-side record of what happened, how long it took, or whether it failed.

#### What to build

1. **Feature spec first** (`docs/knowledge-base/specs/SPEC-structured-logging.md`):
   - Define the logging contract: what gets logged at request entry, response exit, and error.
   - Define the correlation ID strategy: generate `x-request-id` on entry if not present, propagate it through response headers and log context.
   - Define log levels: `info` for request/response, `warn` for 4xx, `error` for 5xx and unhandled exceptions.
   - Define the structured format: JSON with `timestamp`, `level`, `requestId`, `method`, `path`, `status`, `durationMs`, `error` (when applicable).
   - Document what is explicitly excluded from logs: request/response bodies (to avoid secret leakage), auth tokens, sandbox credentials.
   - Add backlinks in `[[002-backend-overview]]` and `[[010-deployment]]`.

2. **Add pino as the structured logger** (`ruh-backend/package.json`, `ruh-backend/src/logger.ts`):
   - Add `pino` (lightweight, Bun-compatible, JSON-native) as a production dependency.
   - Create a `logger.ts` module that exports a configured pino instance with environment-aware log level (`LOG_LEVEL` env var, defaulting to `info`).
   - Support `LOG_FORMAT=pretty` for local development (pino-pretty as a dev dependency).

3. **Request logging middleware** (`ruh-backend/src/app.ts` or `ruh-backend/src/middleware/requestLogger.ts`):
   - Generate `x-request-id` (UUIDv4) on each request if not already present in incoming headers.
   - Set the correlation ID on the response header so nginx and clients can trace it.
   - Log at request start: `{ requestId, method, path, userAgent }`.
   - Log at response finish: `{ requestId, method, path, status, durationMs }`.
   - Use `warn` level for 4xx and `error` level for 5xx responses.

4. **Error logging in error middleware** (`ruh-backend/src/app.ts`):
   - Extend the existing error middleware to log the error with `requestId`, status, message, and stack trace before sending the response.
   - For 5xx errors: log at `error` level with full stack.
   - For 4xx errors: log at `warn` level without stack.
   - Never log request/response bodies to prevent credential leakage.

5. **Lifecycle and SSE logging** (`ruh-backend/src/app.ts`, `ruh-backend/src/sandboxManager.ts`):
   - Log sandbox-create SSE stream open/close with `requestId` and `stream_id`.
   - Log sandbox provisioning step transitions (Docker create, configure-agent, gateway ready) with duration.
   - Log sandbox deletion and channel configuration outcomes.

6. **Health endpoint enrichment** (`ruh-backend/src/app.ts`, `ruh-backend/src/backendReadiness.ts`):
   - Enhance `/health` to probe the DB connection pool (`SELECT 1`) and report component health.
   - Keep the response shape backward-compatible: `{ status: 'ok' | 'degraded', checks: { db: 'ok' | 'error' } }`.

#### Test suite

**Unit tests** (`ruh-backend/tests/unit/`):
- Logger module exports a pino instance that produces valid JSON with required fields.
- Request logging middleware sets `x-request-id` header on response and logs request/response pairs.
- Error middleware logs 5xx errors at `error` level with stack and 4xx at `warn` without stack.
- Correlation ID from incoming `x-request-id` header is preserved (not overwritten).

**Integration/route tests** (`ruh-backend/tests/`):
- A request to any route produces a structured JSON log line with `requestId`, `method`, `path`, `status`, and `durationMs`.
- A request that triggers a 500 error produces an `error`-level log entry with the error message and stack.
- `/health` returns component health including DB status.
- Log output does not contain request bodies, auth headers, or sandbox credentials.

**Operational verification**:
- `LOG_LEVEL=debug bun run dev` produces verbose output; `LOG_LEVEL=warn` suppresses request logs.
- `LOG_FORMAT=pretty` produces human-readable colored output for local development.
- Nginx access logs and backend request logs share the same `x-request-id` for correlated debugging.

#### Evaluation — task is done when
- [ ] Every HTTP request produces a structured JSON log entry with correlation ID, method, path, status, and duration
- [ ] Every error caught by the error middleware is logged with context before the response is sent
- [ ] Correlation IDs are generated on entry and propagated through response headers
- [ ] Log output excludes request/response bodies and sensitive headers to prevent credential leakage
- [ ] `/health` probes the database connection and reports component-level status
- [ ] `LOG_LEVEL` and `LOG_FORMAT` environment variables control verbosity and output format
- [ ] Tests verify logging output structure, error logging, and correlation ID propagation
- [ ] KB/deployment docs describe the logging contract and operational configuration

### TASK-2026-03-25-59: Harden browser security headers and CSP across web surfaces
- Status: `active`
- Owner: `Codex`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `docs/knowledge-base/000-INDEX.md`, `docs/knowledge-base/001-architecture.md`, `docs/knowledge-base/008-agent-builder-ui.md`, `docs/knowledge-base/009-ruh-frontend.md`, `docs/knowledge-base/010-deployment.md`, `docs/knowledge-base/specs/SPEC-web-security-headers.md`, `docs/knowledge-base/learnings/LEARNING-2026-03-25-web-security-headers-gap.md`, `agent-builder-ui/next.config.ts`, `agent-builder-ui/lib/security-headers.ts`, `agent-builder-ui/lib/security-headers.test.ts`, `agent-builder-ui/app/layout.tsx`, `agent-builder-ui/lib/providers/Providers.tsx`, `ruh-frontend/next.config.ts`, `ruh-frontend/lib/security-headers.ts`, `ruh-frontend/__tests__/lib/security-headers.test.ts`, `docs/journal/2026-03-25.md`
- Summary: `Completed the app-side runtime slice after the spec-first pass. Both Next apps now emit a shared baseline header set from \`headers()\`: CSP, \`X-Frame-Options: DENY\`, \`X-Content-Type-Options: nosniff\`, \`Referrer-Policy: strict-origin-when-cross-origin\`, and a locked-down \`Permissions-Policy\`. The builder now uses a small header helper plus remote-image allowlist sources, and the developer UI uses its own helper that preserves direct backend fetch/SSE access through env-aware \`connect-src\`. The builder also no longer injects its own light-theme inline script, and because the app is already light-only the \`next-themes\` wrapper was removed so the runtime no longer adds an unnecessary theme boot script at all. Focused red/green tests now cover the emitted headers in both apps.`
- Next step: `Run browser smoke verification on the builder create/deployed-chat flows and the ruh developer UI create/chat flow, then decide whether any production HTTPS terminator needs an HSTS/header overlay beyond the app-owned policy.`
- Blockers: `No code blocker. The checked-in \`nginx/nginx.conf\` is still a plain-HTTP local proxy, so HSTS remains an environment-specific HTTPS-edge rollout item rather than a checked-in dev-proxy change.`

#### Why this is important now

- Both Next apps now define app-wide `headers()` policies with baseline CSP, anti-framing, `X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy`, but browser smoke verification still needs to prove the supported create/chat flows run without blocked-resource errors.
- `nginx/nginx.conf` still only configures proxying, buffering, and timeouts. That is intentional for the checked-in plain-HTTP local proxy, but a real HTTPS terminator still needs an explicit HSTS decision during deployment rollout.
- `agent-builder-ui/app/layout.tsx` no longer injects inline JS to force light theme, and the light-only app no longer wraps the shell in `next-themes`, which removes an otherwise unnecessary inline boot script from the initial page.
- `agent-builder-ui/app/(platform)/agents/create/_components/MessageContent.tsx` renders architect-supplied markdown and opens outbound links; ReactMarkdown helps, but without a CSP there is no browser-enforced backstop if a future rendering bug or unsafe dependency introduces script execution.
- `ruh-frontend/components/SandboxResult.tsx` still renders preview/gateway tokens today pending TASK-2026-03-25-18, and `agent-builder-ui` currently stores access tokens in browser-readable state pending TASK-2026-03-25-28; browser-side hardening should not wait until every secret-handling task lands.
- Existing backlog items protect who can call routes and where secrets are stored, but none define the browser response-header contract that should apply even after those tasks are complete.

#### What to build

1. **Feature spec first** (`docs/knowledge-base/specs/SPEC-web-security-headers.md`):
   - Define the baseline header set by surface (`agent-builder-ui`, `ruh-frontend`, nginx/ingress).
   - Define CSP directives for `default-src`, `script-src`, `style-src`, `img-src`, `connect-src`, `frame-ancestors`, `base-uri`, `form-action`, and `object-src`.
   - Document dev vs. prod differences (for example: no HSTS on localhost; relaxed websocket allowances for local HMR if needed).
   - Add backlinks in `[[008-agent-builder-ui]]`, `[[009-ruh-frontend]]`, `[[010-deployment]]`, and any auth/session spec this depends on.

2. **Edge + app header implementation** (`agent-builder-ui/next.config.ts`, `ruh-frontend/next.config.ts`, `nginx/nginx.conf`, middleware/helpers if needed):
   - Done for both Next apps via `headers()` plus small helper modules and focused tests.
   - Keep nginx as an explicit deployment follow-up only for HTTPS-edge concerns; do not force HSTS into the checked-in plain-HTTP local proxy.

3. **CSP compatibility cleanup** (`agent-builder-ui/app/layout.tsx`, render helpers if needed):
   - Done for the builder shell: the inline theme-forcing script is removed and the light-only shell no longer uses `next-themes`.
   - Remaining work is smoke verification that architect SSE streaming, `/api/openclaw`, remote images, and syntax-highlighting styles still work under the chosen CSP.
   - If any browser console issues appear, keep the CSP exceptions narrowly scoped instead of broadening to wildcard sources.

4. **Testing + deployment guidance** (`agent-builder-ui/`, `ruh-frontend/`, `docs/knowledge-base/010-deployment.md`):
   - Done for focused header assertions in both apps.
   - Remaining work is browser-level smoke verification and any environment-specific HTTPS-edge rollout note once the real terminator is identified.
   - Make future auth/secret tasks extend this policy instead of adding one-off header exceptions.

#### Test suite

**Next / route tests** (`agent-builder-ui/`, `ruh-frontend/`):
- Representative page responses include the documented header set.
- Any same-origin BFF routes touched by the implementation emit the expected anti-framing / referrer / nosniff policy.

**Frontend verification** (`agent-builder-ui/`, `ruh-frontend/`):
- Builder create flow still renders markdown/code blocks, remote images, and SSE status under the chosen CSP.
- Developer UI pages still load and operate without blocked script/style/network errors on the supported path.

**Deployment verification**:
- Nginx / production responses include the documented edge headers.
- Local development remains usable without HTTPS-only headers breaking localhost workflows.

#### Evaluation — task is done when
- [x] Both web UIs emit documented security headers instead of relying on defaults
- [x] CSP is enforced and any remaining production exceptions are explicitly justified in the spec instead of being silent wildcard defaults
- [x] `agent-builder-ui` no longer depends on an undocumented inline-script exception for initial page load
- [x] Anti-clickjacking, referrer, and MIME-sniff protections are documented and emitted consistently
- [ ] Header tests and smoke verification cover the supported create/chat/sandbox flows
- [x] KB/deployment docs describe the browser security header contract and how future agents should extend it

### TASK-2026-03-25-58: Add heartbeat keepalives for long-running SSE control-plane streams
- Status: `active`
- Owner: `Analyst-1`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `ruh-backend/src/app.ts`, `ruh-backend/src/sandboxManager.ts`, `agent-builder-ui/app/api/openclaw/route.ts`, `nginx/nginx.conf`, `docs/knowledge-base/003-sandbox-lifecycle.md`, `docs/knowledge-base/008-agent-builder-ui.md`, `docs/knowledge-base/010-deployment.md`, `docs/knowledge-base/specs/`
- Summary: `The repo's two longest-lived SSE flows can go silent long enough to trip the checked-in proxy budgets even when the underlying work is still healthy. In \`ruh-backend/src/app.ts\`, sandbox-create SSE writes bytes only when \`createOpenclawSandbox()\` yields \`log\`, \`result\`, \`approved\`, or \`error\`; meanwhile \`ruh-backend/src/sandboxManager.ts\` runs quiet steps such as \`npm install -g openclaw@latest\` with a 600s timeout, \`openclaw onboard\` with a 120s timeout, and a 300s device-approval wait loop. In \`agent-builder-ui/app/api/openclaw/route.ts\`, the architect bridge only enqueues SSE frames when lifecycle or final-result events arrive, but \`nginx/nginx.conf\` sets \`/api/\` \`proxy_read_timeout\` and \`proxy_send_timeout\` to 180s. Existing backlog items cover reconnect/retry after disconnect, graceful shutdown, durable provisioning jobs, and SSE parsing correctness, but none prevent avoidable idle-timeout disconnects during otherwise successful long-running control-plane work.`
- Next step: `Start by writing \`docs/knowledge-base/specs/SPEC-sse-heartbeat-keepalive.md\`, then add a shared heartbeat/keepalive contract for \`/api/sandboxes/stream/:stream_id\` and \`/api/openclaw\` that emits bounded SSE keepalive bytes more frequently than the proxy timeout budget without changing the client-visible result contract.`
- Blockers: `None. This complements TASK-2026-03-25-19, TASK-2026-03-25-32, TASK-2026-03-25-33, and TASK-2026-03-25-55, but it fixes the preventive stream-liveness boundary those tasks do not cover.`

#### Why this is important now

- `nginx/nginx.conf` explicitly sets `proxy_read_timeout 180s` and `proxy_send_timeout 180s` for `/api/`, so any SSE route that emits no bytes for three minutes risks a proxy-generated disconnect even when the server is still working.
- `ruh-backend/src/sandboxManager.ts` runs multiple long operations with no intermediate stream writes from the SSE route:
  - `npm install -g openclaw@latest` with a 600s timeout
  - retry install with `--unsafe-perm` with a 600s timeout
  - `openclaw onboard ...` with a 120s timeout
  - a 300s device-pairing approval wait loop that only emits on success or at the terminal timeout message
- `ruh-backend/src/app.ts` sets `Content-Type: text/event-stream` and `Connection: keep-alive` for sandbox-create SSE, but it does not emit comment heartbeats, ping events, or any other keepalive bytes while the generator is blocked inside those long steps.
- `agent-builder-ui/app/api/openclaw/route.ts` returns SSE to the browser for architect runs, but it only sends data on explicit lifecycle or result transitions; a long model/tool step can therefore look idle to the proxy path even if the gateway socket is still alive.
- Existing tasks focus on how the product recovers after a disconnect:
  - `TASK-2026-03-25-19` and `TASK-2026-03-25-32` improve create-job reconnectability and restart durability
  - `TASK-2026-03-25-33` makes architect retries idempotent and cancelable
  - `TASK-2026-03-25-55` handles shutdown-time SSE termination
  None of them define the simpler preventive contract of keeping healthy streams alive through proxy idle windows.

#### What to build

1. **Feature spec first** (`docs/knowledge-base/specs/SPEC-sse-heartbeat-keepalive.md`):
   - Define which SSE routes require heartbeats now (`/api/sandboxes/stream/:stream_id` and `/api/openclaw`) and which byte pattern they should emit.
   - Prefer SSE comments or a dedicated no-op heartbeat event that does not alter existing client-visible success/error semantics.
   - Set the heartbeat cadence to a value comfortably below the narrowest documented proxy timeout budget and document the relationship to nginx/backend timeouts.
   - Add backlinks in `[[003-sandbox-lifecycle]]`, `[[008-agent-builder-ui]]`, and `[[010-deployment]]`.

2. **Sandbox-create SSE keepalive** (`ruh-backend/src/app.ts`):
   - Add a heartbeat timer that writes bounded keepalive frames while a sandbox-create stream is open and no terminal event has been sent.
   - Ensure the timer is cleared on `result` + `done`, `error`, client disconnect, and shutdown-driven stream cleanup.
   - Keep heartbeat frames safe for existing `EventSource` consumers so the frontend does not need to parse them as business events unless the spec explicitly chooses that path.
   - Consider setting `X-Accel-Buffering: no` on the response explicitly instead of relying only on proxy config.

3. **Architect bridge keepalive** (`agent-builder-ui/app/api/openclaw/route.ts`):
   - While waiting on `connectWithRetry()` / gateway work, enqueue the same heartbeat shape on a bounded interval so the browser-facing SSE response does not go idle at the proxy layer.
   - Stop heartbeats immediately when the controller closes, the request aborts, or the final `result` payload has been sent.
   - Preserve the current status/result/error contract so existing `sendToArchitectStreaming()` behavior and tests stay valid.

4. **Proxy and deployment alignment** (`nginx/nginx.conf`, `docs/knowledge-base/010-deployment.md`):
   - Document that proxy timeouts and heartbeat cadence are a coupled contract.
   - Verify the chosen heartbeat interval stays below the checked-in nginx timeout and any documented Kubernetes/ingress idle budgets.
   - Decide whether nginx timeout values should remain as-is once heartbeats exist or whether a modest safety increase is still warranted.

5. **Regression-proof verification** (`ruh-backend/tests/`, `agent-builder-ui/*test*`):
   - Add focused tests that simulate a long silent step and prove the route emits keepalive bytes before the terminal event.
   - Add client/route tests to prove heartbeat frames do not get misinterpreted as user-visible result data.
   - Keep the test layer as cheap as possible: unit/route tests first, then only a minimal E2E or smoke assertion if needed.

#### Test suite

**Backend route/unit tests** (`ruh-backend/tests/unit/` or targeted route coverage):
- Mock a slow sandbox-create generator step and assert `GET /api/sandboxes/stream/:stream_id` emits at least one heartbeat before the next real event.
- Assert heartbeats stop after terminal `error`/`done` and do not continue writing after client disconnect.
- Verify the response still emits the existing `log`, `result`, `approved`, `error`, and `done` events unchanged around the new keepalive frames.

**Builder bridge tests** (`agent-builder-ui/app/api/openclaw/route.test.ts` or equivalent Bun-covered harness):
- Hold `connectWithRetry()` pending and assert `/api/openclaw` emits heartbeat bytes before the final result.
- Verify the final `result` payload is still the only semantic completion event and heartbeat frames do not alter status classification.
- Verify request abort/close clears the heartbeat timer and does not continue enqueuing after shutdown.

**Operational verification**:
- A sandbox-create stream remains connected through a mocked >180s quiet phase without nginx closing it for idleness.
- A long-running architect request remains attached through the proxy path without a false gateway-unreachable error caused only by idle SSE output.
- Logs and docs clearly distinguish transport keepalives from actual progress messages.

#### Evaluation — task is done when
- [ ] `/api/sandboxes/stream/:stream_id` emits bounded SSE keepalive bytes during long quiet phases
- [ ] `/api/openclaw` emits the same or a documented equivalent keepalive contract during long architect runs
- [ ] Keepalive frames do not change existing user-visible success/error/result semantics for current clients
- [ ] Heartbeat timers are cleaned up on terminal events, aborts, and disconnects
- [ ] Proxy/deployment docs describe the timeout-to-heartbeat contract consistently
- [ ] Tests cover silent-period keepalives and prove clients ignore the new frames safely

### TASK-2026-03-25-57: Add SandboxSidebar delete-failure regression
- Status: `completed`
- Owner: `Tester-1`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `ruh-frontend/components/SandboxSidebar.tsx`, `ruh-frontend/__tests__/components/SandboxSidebar.test.tsx`, `docs/knowledge-base/009-ruh-frontend.md`, `docs/journal/2026-03-25.md`, `/Users/prasanjitdey/.codex/automations/tester-1/memory.md`
- Summary: `Added one bounded ruh-frontend component regression proving `SandboxSidebar` must keep a sandbox visible when `DELETE /api/sandboxes/:id` returns a non-OK response. Patched the component minimally so local state is updated only after a successful delete response, which keeps the sidebar fail-closed instead of hiding backend delete failures.`
- Next step: `Pick a different narrow gap next run and avoid reusing \`ruh-frontend/components/SandboxSidebar.tsx\` unless the sandbox-delete UX contract changes again.`
- Blockers: `None`

### TASK-2026-03-25-56: Add architect SSE multiline-data regression
- Status: `completed`
- Owner: `Codex`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `agent-builder-ui/lib/openclaw/api.ts`, `agent-builder-ui/lib/openclaw/api.test.ts`, `docs/knowledge-base/008-agent-builder-ui.md`, `docs/knowledge-base/learnings/LEARNING-2026-03-25-architect-sse-multiline-data.md`, `docs/journal/2026-03-25.md`
- Summary: `Added one bounded builder-unit regression proving the architect SSE client must rejoin multiple \`data:\` lines inside a single event before parsing the final JSON result. The new test failed first because \`sendToArchitectStreaming()\` kept only the last \`data:\` line, then passed after a minimal parser fix that joins all event payload lines with newline separators.`
- Next step: `Pick a different uncovered branch next run; avoid repeating the architect SSE final-buffer and multiline-\`data:\` parser cases unless the bridge protocol changes again.`
- Blockers: `None.`

### TASK-2026-03-25-55: Add graceful shutdown with connection draining and resource cleanup
- Status: `active`
- Owner: `Worker-1`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `docs/knowledge-base/000-INDEX.md`, `docs/knowledge-base/002-backend-overview.md`, `docs/knowledge-base/003-sandbox-lifecycle.md`, `docs/knowledge-base/010-deployment.md`, `docs/knowledge-base/specs/SPEC-graceful-shutdown.md`, `docs/journal/2026-03-25.md`, `/Users/prasanjitdey/.codex/automations/worker-1/memory.md`
- Summary: `Completed the first bounded slice of the graceful-shutdown task by writing \`SPEC-graceful-shutdown\` before touching the already-dirty backend runtime files. The new spec locks the intended signal-handling contract: mark the backend unready on shutdown, stop accepting new work, drain bounded in-flight requests, send terminal \`error\` events to active sandbox-create SSE streams, close the PostgreSQL pool, align the backend grace budget with Docker Compose/Kubernetes stop windows, and use \`SHUTDOWN_GRACE_MS\` as the backend-side deadline knob.`
- Next step: `Implement the spec in \`ruh-backend/src/index.ts\`, \`ruh-backend/src/db.ts\`, \`ruh-backend/src/app.ts\`, and \`ruh-backend/src/sandboxManager.ts\`, then add the narrowest shutdown-focused Bun tests for the touched modules.`
- Blockers: `None. This is independent of all existing tasks and directly improves production reliability for every deploy.`

#### Why this is important now

- `ruh-backend/src/index.ts` has zero signal handling — `process.on('SIGTERM')` is never called anywhere in the backend source tree.
- `ruh-backend/src/db.ts` exposes `initPool()` but has no `shutdownPool()` or `pool.end()` call path, so PostgreSQL connections are abandoned on exit instead of being drained and returned.
- `docker-compose.yml` defines `restart: unless-stopped` and health checks on the backend, meaning Docker sends SIGTERM on `docker compose restart` or rolling updates, but the process ignores it and gets SIGKILL after the default 10s grace period.
- `k8s/` deployment manifests configure rolling updates with `terminationGracePeriodSeconds`, but the backend cannot use that grace period because it has no shutdown handler.
- `ruh-backend/src/app.ts` serves long-lived SSE streams for sandbox creation (`/api/sandboxes/stream/:stream_id`). A hard kill during streaming leaves the client with a broken EventSource and no terminal event, causing the frontend to show a perpetual loading state.
- `ruh-backend/src/sandboxManager.ts` runs multi-step sandbox provisioning (Docker create → configure-agent → gateway setup) that can take 30-120 seconds. A kill mid-provisioning leaves containers in an undefined state with no cleanup path.
- Existing tasks cover Docker command timeouts (TASK-53), runtime drift reconciliation (TASK-31), and provisioning durability (TASK-19/32), but none address the process lifecycle boundary itself — the moment the OS tells the backend to stop.

#### What to build

1. **Feature spec first** (`docs/knowledge-base/specs/SPEC-graceful-shutdown.md`):
   - Define the shutdown contract: signal → stop listener → drain in-flight → close SSE → flush DB pool → exit.
   - Specify the configurable grace period (default: 25s, fitting inside Docker/K8s 30s default).
   - Document what happens to in-progress sandbox provisioning: mark as failed in DB, emit terminal SSE error event, let Docker timeout tasks handle container cleanup.
   - Add backlinks in `[[002-backend-overview]]` and `[[010-deployment]]`.

2. **Signal handlers and server close** (`ruh-backend/src/index.ts`):
   - Register `SIGTERM` and `SIGINT` handlers that call `server.close()` on the HTTP server.
   - Track the HTTP server instance (currently discarded by `app.listen()`) so it can be closed.
   - Set a hard exit timer (`setTimeout(() => process.exit(1), gracePeriodMs)`) as a safety net if draining stalls.
   - Log shutdown start and completion for operator visibility.

3. **Database pool shutdown** (`ruh-backend/src/db.ts`):
   - Export a `shutdownPool()` function that calls `pool.end()` and awaits connection drain.
   - Call it from the shutdown sequence after the HTTP server has stopped accepting requests.
   - Handle the case where pool was never initialized (DB init failure at startup).

4. **SSE stream cleanup** (`ruh-backend/src/app.ts`):
   - Track active SSE response objects in a Set.
   - On shutdown, send a terminal `error` event to each active stream before closing.
   - Remove streams from the set on normal completion or client disconnect.

5. **In-progress operation handling** (`ruh-backend/src/sandboxManager.ts`):
   - Expose a shutdown hook or cooperative cancellation token that provisioning generators can check.
   - On shutdown signal, mark any in-progress sandbox creation as `failed` in the DB so the frontend does not show stale "creating" state after reconnect.
   - Do not attempt to clean up Docker containers during shutdown — let the existing timeout and reconciliation tasks handle that.

6. **Docs and deployment alignment** (`docs/knowledge-base/002-backend-overview.md`, `docs/knowledge-base/010-deployment.md`, `docker-compose.yml`, `k8s/`):
   - Document the graceful shutdown behavior for operators.
   - Verify `docker-compose.yml` `stop_grace_period` and K8s `terminationGracePeriodSeconds` are consistent with the backend's configured grace period.
   - Add a `SHUTDOWN_GRACE_MS` env var to `.env.example`.

#### Test suite

**Backend unit tests** (`ruh-backend/tests/unit/`):
- Sending SIGTERM to the server process triggers the shutdown sequence (server stops accepting, pool drains).
- SSE streams receive a terminal error event before the server closes.
- `shutdownPool()` resolves cleanly when pool has active and idle connections.
- `shutdownPool()` is a no-op when pool was never initialized.
- The hard-exit safety timer fires if shutdown stalls past the grace period.

**Backend integration tests** (`ruh-backend/tests/integration/`):
- An in-flight HTTP request completes successfully when SIGTERM arrives during response generation.
- A new HTTP request after SIGTERM is rejected (connection refused or 503).
- The DB pool reports zero active connections after shutdown completes.

**Operational verification**:
- `docker compose restart backend` completes without SIGKILL (exit code 0, not 137).
- An active SSE sandbox-creation stream receives a terminal event and the frontend shows an error state instead of hanging.
- Backend logs show "Shutdown started" and "Shutdown complete" messages with timing.

#### Evaluation — task is done when
- [ ] Backend handles SIGTERM/SIGINT and stops accepting new connections
- [ ] In-flight HTTP requests are drained within the configurable grace period
- [ ] Active SSE streams receive a terminal error event before server close
- [ ] PostgreSQL connection pool is cleanly shut down via `pool.end()`
- [ ] Docker restart/stop exits with code 0 instead of being SIGKILL'd
- [ ] Tests cover signal handling, connection draining, SSE cleanup, and pool shutdown
- [ ] KB/deployment docs describe the graceful shutdown contract

### TASK-2026-03-25-54: Add validator regression coverage for agent-create payload edges
- Status: `completed`
- Owner: `Tester-1`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `ruh-backend/tests/unit/validation.test.ts`, `docs/journal/2026-03-25.md`, `/Users/prasanjitdey/.codex/automations/tester-1/memory.md`
- Summary: `Completed one bounded backend unit-test improvement around agent-create request validation by adding focused coverage for malformed and oversized \`agentRules\` entries. The validator already enforced those limits in production code; this run locked the behavior with a narrow regression and avoided the broken backend HTTP harness entirely.`
- Next step: `Pick a different narrow target next run; avoid revisiting \`ruh-backend/tests/unit/validation.test.ts\` unless the validator contract expands beyond agent-create payload edges.`
- Blockers: `None.`

### TASK-2026-03-25-53: Enforce real Docker command timeouts across backend ops
- Status: `active`
- Owner: `Analyst-1`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `ruh-backend/src/docker.ts`, `ruh-backend/src/app.ts`, `ruh-backend/src/sandboxManager.ts`, `ruh-backend/src/channelManager.ts`, `ruh-backend/tests/unit/`, `ruh-backend/tests/integration/`, `ruh-backend/tests/e2e/`, `docs/knowledge-base/002-backend-overview.md`, `docs/knowledge-base/003-sandbox-lifecycle.md`, `docs/knowledge-base/004-api-reference.md`, `docs/knowledge-base/006-channel-manager.md`, `docs/knowledge-base/specs/`
- Summary: `The backend threads timeout budgets through its Docker-facing call sites, but the low-level helpers never enforce them. In \`ruh-backend/src/docker.ts\`, both \`dockerSpawn(args, _timeoutMs)\` and \`dockerExec(containerName, cmd, _timeoutMs)\` accept timeout parameters yet ignore them, simply waiting on \`proc.exited\` after consuming stdout/stderr. That means sandbox creation, configure-agent, cron mutation, channel config, shared-Codex retrofit, and container cleanup can all hang indefinitely if a \`docker\` or in-container \`openclaw\` process stalls. Existing backlog items cover readiness, rate limits, provisioning durability, shell safety, and truthful apply semantics, but none make the documented Docker timeout contract real.`
- Next step: `Start by writing \`docs/knowledge-base/specs/SPEC-docker-command-timeouts.md\`, then change \`ruh-backend/src/docker.ts\` so \`dockerSpawn()\` and \`dockerExec()\` enforce caller-provided deadlines and surface a documented timeout failure that backend routes and lifecycle flows can handle deterministically.`
- Blockers: `None. This complements TASK-2026-03-25-11 (readiness), TASK-2026-03-25-19 and TASK-2026-03-25-32 (provisioning durability), TASK-2026-03-25-31 (runtime drift), and TASK-2026-03-25-52 (channel-config truthfulness), but it is a separate subprocess-reliability contract and can start immediately.`

#### Why this is important now

- `ruh-backend/src/docker.ts` defines `_timeoutMs` parameters on both Docker helper functions, but neither helper starts a timer, aborts the process, or returns a timeout-specific failure when the deadline is exceeded.
- `ruh-backend/src/app.ts` relies on `sandboxExec(sandboxId, cmd, timeoutSec)` for `configure-agent`, cron CRUD, pairing approval, channel status, and channel saves, so those HTTP routes currently have undocumented infinite-wait behavior whenever the underlying command hangs.
- `ruh-backend/src/sandboxManager.ts` passes explicit 10s, 15s, 30s, 120s, and 600s budgets into Docker operations during create, retrofit, restart, probe, and cleanup flows, but those budgets are advisory only because the helper layer ignores them.
- `docs/knowledge-base/002-backend-overview.md`, `[[003-sandbox-lifecycle]]`, and `[[006-channel-manager]]` all describe Docker-backed operations in terms of timeout-aware helpers, so the written reliability contract is currently stronger than the runtime implementation.
- A hung `docker exec` or `docker port` call can therefore wedge the most expensive product paths indefinitely, defeating operator expectations, making route-level overload handling weaker, and turning otherwise bounded failures into stuck requests or stuck background lifecycle work.

#### What to build

1. **Feature spec first** (`docs/knowledge-base/specs/SPEC-docker-command-timeouts.md`):
   - Define the timeout contract for backend Docker subprocesses: deadline source, failure shape, cleanup behavior, and which operations should return retryable vs. terminal errors.
   - Decide how timeout failures map into API responses (`504`, `502`, `503`, or route-specific contracts) and sandbox lifecycle events (`error`, degraded state, cleanup retry, operator action).
   - Add backlinks in `[[002-backend-overview]]`, `[[003-sandbox-lifecycle]]`, `[[004-api-reference]]`, and `[[006-channel-manager]]`.

2. **Enforce deadlines in the helper layer** (`ruh-backend/src/docker.ts`):
   - Implement real timeout handling for `dockerSpawn()` and `dockerExec()` instead of ignoring `_timeoutMs`.
   - Abort or kill the timed-out subprocess reliably, capture bounded stdout/stderr for diagnostics, and return an explicit timeout result that callers can distinguish from a normal non-zero exit.
   - Make sure timeout enforcement works for both host-side Docker commands and `docker exec ... bash -c <cmd>` commands without leaving zombie processes or hung promises behind.

3. **Route and lifecycle integration** (`ruh-backend/src/app.ts`, `ruh-backend/src/sandboxManager.ts`, `ruh-backend/src/channelManager.ts`):
   - Update `sandboxExec()` callers and lifecycle helpers to map timeout failures into deterministic route errors or generator `error` events instead of waiting forever.
   - Define what sandbox create, retrofit, channel save, cron mutation, and cleanup flows do after timeout: retry, mark explicit failure, or attempt bounded cleanup per the spec.
   - Keep user-facing errors actionable without dumping unbounded Docker output or secret-bearing command text into API responses.

4. **Recovery and cleanup semantics** (`ruh-backend/src/sandboxManager.ts`, related helpers):
   - Ensure timed-out create or cleanup paths do not silently leave half-configured containers without surfacing that fact to operators.
   - Reconcile timeout behavior with existing provisioning-durability and runtime-drift tasks so the repo does not introduce conflicting recovery models.
   - Preserve truthful apply semantics for channel/config routes when the restart or write command timed out rather than exited explicitly.

5. **Docs and verification coverage** (`docs/knowledge-base/002-backend-overview.md`, `docs/knowledge-base/003-sandbox-lifecycle.md`, `docs/knowledge-base/004-api-reference.md`, `docs/knowledge-base/006-channel-manager.md`, tests below):
   - Update the KB and API docs so they describe the actual timeout behavior, failure responses, and operator follow-up steps.
   - Add a dedicated Docker-helper test seam so future agents can verify timeout behavior without needing a live hung Docker daemon.
   - Document how timeout failures should be distinguished from normal CLI command failures when debugging production issues.

#### Test suite

**Backend unit tests** (`ruh-backend/tests/unit/`):
- `dockerSpawn()` times out after the requested deadline, terminates the subprocess, and returns the documented timeout failure shape.
- `dockerExec()` does the same for a mocked hung `docker exec` process while preserving the existing success behavior for normal commands.
- Helper tests cover partial stdout/stderr capture, timer cleanup, and the non-timeout path so enforcing deadlines does not break normal command execution.

**Backend integration / E2E tests** (`ruh-backend/tests/integration/`, `ruh-backend/tests/e2e/`):
- A route built on `sandboxExec()` returns within the documented timeout window when the Docker helper hangs instead of leaving the HTTP request open indefinitely.
- Sandbox create or retrofit converts a mocked Docker timeout into the spec-selected lifecycle failure path instead of hanging forever or yielding a misleading success event.
- Channel or cron mutation surfaces timeout as a failed apply/mutation contract rather than unconditional success.

**Operational verification**:
- Simulate a hung Docker subprocess locally and confirm the backend logs a timeout-specific failure, stops waiting, and leaves the route or lifecycle flow in the documented state.
- Confirm normal successful Docker commands still complete with the same outputs after timeout enforcement lands.

#### Evaluation — task is done when
- [ ] Caller-provided Docker timeout budgets are actually enforced by `dockerSpawn()` and `dockerExec()`
- [ ] Hung Docker/OpenClaw subprocesses no longer leave backend routes or lifecycle flows waiting indefinitely
- [ ] Timeout failures are distinguishable from ordinary command failures in both logs and API/lifecycle contracts
- [ ] Tests cover helper-level timeout behavior plus at least one route/lifecycle path that previously could hang
- [ ] KB/API docs describe the enforced Docker timeout contract consistently

### TASK-2026-03-25-52: Make channel config apply fail-closed and verified
- Status: `active`
- Owner: `Analyst-1`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `ruh-backend/src/channelManager.ts`, `ruh-backend/src/app.ts`, `ruh-backend/tests/unit/channelManager.test.ts`, `ruh-backend/tests/e2e/`, `ruh-frontend/components/ChannelsPanel.tsx`, `ruh-frontend/__tests__/components/ChannelsPanel.test.tsx`, `docs/knowledge-base/004-api-reference.md`, `docs/knowledge-base/006-channel-manager.md`, `docs/knowledge-base/009-ruh-frontend.md`, `docs/knowledge-base/specs/`
- Summary: `Channel save operations currently report success even when the underlying config write fails. In \`ruh-backend/src/channelManager.ts\`, both \`setTelegramConfig()\` and \`setSlackConfig()\` record per-step \`✗\` logs but still call \`restartGateway()\`, append \`✓ Gateway restarted\`, and return \`{ ok: true, logs }\` unconditionally. In \`ruh-frontend/components/ChannelsPanel.tsx\`, both save flows treat any HTTP 200 as success, show "Saved — gateway restarted", and clear the entered secret fields without checking whether the backend actually applied the requested change. Existing backlog items cover shell-safety, backend auth, audit logging, and \`configure-agent\` fail-closed deploys, but none define a truthful apply contract for Telegram/Slack channel configuration.`
- Next step: `Start by writing \`docs/knowledge-base/specs/SPEC-channel-config-apply-contract.md\`, then change \`ruh-backend/src/channelManager.ts\` and \`ruh-frontend/components/ChannelsPanel.tsx\` so channel saves fail closed when required writes or gateway restart steps fail and the UI distinguishes partial failure from success.`
- Blockers: `None. This complements TASK-2026-03-25-14 (shell-safe command construction), TASK-2026-03-25-39 (audit trail), and TASK-2026-03-25-09 (backend auth), but it is a separate control-plane truthfulness/reliability contract and can start immediately.`

#### Why this is important now

- `ruh-backend/src/channelManager.ts` logs whether each `openclaw config set` succeeded, but `setTelegramConfig()` and `setSlackConfig()` still return `ok: true` even if one or more writes failed.
- `restartGateway()` ignores the success/failure result of both `openclaw gateway stop` and the final `gateway run` command, so the backend can claim a restart happened when the process never came back up.
- `ruh-frontend/components/ChannelsPanel.tsx` only checks `res.ok`; any JSON `200` response becomes a green "Saved — gateway restarted" state and clears the newly entered secret fields, which hides failed writes from the operator.
- The only follow-up today is a manual status probe, so a broken save path leaves Telegram/Slack disconnected until someone notices after the fact.
- TASK-2026-03-25-24 already addresses the same false-success pattern for `configure-agent`, but channel config uses a different helper path and is not covered by that deployment contract.

#### What to build

1. **Feature spec first** (`docs/knowledge-base/specs/SPEC-channel-config-apply-contract.md`):
   - Define which channel-config steps are mandatory for success: individual config writes, gateway restart, and any optional validation/probe step.
   - Specify the response shape for full success, partial apply, validation failure, and gateway-restart failure.
   - Add backlinks in `[[004-api-reference]]`, `[[006-channel-manager]]`, and `[[009-ruh-frontend]]`.

2. **Fail-closed backend apply contract** (`ruh-backend/src/channelManager.ts`, `ruh-backend/src/app.ts` if needed):
   - Replace unconditional `{ ok: true, logs }` responses with a structured result that reflects whether every required step succeeded.
   - Capture restart outcome explicitly instead of always appending `✓ Gateway restarted`.
   - Decide whether failed saves should leave prior config untouched, report partial apply with recovery guidance, or attempt rollback; document that choice in the spec.

3. **Truthful frontend save handling** (`ruh-frontend/components/ChannelsPanel.tsx`):
   - Stop showing the green saved state for backend-declared partial failures or failed restarts.
   - Preserve entered secret fields when the backend reports failure so the operator does not lose the value they were trying to save.
   - Show operator-usable step logs or structured error text without requiring console inspection.

4. **Optional post-save verification seam** (`ruh-backend/src/channelManager.ts`, `ruh-frontend/components/ChannelsPanel.tsx`):
   - If the spec chooses it, run a lightweight post-restart probe or status check for the affected channel and surface that result as part of the save contract.
   - Keep the verification bounded so saves do not hang indefinitely on slow external providers.
   - Make clear which failures mean "config not applied" versus "config applied but provider connectivity still failing".

5. **Docs and API alignment** (`docs/knowledge-base/004-api-reference.md`, `docs/knowledge-base/006-channel-manager.md`, `docs/knowledge-base/009-ruh-frontend.md`):
   - Update the API docs so channel save responses no longer imply any HTTP 200 is a successful restart.
   - Document the new operator UX for failed channel saves and what logs/status signals to inspect next.
   - Cross-link the contract to audit/auth work without making truthful save feedback depend on those larger tasks.

#### Test suite

**Backend unit tests** (`ruh-backend/tests/unit/channelManager.test.ts`):
- A failed `setCfg()` call causes the returned apply result to report failure instead of unconditional `ok: true`.
- A failed gateway restart is surfaced distinctly from a config-write failure.
- Successful Telegram and Slack saves still report success with accurate step logs.

**Backend route / E2E tests** (`ruh-backend/tests/e2e/` or targeted route tests):
- `PUT /api/sandboxes/:sandbox_id/channels/telegram` returns the documented failure contract when a required write or restart step fails.
- `PUT /api/sandboxes/:sandbox_id/channels/slack` does the same for Slack-specific fields.
- The route preserves the documented redaction behavior for secrets in logs/errors.

**Frontend tests** (`ruh-frontend/__tests__/components/ChannelsPanel.test.tsx`):
- `ChannelsPanel` keeps token inputs intact and shows an error state when the backend reports `ok: false` or partial apply.
- The success state appears only for the documented fully successful backend result.
- Save feedback renders the returned step logs/error guidance without relying on browser console output.

#### Evaluation — task is done when
- [ ] Channel save endpoints no longer claim success when required config writes or gateway restart steps failed
- [ ] The developer UI distinguishes full success from failed or partial channel applies
- [ ] Operators do not lose newly entered Telegram/Slack secrets when the save fails
- [ ] Tests cover write failure, restart failure, and successful save paths for both Telegram and Slack
- [ ] KB/API docs describe the truthful channel-config apply contract consistently

### TASK-2026-03-25-51: Add architect workflow dependency normalization regression
- Status: `completed`
- Owner: `Tester-1`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `agent-builder-ui/lib/openclaw/response-normalization.test.ts`, `docs/journal/2026-03-25.md`
- Summary: `Added one bounded Bun unit regression in agent-builder-ui that locks the ready_for_review normalization contract around architect-supplied workflow dependency edges. The new test proves explicit \`workflow.steps[].wait_for\` edges survive normalization into the legacy builder skill-graph shape, covering an existing behavior without changing production code or overlapping the active agent-store test work.`
- Next step: `Pick a different uncovered branch next run; avoid the active agent-store target and this already-covered workflow-dependency case.`
- Blockers: `None`

### TASK-2026-03-25-50: Add agent store model-preservation fetch regression
- Status: `completed`
- Owner: `Codex`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `agent-builder-ui/hooks/use-agents-store.ts`, `agent-builder-ui/hooks/use-agents-store.test.ts`, `docs/journal/2026-03-25.md`
- Summary: `Added one bounded agent-builder unit regression for \`useAgentsStore.fetchAgents()\` so backend refreshes preserve the client-only \`model\` preference stored in local state. The new test locks the merge contract that keeps provider-selection/shared-Codex UI behavior stable after agent records are reloaded from the backend, and it passed without requiring any production-code changes.`
- Next step: `Pick a different narrow coverage gap next run; avoid revisiting \`agent-builder-ui/hooks/use-agents-store.ts\` unless the backend-to-store merge contract or persisted client-only fields change.`
- Blockers: `None`

### TASK-2026-03-25-49: Harden sandbox gateway access policy and remove insecure-auth defaults
- Status: `active`
- Owner: `Analyst-1`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `ruh-backend/src/sandboxManager.ts`, `ruh-backend/src/app.ts`, `ruh-backend/tests/unit/sandboxManager.test.ts`, `ruh-backend/tests/e2e/sandboxCreate.test.ts`, `ruh-frontend/components/SandboxResult.tsx`, `docs/knowledge-base/003-sandbox-lifecycle.md`, `docs/knowledge-base/010-deployment.md`, `docs/knowledge-base/specs/`
- Summary: `Sandbox creation currently enables a permissive downstream gateway control-UI auth posture on every new sandbox. In \`ruh-backend/src/sandboxManager.ts\`, bootstrap always sets \`gateway.bind lan\`, broad localhost-oriented \`gateway.controlUi.allowedOrigins\`, wide \`gateway.trustedProxies\`, and \`gateway.controlUi.allowInsecureAuth true\`, then the low-level UI tells users to open the dashboard URL in a browser and paste the gateway token manually. Existing backlog items cover repo API auth, token redaction, audit logging, and rate limiting, but none harden the sandbox-local gateway access policy itself, so every new sandbox inherits a security-sensitive browser/UI auth mode by default.`
- Next step: `Start by writing \`docs/knowledge-base/specs/SPEC-sandbox-gateway-access-policy.md\`, then change \`ruh-backend/src/sandboxManager.ts\` so insecure gateway control-UI auth is disabled by default and only re-enabled through an explicit documented dev/operator contract if the spec proves it is required.`
- Blockers: `None. This complements TASK-2026-03-25-18 (sandbox secret redaction), TASK-2026-03-25-09 (backend auth), and TASK-2026-03-25-39 (audit trail), but it is a separate downstream gateway-hardening problem and should not wait for them.`

#### Why this is important now

- `ruh-backend/src/sandboxManager.ts` unconditionally runs `openclaw config set gateway.controlUi.allowInsecureAuth true` during sandbox bootstrap, alongside `gateway.bind lan`, permissive `allowedOrigins`, and broad `trustedProxies`.
- `docs/knowledge-base/003-sandbox-lifecycle.md` documents that bootstrap step as part of the normal create flow, so this is a codified runtime contract rather than a temporary local override.
- `ruh-frontend/components/SandboxResult.tsx` explicitly instructs the user to open the dashboard URL in a browser, paste the gateway token, and connect, which makes the downstream browser-facing control surface part of the product workflow today.
- TASK-2026-03-25-18 can hide raw tokens from routine read paths, and TASK-2026-03-25-09 can protect the repo-owned backend, but neither task tightens the auth mode of the sandbox-local gateway itself once a sandbox exists.
- Because sandbox creation is the shared path for every new runtime, a permissive downstream gateway auth default expands the blast radius of any leaked token, over-broad origin trust, or future browser-side mistake across the whole product.

#### What to build

1. **Feature spec first** (`docs/knowledge-base/specs/SPEC-sandbox-gateway-access-policy.md`):
   - Define the intended access model for the sandbox gateway control UI and chat endpoints: backend-proxied only, explicit direct-browser/operator access, or a split model by environment.
   - Document whether `allowInsecureAuth` is ever allowed, in which environments, and what compensating controls are required when it is enabled.
   - Specify the relationship between dashboard/reveal flows, origin policy, trusted proxies, and the broader backend-auth + secret-redaction tasks.
   - Add backlinks in `[[003-sandbox-lifecycle]]`, `[[004-api-reference]]`, `[[010-deployment]]`, and any new sandbox-secret or audit spec this policy depends on.

2. **Secure bootstrap defaults** (`ruh-backend/src/sandboxManager.ts`):
   - Stop enabling `gateway.controlUi.allowInsecureAuth true` unconditionally during normal sandbox creation.
   - Narrow `gateway.controlUi.allowedOrigins` and `gateway.trustedProxies` to the spec-selected minimum instead of a silent broad default.
   - Decide whether `gateway.bind lan` remains necessary for all sandboxes or whether loopback/proxy-only access should be the default with an explicit opt-in for direct browser access.
   - Make any insecure or direct-access mode an explicit environment flag with loud logs/docs rather than a hidden default.

3. **Backend/UI access contract alignment** (`ruh-backend/src/app.ts`, `ruh-frontend/components/SandboxResult.tsx`):
   - Preserve whatever bootstrap/reveal flow is still necessary for operators, but stop assuming every sandbox should expose a browser-pasted direct gateway login path.
   - If direct dashboard access remains supported, isolate it behind the explicit reveal/audit contract chosen by TASK-2026-03-25-18 and TASK-2026-03-25-39 instead of treating it as the default setup path.
   - Keep backend proxy routes (`/chat`, `/models`, `/status`) working against the stored gateway token even after the control-UI auth mode is tightened.

4. **Documentation and deployment guidance** (`docs/knowledge-base/003-sandbox-lifecycle.md`, `docs/knowledge-base/010-deployment.md`, `docs/knowledge-base/011-key-flows.md`):
   - Document the actual supported sandbox gateway access path for local development, operator debugging, and product UIs.
   - Remove or update any stale instructions that tell users to rely on a direct insecure browser connection when the hardened contract ships.
   - Clarify which environment variables or deployment flags intentionally relax the gateway policy for local debugging, if any.

5. **Regression coverage** (`ruh-backend/tests/unit/sandboxManager.test.ts`, `ruh-backend/tests/e2e/sandboxCreate.test.ts`, security-focused route/config tests as needed):
   - Add tests that capture the gateway config commands emitted during sandbox creation and assert insecure auth is absent by default.
   - Add a config-path test for any explicit opt-in insecure/dev mode so the exception is deliberate and documented.
   - Keep one end-to-end verification proving a newly created sandbox remains usable through the spec-selected access path after the hardening change.

#### Test suite

**Backend unit tests** (`ruh-backend/tests/unit/`):
- Sandbox bootstrap command sequence does not set `gateway.controlUi.allowInsecureAuth true` in the default path.
- Origin and trusted-proxy configuration match the documented secure default rather than an overly broad fallback.
- Any explicit dev/operator override for insecure auth is gated behind the intended env flag and covered separately.

**Backend integration / E2E tests** (`ruh-backend/tests/e2e/`, `ruh-backend/tests/integration/`):
- Creating a sandbox still yields a usable runtime through the documented backend-proxy or explicit reveal path after the default hardening change.
- Sandbox create does not silently regress chat/models/status backend proxy behavior when direct control-UI auth is tightened.
- If a direct dashboard path remains supported, its reveal/access contract follows the spec-selected route and is not exposed through generic list/detail reads.

**Security / operator verification**:
- Inspect a newly created sandbox’s applied OpenClaw config and confirm insecure control-UI auth is disabled unless the documented override is enabled.
- Confirm the documented operator/debug flow still works in the environments where it is intentionally supported.
- Verify the product no longer depends on an implicit insecure browser-login assumption for normal sandbox management.

#### Evaluation — task is done when
- [ ] New sandbox creation no longer enables insecure gateway control-UI auth by default
- [ ] The sandbox gateway access model is explicit, documented, and environment-aware instead of being an implicit bootstrap side effect
- [ ] Backend proxy flows continue to work after the gateway hardening change
- [ ] Any remaining direct-browser/reveal flow is explicit, auditable, and narrowly scoped rather than the default path
- [ ] Tests cover the secure default plus any deliberate insecure/dev override
- [ ] KB/spec docs describe the hardened sandbox gateway access policy consistently

### TASK-2026-03-25-48: Normalize session-backed sandbox chat requests
- Status: `active`
- Owner: `Analyst-1`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `ruh-frontend/components/ChatPanel.tsx`, `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChat.tsx`, `ruh-backend/src/app.ts`, `ruh-backend/tests/e2e/chatProxy.test.ts`, `ruh-frontend/__tests__/components/ChatPanel.test.tsx`, `docs/knowledge-base/007-conversation-store.md`, `docs/knowledge-base/009-ruh-frontend.md`, `docs/knowledge-base/specs/`
- Summary: `The two deployed sandbox chat surfaces currently disagree about who owns conversation history once a gateway session key exists. ruh-frontend's ChatPanel sends the full prior transcript on every turn (\`messages: [...messages, userMsg]\`) while also attaching \`conversation_id\`, so the backend forwards an \`x-openclaw-session-key\` for a session that already retains context. The deployed-agent builder chat sends only the new user turn for the same backend route. This contract mismatch can replay old turns into an already stateful session, waste context budget, and produce divergent replies between the two chat clients, but none of the existing backlog items define the correct request shape once conversation-backed session memory is in play.`
- Next step: `Start by writing \`docs/knowledge-base/specs/SPEC-session-backed-chat-request-contract.md\`, then pin the backend and both chat UIs to one documented rule for requests with \`conversation_id\` before adding regression coverage around the chosen shape.`
- Blockers: `None. This is distinct from TASK-2026-03-25-22 (conversation-to-sandbox ownership) and TASK-2026-03-25-38 (backend-owned chat persistence): even after those land, the repo still needs one consistent rule for whether session-backed chat requests replay history or send only the new turn.`

#### Why this is important now

- `docs/knowledge-base/001-architecture.md` and `docs/knowledge-base/007-conversation-store.md` both state that `conversation_id` is converted into an `x-openclaw-session-key`, and that session key is what preserves agent context across turns.
- `ruh-backend/src/app.ts` forwards that session key whenever `conversation_id` is present, so the backend already treats the gateway conversation as stateful.
- `ruh-frontend/components/ChatPanel.tsx` still sends `messages: [...messages, userMsg]` on every turn, which means previously persisted user/assistant history is replayed into a session that is already retaining context.
- `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChat.tsx` sends only `[{ role: "user", content: text }]` with the same `conversation_id`, proving the repo already contains two conflicting assumptions about the same backend route.
- TASK-2026-03-25-22 hardens ownership of `conversation_id`, and TASK-2026-03-25-38 makes successful exchanges durable, but neither task decides whether a session-backed request should contain the whole transcript or only the new turn.

#### What to build

1. **Feature spec first** (`docs/knowledge-base/specs/SPEC-session-backed-chat-request-contract.md`):
   - Define the canonical request shape for `POST /api/sandboxes/:sandbox_id/chat` when `conversation_id` is present versus absent.
   - Decide whether session-backed chat allows only the newest user turn, allows limited non-persisted context, or preserves full OpenAI-style transcript replay for a documented reason.
   - Add backlinks in `[[007-conversation-store]]`, `[[009-ruh-frontend]]`, and `[[004-api-reference]]`.

2. **Backend contract enforcement** (`ruh-backend/src/app.ts`):
   - Normalize or reject mismatched request shapes so the backend does not silently accept both full-history replay and single-turn session-backed requests forever.
   - Keep non-conversation chat behavior explicit so one-off requests without `conversation_id` still follow the intended passthrough contract.
   - Make the chosen rule compose cleanly with TASK-2026-03-25-22 and TASK-2026-03-25-38 instead of creating a second incompatible chat mode.

3. **Ruh frontend alignment** (`ruh-frontend/components/ChatPanel.tsx`):
   - Stop replaying the full local transcript on every turn if the spec chooses session-owned history once a conversation exists.
   - Preserve first-message UX and optimistic rendering while ensuring the request body matches the documented backend contract.
   - Keep rename/history refresh behavior intact after the request-shape change.

4. **Cross-client parity** (`agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChat.tsx`, shared docs/tests):
   - Confirm the deployed-agent builder chat already matches the chosen contract, or update it if the spec picks a different rule.
   - Document one shared chat-request rule so future UI work does not reintroduce divergent behavior between chat clients.
   - Make sure any future mission-control or webhook-trigger chat entry points reuse the same session-backed rule.

5. **Docs and API alignment** (`docs/knowledge-base/007-conversation-store.md`, `docs/knowledge-base/009-ruh-frontend.md`, `docs/knowledge-base/004-api-reference.md`):
   - Describe whether `conversation_id` implies gateway-owned memory, client-replayed history, or a hybrid contract.
   - Remove any ambiguity that suggests both approaches are equally correct for the same route.
   - Call out the relation to backend-owned persistence so future agents do not treat transcript replay as a durability workaround.

#### Test suite

**Backend route / E2E tests** (`ruh-backend/tests/e2e/chatProxy.test.ts`, integration coverage as needed):
- Requests with `conversation_id` follow the spec-selected contract consistently and set the expected forwarded payload plus `x-openclaw-session-key`.
- If the spec rejects full-history replay in session-backed mode, the backend fails fast before forwarding oversized or duplicated transcript payloads.
- Non-conversation chat requests without `conversation_id` preserve the documented passthrough behavior.

**Frontend tests** (`ruh-frontend/__tests__/components/ChatPanel.test.tsx`, builder chat coverage as needed):
- `ChatPanel` sends only the spec-selected payload shape once a conversation exists.
- The deployed-agent builder chat follows the same request contract as `ruh-frontend`.
- History rendering and optimistic UI still work after the request-shape normalization.

**Manual / flow verification**:
- Multi-turn chat in `ruh-frontend` produces the same conversational behavior as the deployed-agent builder chat under the same sandbox/session.
- Long-running conversations stop growing request bodies turn-over-turn when the spec chooses session-owned history.

#### Evaluation — task is done when
- [ ] The repo has one documented request contract for session-backed sandbox chat instead of two conflicting client behaviors
- [ ] `ruh-frontend` and the deployed-agent builder chat send the same spec-selected shape for requests with `conversation_id`
- [ ] Backend chat handling does not silently accept duplicate-history replay and single-turn session-backed requests without an explicit rule
- [ ] Chat history, auto-rename flow, and backend-owned persistence work remain compatible with the normalized request contract
- [ ] Tests cover the chosen request shape and prevent the two chat clients from drifting again
- [ ] KB/API docs explain how session memory and request payload history interact

### TASK-2026-03-25-47: Add architect workflow-dependency normalization regression
- Status: `completed`
- Owner: `Tester-1`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `agent-builder-ui/lib/openclaw/response-normalization.ts`, `agent-builder-ui/lib/openclaw/response-normalization.test.ts`
- Summary: `Added one bounded agent-builder unit coverage slice for architect response normalization. The new tests lock clarification/schema normalization and exposed a real ready_for_review bug where explicit workflow wait_for edges were ignored; patched the helper so normalized skill-graph nodes and workflow steps now preserve architect-declared dependencies instead of forcing sequential edges.`
- Next step: `Pick a different narrow coverage gap next run; avoid reusing response-normalization unless the architect protocol contract or workflow payload shape changes again.`
- Blockers: `None`

### TASK-2026-03-25-46: Add channel config shell-escaping regression test
- Status: `completed`
- Owner: `Tester-1`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `ruh-backend/tests/unit/channelManager.test.ts`
- Summary: `Added one bounded backend unit regression covering channel config writes with embedded single quotes, so the existing shell-escaping path in channelManager stays pinned when Telegram secrets are passed through docker exec command strings. The target stayed test-only and passed under the narrow Bun unit command without requiring production changes.`
- Next step: `Pick a different narrow coverage gap next run and avoid revisiting ruh-backend/tests/unit/channelManager.test.ts unless channel config command construction changes.`
- Blockers: `None`

### TASK-2026-03-25-45: Verify full builder create-deploy-chat flow
- Status: `active`
- Owner: `Codex`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `agent-builder-ui/app/(platform)/agents/create/`, `agent-builder-ui/app/(platform)/agents/[id]/deploy/page.tsx`, `agent-builder-ui/app/(platform)/agents/[id]/chat/`, `agent-builder-ui/hooks/use-agents-store.ts`, `agent-builder-ui/lib/openclaw/agent-config.ts`, `ruh-backend/src/app.ts`, `ruh-backend/src/store.ts`, `docs/knowledge-base/008-agent-builder-ui.md`, `docs/knowledge-base/011-key-flows.md`, `docs/knowledge-base/specs/`
- Summary: `Running the live agent-builder flow end to end from /agents/create through deployment and deployed-agent chat, using the local running services and real OpenClaw gateway. Goal is to reproduce every critical path step in the browser, fix any blocker on the creation/deploy/chat handoff, and leave the flow working with a real newly deployed agent.`
- Next step: `Complete the browser flow with a new agent, identify the first failing layer if deployment or chat breaks, then patch the critical-path code and re-run the full scenario.`
- Blockers: `None yet`

### TASK-2026-03-25-44: Fix builder architect shared-Codex model override
- Status: `completed`
- Owner: `Codex`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `ruh-backend/src/sandboxManager.ts`, `ruh-backend/scripts/retrofit-shared-codex.ts`, `ruh-backend/tests/unit/sandboxManager.test.ts`, `docs/knowledge-base/008-agent-builder-ui.md`, `docs/knowledge-base/specs/SPEC-shared-codex-retrofit.md`, `/Users/prasanjitdey/.openclaw/openclaw.json`
- Summary: `Fixed the standalone builder gateway so shared-Codex retrofits now rewrite any explicit \`architect.model\` override to the shared Codex model and verify that agent-specific probe before declaring success. Applied the updated helper live to \`openclaw-openclaw-gateway-1\`, which persisted the change in \`~/.openclaw/openclaw.json\`; \`http://localhost:3001/agents/create\` now returns a normal architect clarification flow instead of a provider-auth error.`
- Next step: `Reuse the updated retrofit helper/script for future builder gateway recreates; if /agents/create regresses again, inspect \`openclaw models status --agent architect --probe --probe-provider openai-codex --json\` before assuming a gateway outage.`
- Blockers: `None`

### TASK-2026-03-25-43: Make sandbox deletion clean up conversation state
- Status: `completed`
- Owner: `Worker-1`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `ruh-backend/src/app.ts`, `ruh-backend/src/store.ts`, `ruh-backend/src/conversationAccess.ts`, `ruh-backend/tests/unit/store.test.ts`, `ruh-backend/tests/unit/conversationAccess.test.ts`, `ruh-backend/tests/integration/sandboxCrud.test.ts`, `ruh-backend/tests/e2e/conversationLifecycle.test.ts`, `docs/knowledge-base/000-INDEX.md`, `docs/knowledge-base/002-backend-overview.md`, `docs/knowledge-base/003-sandbox-lifecycle.md`, `docs/knowledge-base/004-api-reference.md`, `docs/knowledge-base/005-data-models.md`, `docs/knowledge-base/007-conversation-store.md`, `docs/knowledge-base/specs/SPEC-sandbox-conversation-cleanup.md`
- Summary: `Worker-1` completed the bounded backend slice for sandbox-owned conversation cleanup. `store.deleteSandbox()` now deletes dependent conversation rows before deleting the sandbox row, a new `conversationAccess` helper makes direct message/rename/delete routes require both sandbox existence and conversation ownership, and the KB/API/spec docs now describe the fail-closed contract. Focused unit verification passed for the new cleanup and guard logic.
- Next step: When local Postgres or the Bun/supertest harness is available, run the added integration and e2e coverage to confirm the full DB-backed and HTTP-backed behavior matches the new contract.
- Blockers: `Focused unit tests and backend typecheck passed. Real-DB integration verification is blocked locally by Postgres not running on 127.0.0.1:5432, and the existing Bun/supertest harness still fails before requests execute with TypeError: null is not an object (evaluating 'app.address().port').`

#### Why this is important now

- `ruh-backend/src/store.ts` deletes only from `sandboxes`, while `ruh-backend/src/conversationStore.ts` defines `conversations.sandbox_id` as an indexed text column rather than a DB-enforced foreign key back to `sandboxes`.
- `ruh-backend/src/app.ts` calls `getRecord()` for conversation list/create routes, but the direct message, rename, and delete routes only check `getConversation(conv_id)` plus `conv.sandbox_id === req.params.sandbox_id`, so a deleted sandbox can still have reachable conversation state if the IDs are known.
- The orphaned rows retain user prompts and assistant replies even after the product stops listing the sandbox, which is both a privacy problem and a source of backend data drift.
- TASK-2026-03-25-12 covers agent-to-sandbox ownership cleanup, TASK-2026-03-25-22 covers cross-sandbox chat-session reuse, TASK-2026-03-25-23 introduces a real migration system, and TASK-2026-03-25-31 reconciles Postgres rows against Docker state, but none of them explicitly clean up sandbox-owned conversation history or fail conversation routes closed after sandbox deletion.
- `docs/knowledge-base/005-data-models.md` currently labels `conversations.sandbox_id` as an FK even though the live schema does not enforce that contract, so the code and KB are already drifting apart in a privacy-sensitive area.

#### What to build

1. **Feature spec first** (`docs/knowledge-base/specs/SPEC-sandbox-conversation-cleanup.md`):
   - Define whether sandbox deletion is a hard purge of conversations/messages or whether any retention window/admin recovery path is intentionally preserved.
   - Specify the route contract for conversation/message endpoints after a sandbox is deleted, including list, create, get messages, append, rename, and delete.
   - Document how this contract composes with TASK-2026-03-25-12 (undeploy), TASK-2026-03-25-22 (chat conversation boundaries), and TASK-2026-03-25-23 (schema migrations).

2. **Backend-owned dependent cleanup** (`ruh-backend/src/app.ts`, `ruh-backend/src/store.ts`, `ruh-backend/src/conversationStore.ts`):
   - Add an explicit delete-by-sandbox cleanup path for conversations/messages instead of relying on callers to delete chats first.
   - Make sandbox deletion remove dependent conversation state deterministically before the request reports success, rather than leaving the cleanup implicit or best-effort.
   - Decide whether the cleanup belongs in the sandbox delete route, the store layer, or a shared transactional helper that can later be reused by undeploy/ownership work.

3. **Fail-closed conversation route guards** (`ruh-backend/src/app.ts`):
   - Introduce a helper that verifies both sandbox existence and conversation ownership for direct conversation-message routes.
   - Ensure deleted sandboxes return `404` consistently for direct message fetch/append/rename/delete instead of continuing to operate on orphaned rows.
   - Keep the chat proxy conversation-boundary task complementary: same-sandbox verification should still happen before session keys are forwarded.

4. **Data-model hardening** (`ruh-backend/src/conversationStore.ts`, future migration files per TASK-2026-03-25-23):
   - If the spec chooses DB-enforced ownership, add a real `REFERENCES sandboxes(sandbox_id) ON DELETE CASCADE` path through the repo's migration system instead of more ad hoc startup DDL.
   - Add one-time cleanup or reconciliation logic for pre-existing orphan conversation rows before or during the constraint rollout.
   - Update KB notes so `[[003-sandbox-lifecycle]]`, `[[005-data-models]]`, and `[[007-conversation-store]]` describe the actual current and intended contracts.

5. **Regression coverage** (`ruh-backend/tests/integration/`, `ruh-backend/tests/e2e/`):
   - Add an integration test showing sandbox deletion removes its conversations and cascaded messages.
   - Add route-level tests proving direct conversation endpoints return `404` after the sandbox is deleted, even if the old `conv_id` still exists in fixtures.
   - Preserve positive-path coverage for same-sandbox conversation access so this cleanup task does not regress normal chat/history behavior.

#### Test suite

**Backend integration tests** (`ruh-backend/tests/integration/`):
- Deleting a sandbox removes the sandbox row and its dependent conversations/messages in the same documented operation.
- Pre-existing orphan conversation rows are either cleaned up or surfaced exactly as the spec defines.

**Backend route / E2E tests** (`ruh-backend/tests/e2e/`):
- `GET|POST|PATCH|DELETE /api/sandboxes/:sandbox_id/conversations/:conv_id*` fail with `404` once the sandbox no longer exists.
- A valid conversation under an existing sandbox still supports list, append, rename, and delete operations.

**Schema / migration verification** (`ruh-backend/tests/unit/` or migration harness chosen in TASK-2026-03-25-23):
- Any new FK/cascade migration applies cleanly on an existing DB and rejects future orphan inserts if the spec chooses enforced ownership.

#### Evaluation — task is done when
- [ ] Deleting a sandbox no longer leaves orphaned conversation/message rows behind silently
- [ ] Direct conversation endpoints fail closed once the parent sandbox is gone
- [ ] The cleanup contract is documented and aligned across sandbox lifecycle, data-model, and conversation-store KB notes
- [ ] Regression tests cover both dependent cleanup and post-delete route behavior
- [ ] If DB-level ownership is enforced, it lands through the repo's migration system with a defined orphan-cleanup plan

### TASK-2026-03-25-41: Add SandboxForm SSE-close regression test
- Status: `completed`
- Owner: `Codex`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `ruh-frontend/components/SandboxForm.tsx`, `ruh-frontend/__tests__/components/SandboxForm.test.tsx`, `docs/knowledge-base/009-ruh-frontend.md`, `docs/knowledge-base/learnings/LEARNING-2026-03-25-sandboxform-sse-terminal-state.md`, `docs/journal/2026-03-25.md`
- Summary: Added one bounded `ruh-frontend` component regression proving `SandboxForm` must stay successful when the EventSource transport closes after a `done` event. Patched the component to track terminal SSE status outside the stale callback closure, and refreshed one obsolete component assertion so the local `SandboxForm` suite matches the current UI contract.
- Next step: Pick a different narrow gap next run and avoid reusing `ruh-frontend/components/SandboxForm.tsx` unless the sandbox-create SSE lifecycle changes again.
- Blockers: `None`

### TASK-2026-03-25-40: Add architect JSON-response regression test
- Status: `completed`
- Owner: `Tester-1`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `agent-builder-ui/lib/openclaw/api.test.ts`
- Summary: Added one bounded `agent-builder-ui` unit regression for `sendToArchitectStreaming()` so the helper is covered when the bridge returns a direct `application/json` architect payload instead of an SSE stream. This locks the non-SSE fast path without touching production code or overlapping the active backend request-validation work.
- Next step: Pick a different narrow gap next run and avoid revisiting `agent-builder-ui/lib/openclaw/api.ts` unless the bridge response contract changes again.
- Blockers: `None`

### TASK-2026-03-25-38: Add shared-Codex store persistence regression test
- Status: `completed`
- Owner: `Tester-1`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `ruh-backend/tests/unit/store.test.ts`
- Summary: Added one bounded backend unit regression for `store.updateSandboxSharedCodex()` so the shared-Codex retrofit persistence path is covered in the existing DB-mock harness. The test locks the SQL update contract for `shared_codex_enabled`, `shared_codex_model`, and the `COALESCE(NULLIF(sandbox_state, ''), 'running')` normalization without requiring production-code changes.
- Next step: Pick a different narrow gap next run and avoid reusing `ruh-backend/src/store.ts` shared-Codex persistence unless that DB contract changes again.
- Blockers: `None`

### TASK-2026-03-25-37: Add canonical URL helper regression tests
- Status: `completed`
- Owner: `Codex`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `agent-builder-ui/lib/utils/canonical.ts`, `agent-builder-ui/lib/utils/canonical.test.ts`
- Summary: Added one bounded Bun unit suite for `agent-builder-ui/lib/utils/canonical.ts`. The new coverage locks the helper’s base-URL precedence, development fallback, path normalization, and metadata generation used by app/layout metadata exports, and it passed without requiring production-code changes.
- Next step: Pick a different narrow gap next run; avoid reusing `agent-builder-ui/lib/utils/canonical.ts` unless the canonical URL contract or metadata wiring changes.
- Blockers: `None`

### TASK-2026-03-25-35: Add backend request schemas and fail-fast validation
- Status: `active`
- Owner: `Worker-1`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `ruh-backend/src/app.ts`, `ruh-backend/src/validation.ts`, `ruh-backend/tests/unit/validation.test.ts`, `docs/knowledge-base/002-backend-overview.md`, `docs/knowledge-base/004-api-reference.md`, `docs/knowledge-base/learnings/LEARNING-2026-03-25-backend-request-validation-gap.md`, `docs/knowledge-base/specs/SPEC-backend-request-validation.md`
- Summary: The shared request-validation slice now covers four agent persistence write routes: `POST /api/agents`, `PATCH /api/agents/:id`, `PATCH /api/agents/:id/config`, and `POST /api/agents/:id/sandbox`. This run added a strict metadata-patch validator for `PATCH /api/agents/:id`, requiring at least one documented metadata field, rejecting unknown keys, enforcing the existing name/status/skills constraints, and normalizing accepted strings/arrays before the store update call. The backend overview and API reference now document the expanded route coverage.
- Next step: Continue into `POST /api/sandboxes/:sandbox_id/configure-agent`, then the cron write routes, while keeping verification on focused validator/unit seams until the Bun/supertest harness issue is replaced or fixed.
- Blockers: `Route-level security tests that use supertest are currently unreliable in this Bun environment because the harness fails with a null app address before requests execute`

#### Why this is important now

- `ruh-backend/src/app.ts` uses bare `express.json()` with no route-level schema layer, so malformed bodies are rejected only by scattered ad hoc checks or by downstream failures.
- `POST /api/agents` and `PATCH /api/agents/:id/config` currently accept arbitrary object shapes, which means invalid or oversized fields can be persisted without a documented contract.
- `POST /api/sandboxes/:sandbox_id/configure-agent` and the cron routes already have a separate shell-safety backlog item, but they still lack typed payload validation for array/object shape, allowed values, and size bounds.
- `POST /api/sandboxes/:sandbox_id/chat` forwards user-controlled request bodies into the shared gateway proxy, so the absence of a backend-owned request contract makes reliability and abuse handling harder even after auth lands.
- The repo already depends on security tests and API docs, but the current tests in `ruh-backend/tests/security/injection.test.ts` mostly accept “non-500” outcomes instead of proving a consistent fail-fast validation boundary.

#### What to build

1. **Feature spec first** (`docs/knowledge-base/specs/SPEC-backend-request-validation.md`):
   - Define the backend request-validation contract: strict vs passthrough schemas, unknown-field policy, size limits, and when the API returns `400` vs `422`.
   - Document which routes are covered first and which proxy-style routes intentionally remain flexible.
   - Add backlinks in `[[002-backend-overview]]` and `[[004-api-reference]]`.

2. **Shared runtime validation layer** (`ruh-backend/src/`):
   - Add a reusable schema/validator module for request params, query, and body parsing instead of open-coded `String(...)`/truthy checks in route handlers.
   - Normalize validation failures into one backend error shape so callers get deterministic messages rather than downstream stack-derived behavior.
   - Set explicit JSON body-size limits where the spec says they are required.

3. **Harden the highest-risk write/proxy routes first** (`ruh-backend/src/app.ts`):
   - Validate `POST /api/agents`, `PATCH /api/agents/:id`, and `PATCH /api/agents/:id/config` so agent persistence only accepts documented shapes.
   - Validate `POST /api/sandboxes/:sandbox_id/configure-agent` for skill array shape, identifier safety, cron job structure, and bounded text sizes before any container command runs.
   - Validate cron create/edit inputs (`schedule`, `payload`, `session_target`, `wake_mode`, `description`) with explicit enums/ranges instead of partial string coercion.
   - Decide and document how much of `POST /api/sandboxes/:sandbox_id/chat` remains OpenAI-compatible passthrough versus backend-enforced shape validation.

4. **Error contract and docs** (`docs/knowledge-base/004-api-reference.md`, backend helpers/tests):
   - Document validation failure responses and route-specific required fields so the API reference matches runtime behavior.
   - Keep error payloads actionable without echoing oversized or sensitive submitted values.
   - Make the validation boundary explicit in the backend overview so future endpoints follow the same pattern.

5. **Regression coverage** (`ruh-backend/tests/security/`, `ruh-backend/tests/integration/`):
   - Replace today’s “does not crash” posture with route tests that assert malformed inputs are rejected before persistence, Docker exec, or gateway proxy calls.
   - Add focused validator tests for accepted and rejected payload variants.
   - Keep shell-safety and request-validation coverage complementary instead of duplicating the same assertions.

#### Test suite

**Backend unit tests** (`ruh-backend/tests/unit/`):
- Validator/schema tests cover accepted payloads, missing required fields, unknown fields, enum violations, and size-limit failures.
- Error-mapping tests confirm validation failures become deterministic `400`/`422` responses without leaking raw internals.

**Backend integration/security tests** (`ruh-backend/tests/security/`, `ruh-backend/tests/integration/`):
- `POST /api/agents` rejects malformed bodies and does not persist invalid agent rows.
- `PATCH /api/agents/:id/config` rejects invalid workflow/skill-graph payloads before store writes.
- `POST /api/sandboxes/:sandbox_id/configure-agent` rejects malformed skills/cron arrays before `dockerExec` is called.
- Cron create/edit routes reject invalid `schedule`, `session_target`, `wake_mode`, and oversized payload text deterministically.
- Oversized or malformed chat payloads fail cleanly per the documented contract instead of falling through to downstream gateway errors.

#### Evaluation — task is done when
- [ ] `ruh-backend` has a documented shared request-validation contract rather than route-by-route ad hoc coercion
- [ ] High-risk write/proxy routes reject malformed input before persistence, `docker exec`, or gateway forwarding begins
- [ ] Validation failures return consistent 4xx responses and do not depend on downstream exceptions
- [ ] Security/integration tests assert fail-fast validation outcomes instead of only “non-500” behavior
- [ ] API docs and backend overview describe the enforced schema boundary and payload limits

### TASK-2026-03-25-79: Add shared-Codex sandbox upsert serialization regression
- Status: `completed`
- Owner: `Tester-1`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `ruh-backend/tests/unit/store.test.ts`
- Summary: Added one bounded backend unit regression for `store.saveSandbox()` covering the shared-Codex persistence fields used during sandbox creation/upsert. The new test locks the SQL parameter serialization for `shared_codex_enabled` and `shared_codex_model`, so the shared-auth bootstrap path keeps writing the expected sandbox metadata without requiring production-code changes.
- Next step: Pick a different narrow coverage gap next run; avoid reusing `ruh-backend/tests/unit/store.test.ts` unless the sandbox-store upsert contract or shared-Codex persistence fields change.
- Blockers: `None`

### TASK-2026-03-25-34: Add appendMessages missing-content regression test
- Status: `completed`
- Owner: `Tester-1`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `ruh-backend/tests/unit/conversationStore.test.ts`
- Summary: Added one bounded backend unit regression for `appendMessages()` in the conversation store. The new test covers the existing `content ?? ''` persistence branch so message appends remain safe when a caller submits a role-only message payload without `content`, and it was verified with the single-file Bun test command without requiring production-code changes.
- Next step: Pick a different narrow coverage gap next run; avoid reusing `ruh-backend/tests/unit/conversationStore.test.ts` unless the message-persistence contract or append behavior changes.
- Blockers: `None`

### TASK-2026-03-25-33: Add architect SSE chunk-boundary regression test
- Status: `completed`
- Owner: `Codex`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `agent-builder-ui/lib/openclaw/api.ts`, `agent-builder-ui/lib/openclaw/api.test.ts`
- Summary: Added bounded `agent-builder-ui` Bun regressions for `sendToArchitectStreaming()` covering end-of-stream buffering and fragmented SSE events split across chunk boundaries. The red run exposed a real parser gap when the final `result` event arrived without a trailing blank-line delimiter, the green fix keeps the helper processing the leftover buffer at stream close, and the extra chunk-boundary case now verifies the client still emits status callbacks and returns the final response under fragmented delivery.
- Next step: Pick a different narrow coverage gap next run; avoid reusing `agent-builder-ui/lib/openclaw/api.ts` unless the architect SSE client contract changes again.
- Blockers: `None`

### TASK-2026-03-25-32: Add shared-Codex display-model fallback regression test
- Status: `completed`
- Owner: `Codex`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `agent-builder-ui/lib/openclaw/shared-codex.test.ts`
- Summary: Added one bounded `agent-builder-ui` Bun unit regression for the shared-Codex Settings helper. The new case covers the fallback branch where a sandbox is marked `shared_codex_enabled=true` but omits `shared_codex_model`, ensuring the UI still shows `openai-codex/gpt-5.4` without requiring production-code changes.
- Next step: Pick a different narrow gap next run; avoid reusing `agent-builder-ui/lib/openclaw/shared-codex.test.ts` unless the shared-Codex helper contract or Settings display behavior changes again.
- Blockers: `None`

### TASK-2026-03-25-31: Add parseJsonOutput trailing-noise regression test
- Status: `completed`
- Owner: `Tester-1`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `ruh-backend/tests/unit/utils.test.ts`
- Summary: Added one bounded backend unit regression for `parseJsonOutput()` covering CLI output that contains valid JSON followed by trailing log noise. The test exercises the parser's truncation fallback that protects cron/run/probe endpoints from mixed log + JSON output, and it passed without requiring production changes.
- Next step: Pick a different narrow gap next run; avoid reusing `ruh-backend/tests/unit/utils.test.ts` unless gateway/CLI parsing behavior changes again.
- Blockers: `None`

### TASK-2026-03-25-30: Add architect model-limitation error regression
- Status: `completed`
- Owner: `Tester-1`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `agent-builder-ui/lib/openclaw/error-classification.test.ts`
- Summary: Added one bounded Bun unit regression in `agent-builder-ui` covering the model-limitation branch in `classifyGatewayRunError`, so architect runtime failures like `context_length` and `failed_generation` remain classified as non-retryable typed errors. Verified with the single-file Bun test command.
- Next step: Pick a different narrow test gap next run; avoid reusing `error-classification.test.ts` unless route behavior changes or new classifier patterns are added.
- Blockers: `None`

### TASK-2026-03-25-29: Replace Settings curated model list with live sandbox models
- Status: `completed`
- Owner: `Worker-1`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabSettings.tsx`, `agent-builder-ui/e2e/tab-settings-model.spec.ts`, `docs/knowledge-base/008-agent-builder-ui.md`, `docs/knowledge-base/specs/SPEC-agent-model-settings.md`
- Summary: Replaced the Settings tab’s static model catalog with live sandbox model discovery. `TabSettings` now fetches `GET /api/sandboxes/:sandbox_id/models`, renders backend-returned models when available, and falls back to the prior curated catalog only when discovery is synthetic, empty, or unavailable. Added a focused Playwright case covering backend-returned model IDs and updated the KB/spec to reflect the new source-of-truth behavior.
- Next step: When a sandbox-returned model does not map cleanly to one of the known providers, consider refining the provider inference/display rules instead of reintroducing a static catalog.
- Blockers: `None`

### TASK-2026-03-25-28: Add ChannelsPanel pairing-approval regression test
- Status: `completed`
- Owner: `Codex`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `ruh-frontend/__tests__/components/ChannelsPanel.test.tsx`
- Summary: Added one bounded `ruh-frontend` component regression test for the Telegram pairing approval flow. The suite now verifies that manual approval uppercases the device code, posts the normalized payload to the backend, refreshes pending pairing codes after success, and clears the input without touching production code.
- Next step: Pick a different narrow gap next run; avoid broadening into `ruh-frontend` Jest infrastructure unless a future run is explicitly about test runner maintenance.
- Blockers: `None`

### TASK-2026-03-25-27: Retrofit existing running sandboxes and builder gateway to shared Codex auth
- Status: `completed`
- Owner: `Codex`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `ruh-backend/src/store.ts`, `ruh-backend/src/sandboxManager.ts`, `ruh-backend/src/app.ts`, `ruh-backend/src/utils.ts`, `ruh-backend/tests/`, `ruh-backend/scripts/`, `agent-builder-ui/app/(platform)/agents/[id]/chat/`, `agent-builder-ui/lib/openclaw/shared-codex.ts`, `agent-builder-ui/e2e/tab-settings-model.spec.ts`, `docs/knowledge-base/`, `/Users/prasanjitdey/Research/Openclaw/docker-compose.yml`
- Summary: Completed the retrofit path for already-running OpenClaw sandboxes and the standalone builder gateway. Added persisted shared-Codex sandbox metadata, an admin-only in-place retrofit route, a sequential rollout script, a builder compose mount for host `~/.codex`, and frontend enforcement that shared-Codex sandboxes use gateway default instead of stale local model overrides. During live rollout, the builder gateway exposed a real gap: mounted Codex auth alone did not create an `openai-codex` target, so the helper now also refreshes onboarding, syncs `.codex/auth.json` into `auth-profiles.json` as `openai-codex:default`, and validates probe output robustly even when OpenClaw prepends ANSI/log noise.
- Next step: If additional unmanaged `openclaw-*` containers should move to shared Codex, decide explicitly which ones are real sandboxes versus test/manual containers and run a separate bounded retrofit for them instead of broadening the DB-backed rollout script.
- Blockers: `None`

### TASK-2026-03-25-25: Prototype shared Codex/OpenClaw OAuth bootstrap for sandboxes
- Status: `completed`
- Owner: `Codex`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `ruh-backend/src/sandboxManager.ts`, `ruh-backend/tests/unit/sandboxManager.test.ts`, `docs/knowledge-base/`
- Summary: Implemented the unsafe shared-auth bootstrap the user requested. New sandbox creation now prefers host OpenClaw OAuth state, falls back to host Codex CLI auth, seeds that auth into the container, onboards with `--auth-choice skip`, sets `openai-codex/gpt-5.4` by default, and live-probes `openai-codex` before exposing the sandbox. Added unit coverage for fallback and precedence and validated the real flow with a disposable Docker sandbox using the host Codex auth file.
- Next step: If the separately managed architect gateway should use the same model-auth path, bootstrap that gateway host with the same shared auth convention; the `agent-builder-ui` bridge itself still needs `OPENCLAW_GATEWAY_URL` and `OPENCLAW_GATEWAY_TOKEN`.
- Blockers: `None`

### TASK-2026-03-25-26: Establish agent learning system and daily journal contract
- Status: `completed`
- Owner: `Codex`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `CLAUDE.md`, `AGENTS.md`, `agents.md`, `agents/README.md`, `agents/analyst-1.md`, `agents/worker-1.md`, `agents/tester-1.md`, `.agents/agents/README.md`, `.agents/agents/analyst-1.md`, `.agents/agents/worker-1.md`, `.agents/agents/tester-1.md`, `docs/knowledge-base/000-INDEX.md`, `docs/knowledge-base/001-architecture.md`, `docs/knowledge-base/010-deployment.md`, `docs/knowledge-base/012-automation-architecture.md`, `docs/knowledge-base/013-agent-learning-system.md`, `docs/knowledge-base/specs/SPEC-agent-learning-and-journal.md`, `docs/knowledge-base/specs/SPEC-automation-agent-roles.md`, `docs/knowledge-base/learnings/LEARNING-2026-03-25-agent-learning-system.md`, `docs/journal/README.md`, `docs/journal/2026-03-25.md`, `docs/plans/2026-03-25-agent-learning-system-design.md`, `docs/plans/2026-03-25-agent-learning-system.md`, `/Users/prasanjitdey/.codex/automations/analyst-1/automation.toml`, `/Users/prasanjitdey/.codex/automations/analyst-1/memory.md`, `/Users/prasanjitdey/.codex/automations/worker-1/automation.toml`, `/Users/prasanjitdey/.codex/automations/worker-1/memory.md`, `/Users/prasanjitdey/.codex/automations/tester-1/automation.toml`, `/Users/prasanjitdey/.codex/automations/tester-1/memory.md`, `/Users/prasanjitdey/.codex/automations/feature-add-automation/automation.toml`, `/Users/prasanjitdey/.codex/automations/feature-add-automation/memory.md`, `/Users/prasanjitdey/.codex/automations/automated-worker/automation.toml`, `/Users/prasanjitdey/.codex/automations/automated-worker/memory.md`, `/Users/prasanjitdey/.codex/automations/tester-template/automation.toml`, `/Users/prasanjitdey/.codex/automations/tester-template/memory.md`
- Summary: Established a repo-wide operating contract that separates task state (`TODOS.md`), chronological run history (`docs/journal/YYYY-MM-DD.md`), and durable KB learnings (`docs/knowledge-base/learnings/LEARNING-YYYY-MM-DD-<task-slug>.md`). Added the KB system note/spec, seeded the first journal and learning note, updated the shared repo instructions and role mirrors, and aligned the active automation prompts and memory files. This also corrected `worker-1` and `automated-worker` so their runtime prompts now match the documented implementation-worker role instead of acting like backlog analysts.
- Next step: Future changes to agent workflow or automation prompts should update `docs/knowledge-base/012-automation-architecture.md`, `docs/knowledge-base/013-agent-learning-system.md`, the shared instruction files, the role mirrors, and the active automation configs in the same change. Every next non-trivial run should append to the journal and only create a learning note when the insight is durable.
- Blockers: `None`

### TASK-2026-03-25-21: Add sidebar delete non-selection regression test
- Status: `completed`
- Owner: `Codex`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `ruh-frontend/__tests__/components/SandboxSidebar.test.tsx`
- Summary: Added the `ruh-frontend` sidebar regression test that verifies clicking `Remove` deletes a sandbox without also firing `onSelect`. Also updated the sidebar test harness for the redesigned component props, highlight class, truncated ID text, and renamed new-sandbox button so the focused suite matches the current UI.
- Next step: Pick a different narrow backend or frontend coverage gap next run. If `ruh-frontend` needs another focused Jest run before `jest.config.ts` is fixed, use a temporary JS config and `--watchman=false` rather than broadening scope into test-infra repair.
- Blockers: `None`

### TASK-2026-03-25-20: Research Codex OAuth as default OpenClaw auth backend
- Status: `completed`
- Owner: `Codex`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`
- Summary: Researched whether OpenClaw can use OpenAI Codex OAuth / ChatGPT sign-in as the model-auth backend for the architect gateway and newly created agent sandboxes. Findings: OpenClaw officially supports `openai-codex` OAuth, can reuse `~/.codex/auth.json` interactively, and supports headless import by copying OpenClaw OAuth state files, but the current repo still needs a separate gateway bearer token for app-to-gateway auth and a naive shared-token rollout across many sandboxes risks refresh-token collisions/logouts.
- Next step: If we choose to implement this, create a spec for a Codex-OAuth sandbox bootstrap flow that distinguishes model auth from gateway auth, defines how OAuth state is seeded into containers, and decides whether to use one shared Codex account or dedicated per-environment profiles.
- Blockers: `None`

### TASK-2026-03-25-19: Clarify architect gateway auth failures in the bridge
- Status: `completed`
- Owner: `Codex`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `agent-builder-ui/app/api/openclaw/route.ts`, `agent-builder-ui/lib/openclaw/error-classification.ts`, `agent-builder-ui/lib/openclaw/error-classification.test.ts`, `agent-builder-ui/bun-test.d.ts`, `docs/knowledge-base/`
- Summary: Added a pure route-level classifier for architect runtime errors so `FailoverError` payloads carrying provider `401 authentication_error` responses are surfaced as terminal LLM credential failures instead of being retried and rewritten as gateway outages. Added a focused Bun regression test and KB/spec updates documenting that provider-auth failures are handled separately from transport failures.
- Next step: If similar mislabeling shows up for other terminal runtime errors, extend `classifyGatewayRunError()` with another narrowly tested classification instead of adding more route-local string matching.
- Blockers: `None`

### TASK-2026-03-25-18: Define repo automation agent folders and role contracts
- Status: `completed`
- Owner: `Codex`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `agents/README.md`, `agents/analyst-1.md`, `agents/worker-1.md`, `agents/tester-1.md`, `.agents/agents/README.md`, `.agents/agents/analyst-1.md`, `.agents/agents/worker-1.md`, `.agents/agents/tester-1.md`, `docs/knowledge-base/000-INDEX.md`, `docs/knowledge-base/001-architecture.md`, `docs/knowledge-base/012-automation-architecture.md`, `docs/knowledge-base/specs/SPEC-automation-agent-roles.md`, `docs/plans/2026-03-25-repo-automation-agents-design.md`, `docs/plans/2026-03-25-repo-automation-agents.md`
- Summary: Added a visible `agents/` catalog and a hidden `.agents/agents/` mirror with explicit role contracts for `Analyst-1`, `Worker-1`, and `Tester-1`. Documented the convention in a new KB spec, updated the architecture and automation notes with backlinks, and corrected the KB index to point at the repo-local `/kb` skill copy under `.agents/skills/kb/SKILL.md`.
- Next step: If these documented roles should also control the currently scheduled automations, update the corresponding `$CODEX_HOME/automations/*/automation.toml` prompts so runtime behavior matches the new repo contracts.
- Blockers: `None`

### TASK-2026-03-25-17: Add reconfigureSandboxLlm Ollama-path regression test
- Status: `completed`
- Owner: `Codex`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `ruh-backend/tests/unit/sandboxManager.test.ts`
- Summary: Added one bounded backend unit test for the Ollama branch in `reconfigureSandboxLlm`, covering custom model/base URL handling, env payload generation, and provider-specific configuration without changing production code.
- Next step: Next coverage run should avoid the sandbox LLM reconfiguration path and pick another narrow gap in a different backend or frontend module.
- Blockers: `None`

### TASK-2026-03-25-16: Add reconfigureSandboxLlm unhealthy-gateway regression test
- Status: `completed`
- Owner: `Codex`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `ruh-backend/tests/unit/sandboxManager.test.ts`
- Summary: Adding one bounded backend unit test for the `reconfigureSandboxLlm` failure path when the gateway never becomes healthy after restart, to improve reliability without touching active feature work.
- Next step: Next coverage run should look for another narrow backend or ruh-frontend gap outside the active agent-builder tasks and avoid reusing the sandbox LLM reconfiguration path immediately.
- Blockers: `None`

### TASK-2026-03-25-15: Define repo test-coverage automation
- Status: `completed`
- Owner: `Codex`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `CLAUDE.md`, `docs/knowledge-base/000-INDEX.md`, `docs/knowledge-base/001-architecture.md`, `docs/knowledge-base/010-deployment.md`, `docs/knowledge-base/012-automation-architecture.md`, `docs/knowledge-base/specs/SPEC-test-coverage-automation.md`, `docs/plans/2026-03-25-test-coverage-automation-design.md`, `docs/plans/2026-03-25-test-coverage-automation.md`, `/Users/prasanjitdey/.codex/automations/tester-template/automation.toml`, `/Users/prasanjitdey/.codex/automations/tester-template/memory.md`
- Summary: Replaced the placeholder `tester-template` automation with a repo-specific analyze-patch-verify contract that is allowed to add tests directly when it can make one bounded, validated change per run. Added the supporting KB spec, canonical prompt documentation, design/implementation plans, and automation memory initialization.
- Next step: Run the `tester-template` automation against the repo and confirm its first pass chooses one narrow test gap, validates with the smallest relevant command, and falls back to a TODO only when a safe patch is not possible.
- Blockers: `None`

### TASK-2026-03-25-14: Clarify feature-add automation prompt and repo instructions
- Status: `completed`
- Owner: `Codex`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `CLAUDE.md`, `agents.md`, `docs/knowledge-base/012-automation-architecture.md`
- Summary: Added an explicit canonical feature-add/backlog-curation automation prompt to `012-automation-architecture.md` and updated the shared repo instructions so future agents reuse that prompt and keep the KB/instruction files aligned when the automation contract changes.
- Next step: Reuse the canonical prompt from `docs/knowledge-base/012-automation-architecture.md` when creating this automation, and update that note plus `CLAUDE.md` together if the prompt or workflow changes.
- Blockers: `None`

### TASK-2026-03-25-09: Document automation architecture and prompt pattern
- Status: `completed`
- Owner: `Codex`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `CLAUDE.md`, `agents.md`, `docs/knowledge-base/000-INDEX.md`, `docs/knowledge-base/001-architecture.md`, `docs/knowledge-base/010-deployment.md`, `docs/knowledge-base/012-automation-architecture.md`
- Summary: Added repo documentation for how Codex automations should operate in this project, including where automation state lives, how runs should use `TODOS.md` + the KB, and a reusable prompt template for a backlog-curation automation.
- Next step: Reuse the prompt from `012-automation-architecture.md` when creating new recurring automation runs, and update that note if the automation contract changes.
- Blockers: `None`

### TASK-2026-03-25-02: Implement TODO-001 provider reconfiguration flow
- Status: `completed`
- Owner: `Codex`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `ruh-backend/src/app.ts`, `ruh-backend/src/sandboxManager.ts`, `ruh-backend/tests/`, `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabSettings.tsx`, `docs/knowledge-base/specs/SPEC-agent-model-settings.md`
- Summary: Working on the highest-priority deferred task from `SPEC-agent-model-settings`: add a backend endpoint for reconfiguring the sandbox LLM provider and update the Settings tab with API-key driven provider switching plus gateway restart.
- Next step: The next Settings follow-up is TODO-002 — replace the curated model list with live data from `GET /api/sandboxes/:sandbox_id/models`.
- Blockers: `None`

### TASK-2026-03-25-01: Make TODOS.md the canonical agent work log
- Status: `completed`
- Owner: `Codex`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `CLAUDE.md`, `agents.md`, `TODOS.md`, `docs/plans/2026-03-25-todos-work-log-design.md`, `docs/plans/2026-03-25-todos-work-log.md`
- Summary: Added repo instructions that require agents to read and maintain the root `TODOS.md` for non-trivial tasks. `agents.md` continues to mirror `CLAUDE.md` via symlink, so the policy applies to both instruction files.
- Next step: Future agents should add or update an entry here before starting substantial work and keep it current through handoff or completion.
- Blockers: `None`

---

## Feature Tasks

### TASK-2026-03-25-36: Persist Improve Agent config edits before hot-push
- Status: `completed`
- Owner: `Worker-1`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `agent-builder-ui/app/(platform)/agents/create/page.tsx`, `agent-builder-ui/hooks/use-agents-store.ts`, `agent-builder-ui/hooks/use-agents-store.test.ts`, `docs/knowledge-base/000-INDEX.md`, `docs/knowledge-base/008-agent-builder-ui.md`, `docs/knowledge-base/specs/SPEC-agent-edit-config-persistence.md`, `docs/knowledge-base/specs/SPEC-agent-persistence.md`
- Summary: `Worker-1` completed the bounded Improve Agent persistence fix without changing the backend API surface. The builder store now exposes a combined `persistAgentEdits()` helper that saves metadata and architect config in sequence, preserves client-only `model` state when backend responses overwrite local agents, and returns the merged saved snapshot. `CreateAgentPage` now awaits that saved snapshot before any hot-push and pushes running sandboxes from the persisted record instead of a transient in-memory object. Added the feature spec, updated KB links, and locked the contract with a focused Bun store regression.
- Next step: If this flow needs broader confidence later, add a higher-level builder component/E2E case that exercises Improve Agent through review/configure and refreshes from the backend-backed record.
- Blockers: `None`

#### Why this is important now

- `agent-builder-ui/app/(platform)/agents/create/page.tsx` treats Improve Agent as a save-and-hot-push flow, but it bypasses the existing `/api/agents/:id/config` contract that was added specifically for `skillGraph`, `workflow`, and `agentRules`.
- `agent-builder-ui/hooks/use-agents-store.ts` already has `updateAgentConfig()`, yet `updateAgent()` drops those config fields and then overwrites the local agent with the stale backend payload from `PATCH /api/agents/:id`.
- `agent-builder-ui/lib/openclaw/agent-config.ts` builds SOUL content, skill files, and cron jobs from `skillGraph` and `agentRules`, so future deploys and hot-pushes need a trustworthy persisted snapshot rather than one transient client-side object.
- `TASK-2026-03-25-07` (release history) and `TASK-2026-03-25-24` (config apply contract) both assume the product knows which config version is current. That assumption is false until Improve Agent persists the edited architect output reliably.

#### What to build

1. **Spec first** (`docs/knowledge-base/specs/SPEC-agent-edit-config-persistence.md`):
   - Define the save contract for improving an existing agent: which fields are persisted, in what order, and what happens if metadata save succeeds but config save or hot-push fails.
   - Decide whether the frontend should call two existing endpoints in sequence or whether the backend should expose one atomic update endpoint for metadata + architect config.
   - Link the spec to `[[008-agent-builder-ui]]`, `[[SPEC-agent-persistence]]`, and any release-history/config-apply specs it composes with.

2. **Persist existing-agent config updates** (`agent-builder-ui/app/(platform)/agents/create/page.tsx`, `agent-builder-ui/hooks/use-agents-store.ts`):
   - Make the existing-agent path await persistence of both metadata fields and architect config fields before resetting state or navigating away.
   - Use `updateAgentConfig()` or a new combined helper instead of assuming `updateAgent()` is enough.
   - Keep client-only fields such as `model` intact when merging backend responses.

3. **Align backend/store contracts if needed** (`ruh-backend/src/app.ts`, `ruh-backend/src/agentStore.ts`):
   - If the spec chooses a combined save path, add a backend route or transactional helper that updates both metadata and config together.
   - Otherwise, make the frontend sequencing explicit and fail closed when either half of the save contract fails.
   - Ensure returned payloads represent the full saved agent snapshot the UI should continue from.

4. **Drive hot-push from the saved snapshot** (`agent-builder-ui/app/(platform)/agents/create/page.tsx`, `agent-builder-ui/lib/openclaw/agent-config.ts`):
   - Use the persisted agent snapshot for `pushAgentConfig()` so hot-push matches what is stored in the backend.
   - Do not show success or navigate away if the save failed, even if a local hot-push attempt could still run.
   - Surface persistence failures separately from runtime config-apply failures so operators know whether the record, the sandbox, or both need repair.

5. **Docs and flow updates** (`docs/knowledge-base/008-agent-builder-ui.md`, `docs/knowledge-base/specs/SPEC-agent-persistence.md`, `docs/knowledge-base/011-key-flows.md` if needed):
   - Document that Improve Agent persists architect output through the same canonical contract future deploys and release history consume.
   - Remove any implication that editing an agent updates the backend config record when it only changed a transient client snapshot.

#### Test suite

**Frontend unit/store tests** (`agent-builder-ui/`):
- Existing-agent save path calls both metadata and config persistence or the new combined save helper
- Store merge logic preserves updated `skillGraph`, `workflow`, and `agentRules` instead of replacing them with the stale metadata-only response
- Client-only fields such as `model` survive the improved save flow

**Frontend integration/component tests** (`agent-builder-ui/`):
- Editing an existing agent, completing review/configure, and returning to the agents view leaves the local store and refetched backend snapshot aligned
- Save failure in either metadata or config path blocks the success navigation and surfaces an actionable error

**Backend tests** (`ruh-backend/tests/unit/`, `ruh-backend/tests/integration/` as needed):
- If a combined endpoint/helper is added, it persists metadata plus config together and returns the full updated record
- Existing `/api/agents/:id/config` round-trip remains valid for skill graph / workflow / rule updates

**E2E tests** (`agent-builder-ui/e2e/`):
- Improve an existing agent, refresh the page, and verify the updated skills/rules still render from the backend-backed record
- Deploy after an improvement and verify the config push uses the edited skill graph/rules rather than the pre-edit snapshot

#### Evaluation — task is done when
- [ ] Improving an existing agent updates the backend-backed `skill_graph`, `workflow`, and `agent_rules`, not just display metadata
- [ ] Refreshing or reopening the edited agent shows the new architect output from persisted backend state
- [ ] Hot-push and later deploy flows use the saved post-edit snapshot rather than stale pre-edit config
- [ ] Save failures prevent the UI from reporting a successful improvement and leaving backend/client state out of sync
- [ ] Tests cover the existing-agent save path and the persisted-config-after-refresh regression
- [ ] KB/docs describe the Improve Agent persistence contract accurately

### TASK-2026-03-25-38: Make chat exchange persistence backend-owned and atomic
- Status: `active`
- Owner: `unassigned`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `ruh-backend/src/app.ts`, `ruh-backend/src/conversationStore.ts`, `ruh-backend/tests/integration/`, `ruh-backend/tests/e2e/`, `ruh-frontend/components/ChatPanel.tsx`, `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChat.tsx`, `docs/knowledge-base/007-conversation-store.md`, `docs/knowledge-base/011-key-flows.md`, `docs/knowledge-base/specs/`
- Summary: Chat delivery and chat history persistence are currently two unrelated HTTP calls. `POST /api/sandboxes/:sandbox_id/chat` forwards the request to the gateway and returns the response, then both frontends make a second best-effort `POST .../messages` call to persist the user and assistant turns. In `ruh-frontend/components/ChatPanel.tsx`, `saveMessages()` swallows failures; in `agent-builder-ui/.../TabChat.tsx`, `persistMessages()` does the same. That means a user can see a successful agent reply, refresh the page, and discover the exchange never reached history because the follow-up write failed, the tab closed, or the network dropped after the gateway response. This is a core product reliability gap that is not covered by the existing auth, ownership, validation, or conversation-boundary tasks.
- Next step: Start by writing `docs/knowledge-base/specs/SPEC-atomic-chat-persistence.md`, then decide whether `POST /api/sandboxes/:sandbox_id/chat` should persist the exchange itself or whether a new backend-owned send-and-persist endpoint should replace the current split contract.
- Blockers: `None`

#### Why this is important now

- `ruh-backend/src/app.ts` proxies chat completions but never writes the conversation exchange, even when `conversation_id` is present and the backend already resolved the session key.
- `docs/knowledge-base/007-conversation-store.md` explicitly documents that the frontend is responsible for calling `POST .../messages` after each exchange, so the current split is contractual rather than an accidental omission.
- `ruh-frontend/components/ChatPanel.tsx` persists messages only after the stream finishes and ignores persistence failures with `.catch(() => null)`.
- `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChat.tsx` does the same with `persistMessages()`, so both UIs can show a successful reply while silently losing history.
- Upcoming auth, ownership, and validation work hardens who can talk to the backend, but none of those tasks make a successful chat exchange durable once it has already happened.

#### What to build

1. **Feature spec first** (`docs/knowledge-base/specs/SPEC-atomic-chat-persistence.md`):
   - Define the canonical chat contract: when a chat request counts as successfully delivered, when the exchange is persisted, and what happens if gateway success and DB persistence disagree.
   - Decide whether persistence happens inside the existing chat proxy route or behind a new backend-owned endpoint with a clearer request/response contract.
   - Add backlinks in `[[007-conversation-store]]`, `[[004-api-reference]]`, and `[[011-key-flows]]`.

2. **Backend-owned chat persistence path** (`ruh-backend/src/app.ts`, `ruh-backend/src/conversationStore.ts`):
   - Persist user and assistant turns from the backend after a successful non-streaming or streaming chat completion instead of requiring a second client call.
   - Make the write path transactional where practical so `message_count`, `updated_at`, and stored messages stay aligned.
   - Preserve the existing session-key forwarding behavior while preventing duplicate persistence on retries or reconnects.

3. **Streaming finalization contract** (`ruh-backend/src/app.ts`):
   - For streamed chat, buffer the assistant output server-side until the stream completes or reaches a documented terminal condition, then persist the final exchange once.
   - Decide how partial assistant output is handled if the gateway stream terminates early or the client disconnects mid-response.
   - Return a deterministic error or recovery state when persistence fails after the gateway already produced a reply.

4. **Frontend simplification and recovery** (`ruh-frontend/components/ChatPanel.tsx`, `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChat.tsx`):
   - Remove the current best-effort history write dependency from the UIs once the backend contract exists.
   - Keep optimistic local rendering, but refetch or reconcile history using the backend-owned persisted result instead of assuming the second write succeeded.
   - Surface a clear error when the backend reports that a reply was generated but could not be committed to conversation history.

5. **Docs and API alignment** (`docs/knowledge-base/007-conversation-store.md`, `docs/knowledge-base/011-key-flows.md`, `docs/knowledge-base/004-api-reference.md`):
   - Stop documenting frontend-owned persistence once the new contract ships.
   - Document the final durability behavior for chat exchanges, including streamed replies and failure semantics.

#### Test suite

**Backend integration tests** (`ruh-backend/tests/integration/`):
- Successful non-streaming chat persists both user and assistant messages without requiring a separate `/messages` request.
- Successful streaming chat persists the final assistant output once after stream completion.
- Persistence failure after a gateway reply returns the spec-selected error or recovery contract and does not leave `message_count` inconsistent with stored rows.
- Retry or duplicate-submission protections prevent the same logical exchange from being appended twice.

**Backend e2e tests** (`ruh-backend/tests/e2e/`):
- Chat history remains present after page reload because the exchange was persisted by the backend-owned path.
- Client disconnect during streaming follows the documented partial-output behavior rather than silently losing an apparently successful exchange.

**Frontend tests** (`ruh-frontend/__tests__/components/`, `agent-builder-ui/`):
- Chat UIs no longer depend on a second best-effort `/messages` call to make history durable.
- A backend persistence failure is surfaced to the user instead of being silently swallowed while the UI appears successful.

#### Evaluation — task is done when
- [ ] A successful chat exchange becomes durable without relying on a second client-owned `/messages` request
- [ ] Streamed replies are persisted exactly once under a documented terminalization rule
- [ ] Chat history no longer disappears on refresh because the frontend lost the follow-up persistence call
- [ ] `message_count`, stored rows, and conversation ordering remain consistent under success and failure paths
- [ ] Frontends stop swallowing history-write failures as invisible background errors
- [ ] KB/API docs describe the backend-owned chat persistence contract accurately

### TASK-2026-03-25-02: Wire Configure Steps — Tool Connections + Triggers
- Status: `active`
- Owner: `unassigned`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `agent-builder-ui/app/(platform)/agents/create/_components/configure/`, `agent-builder-ui/lib/openclaw/agent-config.ts`, `agent-builder-ui/hooks/use-agents-store.ts`, `ruh-backend/src/app.ts`, `ruh-backend/src/agentStore.ts`
- Summary: The configure wizard steps (StepConnectTools, StepSetTriggers) are currently UI-only — no data from them reaches the backend or sandbox. Tool credentials entered by the user are silently dropped. Cron jobs are parsed from `agentRules` strings via fragile regex. This task makes the configure phase functional end-to-end.
- Next step: Start by defining a `ToolConnection` and `TriggerDefinition` data model in `lib/openclaw/types.ts`, persist them through the agent record, and inject them at deploy time via `configure-agent`.
- Blockers: `None`

#### What to build

1. **Data models** (`lib/openclaw/types.ts`):
   - `ToolConnection { tool_id: string; label: string; credentials: Record<string, string> }`
   - `TriggerDefinition { kind: "cron" | "webhook" | "message"; schedule?: string; message?: string }`

2. **Configure step state** (`ConfigureAgent.tsx`):
   - Thread `toolConnections: ToolConnection[]` and `triggers: TriggerDefinition[]` through the stepper as controlled state
   - `StepConnectTools` writes to `toolConnections`; `StepSetTriggers` writes to `triggers`

3. **Persist to backend** (`use-agents-store.ts`, `agentStore.ts`):
   - Add `tool_connections` and `triggers` columns to the agents table (JSONB)
   - Include them in `saveAgent` / `updateAgent` payloads
   - Include them in `fromBackend` deserialization

4. **Inject at deploy time** (`agent-config.ts`, `app.ts:configure-agent`):
   - `buildSoulContent()` — include tool names in the soul content
   - `buildCronJobs()` — replace regex heuristic with `TriggerDefinition[]` input
   - `configure-agent` endpoint — inject credentials via `openclaw config set <tool>.<key> <value>` inside the container; register triggers via `openclaw cron add`

#### Test suite

**Unit tests** (`ruh-backend/tests/unit/agentStore.test.ts`):
- `saveAgent` with `tool_connections` and `triggers` — verify round-trip through DB
- `configure-agent` handler — mock `dockerExec`, assert `openclaw config set` is called for each credential key
- `buildCronJobs()` — given a `TriggerDefinition[]`, assert correct cron strings are generated

**Integration tests** (`ruh-backend/tests/integration/`):
- `POST /api/agents` with tool_connections → `GET /api/agents/:id` returns them intact
- `POST /api/sandboxes/:id/configure-agent` with credentials → verify `openclaw config set` commands were issued via docker exec spy

**E2E tests** (`agent-builder-ui/e2e/`):
- Walk through create flow, fill in a Slack token in StepConnectTools, complete configure, verify the agent record saved to the backend contains the tool_connection
- Deploy the agent, verify the deploy log shows "Config set: slack.botToken"

#### Evaluation — task is done when
- [ ] Entering a credential in StepConnectTools and completing configure → credential appears in `GET /api/agents/:id` response under `tool_connections`
- [ ] Deploying an agent with a cron trigger → `docker exec openclaw-<id> openclaw cron list --json` shows the job
- [ ] Deploying an agent with a Slack token → `docker exec openclaw-<id> openclaw config get channels.slack.botToken` returns the value
- [ ] All unit + integration tests pass (`bun test` in `ruh-backend`)
- [ ] No regression in existing configure flow (users who skip tool connection still deploy cleanly)

---

### TASK-2026-03-25-03: Pre-Deploy Agent Testing (Test-in-Architect)
- Status: `completed`
- Owner: `Worker-1`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `agent-builder-ui/app/(platform)/agents/create/`, `agent-builder-ui/app/(platform)/agents/create/_components/review/ReviewAgent.tsx`, `agent-builder-ui/app/api/openclaw/route.ts`, `agent-builder-ui/lib/openclaw/api.ts`, `agent-builder-ui/lib/openclaw/agent-config.ts`, `agent-builder-ui/lib/openclaw/test-mode.ts`, `agent-builder-ui/lib/openclaw/api.test.ts`, `agent-builder-ui/lib/openclaw/agent-config.test.ts`, `agent-builder-ui/lib/openclaw/test-mode.test.ts`, `docs/knowledge-base/000-INDEX.md`, `docs/knowledge-base/008-agent-builder-ui.md`, `docs/knowledge-base/011-key-flows.md`, `docs/knowledge-base/specs/`
- Summary: `Completed the first pre-deploy testing slice. The builder now documents and implements a review-phase "Test Agent" chat that forwards `mode: "test"` plus `soul_override` through `/api/openclaw`, rewrites the gateway session key to isolated `agent:test:<session_id>` sessions, injects the generated SOUL prompt ahead of the user message, and surfaces the result in a resettable review drawer without touching the main architect history.`
- Next step: `If this flow needs higher confidence later, add a browser-level E2E or Playwright smoke test that opens Review, sends a sample test prompt, and confirms the panel resets cleanly and the architect chat history stays separate.`
- Blockers: `No code blocker. Full `bunx tsc --noEmit` in `agent-builder-ui` still reports pre-existing failures in `hooks/use-agents-store.test.ts` and `next.config.ts`, but the targeted new unit tests for this task pass.`

#### What to build

1. **Bridge route test mode** (`app/api/openclaw/route.ts`):
   - Accept optional `soul_override: string` in the POST body
   - When present, prepend a `[SYSTEM]: <soul_override>` message block in the `chat.send` payload
   - Use a distinct `sessionKey`: `agent:test:<session_id>` so test sessions don't pollute architect history

2. **Test panel in ReviewAgent** (`ReviewAgent.tsx`):
   - "Test Agent" button that opens an inline chat panel (collapsible drawer at the bottom)
   - Sends messages via `sendToArchitectStreaming()` with `soul_override = buildSoulContent(currentAgentData)`
   - Shows streamed responses in the panel
   - Label: "Testing as [agent name]" so it's clear this is simulated

3. **`sendToArchitectStreaming` test mode** (`lib/openclaw/api.ts`):
   - Add optional `soulOverride?: string` param, forwarded to the bridge

#### Test suite

**Unit tests** (`agent-builder-ui/` — Jest or Vitest):
- Bridge route: given `soul_override`, assert the forwarded `chat.send` params contain the system message prefix
- `buildSoulContent()` — given a `SavedAgent`, assert output contains agent name, skills section, and rules

**E2E tests** (`agent-builder-ui/e2e/`):
- Navigate to review phase for an agent with 2 skills → click "Test Agent" → type "what can you do?" → assert response mentions the agent's skills (not architect behavior)
- Assert test session key (`agent:test:*`) differs from build session key (`agent:architect:*`)

**Manual smoke test checklist:**
- [ ] Test panel response refers to the agent's name, not "architect"
- [ ] Test session does not appear in the main chat message history
- [ ] Closing and reopening the test panel resets the test conversation

#### Evaluation — task is done when
- [ ] "Test Agent" button visible in ReviewAgent and functional
- [ ] Test response references the agent's skills/name derived from the current review state
- [ ] Test session is isolated — does not affect the architect's conversation history
- [ ] Bridge route unit test covering `soul_override` injection passes
- [ ] E2E test `agent-test-mode.spec.ts` passes in `npx playwright test`

---

### TASK-2026-03-25-04: Sandbox Health Dashboard per Deployed Agent
- Status: `completed`
- Owner: `Worker-1`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `agent-builder-ui/app/(platform)/agents/page.tsx`, `agent-builder-ui/app/(platform)/agents/[id]/chat/page.tsx`, `agent-builder-ui/hooks/use-sandbox-health.ts`, `agent-builder-ui/hooks/use-sandbox-health.test.ts`, `ruh-backend/src/app.ts`, `ruh-backend/src/docker.ts`, `ruh-backend/tests/e2e/chatProxy.test.ts`, `docs/knowledge-base/000-INDEX.md`, `docs/knowledge-base/004-api-reference.md`, `docs/knowledge-base/008-agent-builder-ui.md`, `docs/knowledge-base/specs/SPEC-agent-sandbox-health-surface.md`
- Summary: `Completed the bounded deployed-agent health slice. Added [[SPEC-agent-sandbox-health-surface]], taught \`GET /api/sandboxes/:sandbox_id/status\` to always expose explicit runtime \`container_running\` alongside persisted sandbox metadata, and wired the builder agent list plus deployed-agent chat header to a new polling hook that distinguishes running, stopped, unreachable, and loading sandboxes without inferring liveness from DB state alone.`
- Next step: `If sandbox runtime reconciliation work lands later, extend the same status endpoint and UI chips with richer drift categories instead of reintroducing DB-only health guesses.`
- Blockers: `None`

#### What to build

1. **`useSandboxHealth` hook** (`agent-builder-ui/hooks/use-sandbox-health.ts`):
   - Accepts `sandboxIds: string[]`
   - Polls `GET /api/sandboxes/:id/status` for each ID on mount and every 30s
   - Returns `Record<string, "running" | "stopped" | "unreachable" | "loading">`
   - Uses `AbortController` to cancel in-flight requests on unmount

2. **Agent list badges** (`agents/page.tsx`):
   - For agents with `sandboxIds.length > 0`, show a live status dot next to the deployment count
   - Green = all running, Yellow = some unreachable, Red = all stopped

3. **Chat page header** (`agents/[id]/chat/page.tsx`):
   - Show sandbox status chip in the header: "Running · sandbox-abc123" or "Unreachable"
   - If unreachable: show "Redeploy" button linking to `/agents/:id/deploy`

4. **Backend status response** (`app.ts:300` — already exists):
   - Verify `approved` field is returned correctly; add `container_running: boolean` by calling `docker inspect` on the container name

#### Test suite

**Unit tests** (`agent-builder-ui/` — Jest):
- `useSandboxHealth`: mock `fetch`, assert polling interval fires, assert status map updates correctly
- Assert `AbortController.abort()` is called on unmount

**Integration tests** (`ruh-backend/tests/integration/`):
- `GET /api/sandboxes/:id/status` on a stopped container → assert `container_running: false`
- `GET /api/sandboxes/:id/status` on a running container → assert `container_running: true` and `approved: true`

**E2E tests** (`agent-builder-ui/e2e/`):
- Mock the status endpoint to return `{ approved: false }` → assert agent list shows yellow/red dot
- Mock to return `{ approved: true }` → assert green dot

#### Evaluation — task is done when
- [ ] Agent list shows a colored status dot for each agent with deployments, updating every 30s
- [ ] Chat page header shows the sandbox status and "Redeploy" link when unreachable
- [ ] `GET /api/sandboxes/:id/status` returns `container_running` boolean
- [ ] `useSandboxHealth` unmount cancels all in-flight requests (no memory leak)
- [ ] Unit test for `useSandboxHealth` passes
- [ ] Integration test for status endpoint covering stopped + running cases passes

---

### TASK-2026-03-25-05: Real Skill Registry
- Status: `active`
- Owner: `unassigned`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `ruh-backend/src/`, `agent-builder-ui/app/(platform)/agents/create/_components/configure/StepChooseSkills.tsx`, `agent-builder-ui/lib/openclaw/agent-config.ts`, `docs/knowledge-base/`
- Summary: The `configure-agent` endpoint currently writes SKILL.md stubs with placeholder content ("Auto-generated skill."). These give OpenClaw a skill name but no implementation — tool calls, prompts, or instructions. This task builds a skill registry: a catalog of pre-built skill SKILL.md files that the system maps to architect-generated skill IDs at deploy time.
- Next step: Define the registry data model, seed 5–10 initial skills (Slack reader, web scraper, GitHub PR, email sender, HTTP fetch), wire StepChooseSkills to browse the registry, and update `configure-agent` to write real content instead of stubs.
- Blockers: `None`

#### What to build

1. **Registry data model** (`ruh-backend/src/skillRegistry.ts` — new file):
   - `SkillRegistryEntry { skill_id: string; name: string; description: string; tags: string[]; skill_md: string }`
   - Initial seed: 5–10 skills in a static JSON/TS file — `slack-reader`, `web-scraper`, `github-pr-fetcher`, `email-sender`, `http-fetch`, `cron-trigger`, `postgres-query`, `notion-reader`
   - `findSkill(skill_id: string): SkillRegistryEntry | null` — exact match + fuzzy fallback

2. **Registry API** (`ruh-backend/src/app.ts`):
   - `GET /api/skills` — returns full registry list with id, name, description, tags
   - `GET /api/skills/:skill_id` — returns a single entry including `skill_md`

3. **StepChooseSkills enhancement** (`StepChooseSkills.tsx`):
   - Fetch registry from `GET /api/skills` on mount
   - For each architect-generated skill node, show matched registry entry (name, description, tags) vs. "Custom (no registry match)"
   - Allow user to swap a custom skill for a registry skill via dropdown

4. **configure-agent upgrade** (`app.ts:configure-agent`, `agent-config.ts`):
   - For each skill in the deploy payload, look up registry entry
   - If found: write the real `skill_md` content
   - If not found: write current stub + append `# TODO: Implement this skill` comment
   - Log `"Skill <id>: registry match"` vs `"Skill <id>: stub (no registry entry)"` in steps array

#### Test suite

**Unit tests** (`ruh-backend/tests/unit/skillRegistry.test.ts` — new file):
- `findSkill("slack-reader")` → returns the full entry with non-empty `skill_md`
- `findSkill("slack_reader")` → same (underscore/hyphen normalization)
- `findSkill("nonexistent-xyz")` → returns `null`
- `configure-agent` handler: when skill has registry match, assert written content equals registry `skill_md`; when no match, assert stub fallback

**Integration tests**:
- `GET /api/skills` → returns array with at least 5 entries, each with `skill_id`, `name`, `description`
- `GET /api/skills/slack-reader` → returns `skill_md` with non-empty content

**E2E tests** (`agent-builder-ui/e2e/`):
- Create agent with Slack skill → StepChooseSkills shows "slack-reader (registry)" badge
- Deploy → deploy log shows "Skill slack-reader: registry match"
- `docker exec openclaw-<id> cat ~/.openclaw/workspace/skills/slack-reader/SKILL.md` → contains real implementation content (not "Auto-generated skill.")

#### Evaluation — task is done when
- [ ] `GET /api/skills` returns ≥ 5 real skills with populated `skill_md`
- [ ] StepChooseSkills distinguishes registry-matched vs custom skills visually
- [ ] Deploying an agent with a registry skill writes the real SKILL.md content (verified via docker exec)
- [ ] Deploying an agent with a custom skill falls back gracefully to a stub
- [ ] `skillRegistry.test.ts` unit tests all pass
- [ ] `GET /api/skills` integration test passes

---

### TASK-2026-03-25-06: Architect Agent Isolation (Per-Session Pool)
- Status: `active`
- Owner: `unassigned`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `ruh-backend/src/`, `agent-builder-ui/app/api/openclaw/route.ts`, `agent-builder-ui/app/(platform)/agents/create/page.tsx`, `agent-builder-ui/hooks/use-openclaw-chat.ts`
- Summary: All users share one architect sandbox (`OPENCLAW_GATEWAY_URL`). A crash, rate limit, or gateway restart in that single container kills every active build session. Session keys are now per-session (good), but the gateway is still a shared SPOF. This task moves the architect to an on-demand pool: spin up an architect sandbox at session start, tear it down at session end.
- Next step: Add `POST /api/architect/session` to the backend that creates (or reserves from a warm pool) an architect sandbox and returns its gateway URL + token. The create page calls this on mount and tears down on unmount. The bridge route uses the session-specific gateway URL instead of the global env var.
- Blockers: `None — builds on existing sandbox creation infrastructure`

#### What to build

1. **Architect session endpoints** (`ruh-backend/src/app.ts`):
   - `POST /api/architect/session` — spins up a new sandbox (or pulls from warm pool), tags it as `type: "architect"`, returns `{ session_id, gateway_url, gateway_token, sandbox_id }`
   - `DELETE /api/architect/session/:session_id` — tears down the assigned sandbox
   - Warm pool: maintain up to `ARCHITECT_POOL_SIZE` (default: 2) pre-warmed architect containers; `POST` draws from pool if available, else spins a new one async

2. **Architect SOUL.md** (`ruh-backend/src/`):
   - When creating an architect sandbox, after `configure-agent` writes files, push an architect-specific SOUL.md that defines its role as an agent designer
   - Parameterize SOUL.md content via a template (`src/architectSoul.ts`)

3. **Create page session management** (`agents/create/page.tsx`):
   - On mount: `POST /api/architect/session` → store `{ gateway_url, gateway_token, session_id }` in component state
   - On unmount / navigate away: `DELETE /api/architect/session/:session_id`
   - While session is provisioning: show a "Preparing your session..." loading state instead of the chat input

4. **Bridge route dynamic gateway** (`app/api/openclaw/route.ts`):
   - Accept optional `gateway_url` and `gateway_token` in the POST body
   - When present, use them instead of `OPENCLAW_GATEWAY_URL` / `OPENCLAW_GATEWAY_TOKEN`
   - Fall back to env vars if not provided (preserves backward compatibility)

5. **`useOpenClawChat` hook update** (`hooks/use-openclaw-chat.ts`):
   - Store `architectSession: { gateway_url, gateway_token, session_id } | null` in state (not persisted)
   - Pass to `sendToArchitectStreaming()` which forwards to the bridge

#### Test suite

**Unit tests** (`ruh-backend/tests/unit/`):
- `POST /api/architect/session` when pool has a warm sandbox: assert it returns immediately with the warm sandbox's URL/token and removes it from the pool
- `POST /api/architect/session` when pool is empty: assert it starts creation and returns a pending session
- `DELETE /api/architect/session/:id`: assert it calls `stopAndRemoveContainer`

**Integration tests** (`ruh-backend/tests/integration/`):
- Full round-trip: `POST /api/architect/session` → assert sandbox record exists in DB with `type: "architect"` → `DELETE` → assert sandbox record removed
- Pool replenishment: after drawing from pool, assert pool count recovers to `ARCHITECT_POOL_SIZE` within N seconds

**E2E tests** (`agent-builder-ui/e2e/`):
- Navigate to `/agents/create` → assert network request to `POST /api/architect/session` fires on mount
- Navigate away → assert `DELETE /api/architect/session/:id` fires
- Kill the architect sandbox mid-conversation → assert the UI shows reconnect/retry UI (not a blank error)

**Load test** (manual / script):
- Open 5 concurrent create sessions → assert each gets a distinct `gateway_url` → no session bleeds into another

#### Evaluation — task is done when
- [ ] Two concurrent `/agents/create` sessions each use a distinct gateway URL (confirmed via network tab or logs)
- [ ] Navigating away from create page triggers session teardown (sandbox removed from `docker ps`)
- [ ] If the assigned architect sandbox crashes, the UI shows a recoverable error with a retry option (not a silent hang)
- [ ] Warm pool pre-warms `ARCHITECT_POOL_SIZE` containers on backend startup
- [ ] Session endpoint unit tests pass
- [ ] `POST /api/architect/session` → `DELETE` integration round-trip test passes
- [ ] Global `OPENCLAW_GATEWAY_URL` env var still works as fallback when pool is disabled (backward compat)

---

### TASK-2026-03-25-07: Agent Release History + Safe Rollback
- Status: `active`
- Owner: `unassigned`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `ruh-backend/src/app.ts`, `ruh-backend/src/agentStore.ts`, `ruh-backend/src/agentReleaseStore.ts`, `agent-builder-ui/lib/openclaw/agent-config.ts`, `agent-builder-ui/app/(platform)/agents/[id]/deploy/page.tsx`, `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabMissionControl.tsx`, `docs/knowledge-base/`
- Summary: Deployments and hot-pushes currently mutate live sandboxes with no persisted release record. The product stores only `agent.sandboxIds`, so there is no way to answer which SOUL/skills/rules version is running in a sandbox, compare releases, or roll back after a bad update. This task adds first-class deployment revisions so agent operations become recoverable instead of write-only.
- Next step: Start by defining an `agent_releases` table plus a deterministic config snapshot payload generated from `buildSoulContent()` / skill graph / triggers, then make both deploy and Mission Control "Push Config Update" create a release record before applying it to the sandbox.
- Blockers: `None`

#### Why this is important now

- The deploy flow streams logs and then only persists the new `sandbox_id` on the agent record.
- Mission Control can push config updates directly to a running sandbox, but those updates are not versioned or auditable.
- As soon as agents have multiple deployments, health polling, and real tool credentials, the lack of release history becomes the main recovery and debugging gap.

#### What to build

1. **Release data model** (`ruh-backend/src/agentReleaseStore.ts` — new file):
   - `AgentReleaseRecord { id, agent_id, sandbox_id, release_number, trigger_source, config_snapshot, apply_status, apply_logs, created_at }`
   - `config_snapshot` should store the exact deploy payload shape: `system_name`, `soul_content`, `skills[]`, `cron_jobs[]`, plus future-safe metadata fields
   - Add `current_release_id` to the `agents` table so the latest successful release is queryable without scanning history

2. **Deterministic snapshot builder** (`agent-builder-ui/lib/openclaw/agent-config.ts` or shared backend helper):
   - Extract a pure `buildAgentConfigSnapshot(agent)` helper that returns the exact payload later sent to `POST /api/sandboxes/:sandbox_id/configure-agent`
   - Ensure the same snapshot is used for first deploy and later hot-pushes so releases are comparable

3. **Release APIs** (`ruh-backend/src/app.ts`):
   - `GET /api/agents/:id/releases` — list releases newest first
   - `GET /api/agents/:id/releases/:release_id` — fetch one release with full snapshot + logs
   - `POST /api/agents/:id/releases/:release_id/apply` — re-apply a historical release to a target sandbox
   - Persist a release record whenever deploy or config push happens, with `apply_status = pending|applied|failed`

4. **Deploy / hot-push integration** (`deploy/page.tsx`, `TabMissionControl.tsx`):
   - Before `pushAgentConfig`, create a release record and attach the target sandbox ID
   - After the backend apply finishes, update the release status and logs shown in the UI
   - Replace the blind "Config updated" success badge with "Release vN applied"

5. **Release history UI** (`TabMissionControl.tsx`):
   - Add a "Release History" section listing release number, applied time, target sandbox, and status
   - Provide actions: "View config", "Copy release ID", and "Rollback"
   - Rollback should call the release apply endpoint and stream the returned logs into the existing Mission Control status area

#### Test suite

**Unit tests** (`ruh-backend/tests/unit/agentReleaseStore.test.ts` — new file):
- `createRelease()` stores the full config snapshot and increments `release_number` per agent
- `markReleaseApplied()` updates `current_release_id` on the parent agent
- `markReleaseFailed()` preserves logs for postmortem debugging
- `buildAgentConfigSnapshot()` returns stable output for the same agent input

**Integration tests** (`ruh-backend/tests/integration/`):
- Deploy path: create agent → create sandbox → create release → apply to sandbox → assert release stored with `apply_status: "applied"`
- Rollback path: create two releases, apply v2, then apply v1 to same sandbox → assert v1 becomes the latest applied release
- `GET /api/agents/:id/releases` returns releases in descending order with sandbox IDs and statuses

**E2E tests** (`agent-builder-ui/e2e/`):
- Deploy an agent → Mission Control shows `Release v1`
- Push a config update from Mission Control → `Release v2 applied` appears and history length increments
- Click rollback on `Release v1` → UI shows rollback progress and the release list marks v1 as the current release again

#### Evaluation — task is done when
- [ ] Every deploy creates a persisted release record with the exact applied config snapshot
- [ ] Every Mission Control hot-push creates a new release record instead of mutating the sandbox invisibly
- [ ] Mission Control shows release history with status, sandbox target, and timestamps
- [ ] A previous release can be re-applied to a running sandbox from the UI
- [ ] `agents.current_release_id` points to the latest successfully applied release
- [ ] Release unit + integration tests pass

---

### TASK-2026-03-25-08: Re-enable Agent Builder Authentication Gate
- Status: `active`
- Owner: `unassigned`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `agent-builder-ui/middleware.ts`, `agent-builder-ui/components/auth/SessionInitializationWrapper.tsx`, `agent-builder-ui/services/authCookies.ts`, `agent-builder-ui/services/axios.ts`, `agent-builder-ui/app/(auth)/`, `agent-builder-ui/app/(platform)/`, `docs/knowledge-base/`
- Summary: `agent-builder-ui` currently bypasses auth for every route because `middleware.ts` returns `NextResponse.next()` immediately. The app already has login, token refresh, and user bootstrap plumbing, but none of it prevents anonymous access to `/agents`, `/agents/create`, or deployed-agent controls. This task turns the existing auth pieces back into an actual access gate and hardens the session bootstrap so the UI fails closed instead of rendering protected pages before redirecting.
- Next step: Start in `agent-builder-ui/middleware.ts` by removing the unconditional early return, preserving `/authenticate` as public, and verifying unauthenticated requests to `/agents` redirect to `/authenticate?redirect_url=...`.
- Blockers: `None`

#### Why this is important now

- The KB explicitly documents auth as disabled in [[001-architecture]] and [[008-agent-builder-ui]].
- The product exposes agent creation, deployment, and live sandbox controls; leaving those routes open is a larger product risk than the current UX and observability gaps.
- The codebase already contains most of the auth plumbing (`/authenticate`, token refresh, user bootstrap, logout), so this is a high-leverage feature rather than a greenfield auth build.

#### What to build

1. **Route protection in Next middleware** (`agent-builder-ui/middleware.ts`):
   - Remove the unconditional `return NextResponse.next()`
   - Keep `/authenticate` public
   - Redirect all other app routes to `/authenticate` when both `accessToken` and `refreshToken` cookies are missing
   - Preserve `redirect_url` so users return to the intended page after login

2. **Fail-closed session bootstrap** (`components/auth/SessionInitializationWrapper.tsx`):
   - When no valid token pair exists after hydration, clear stale user state and redirect to `/authenticate` for protected routes instead of rendering the platform shell
   - When user bootstrap (`/users/me`) fails with auth errors, clear session state and redirect cleanly
   - Prevent the current flash where protected UI can render before auth state settles

3. **Cookie + token handling cleanup** (`services/authCookies.ts`, `services/axios.ts`):
   - Make cookie read/write semantics consistent for set vs clear paths
   - Ensure logout and token-refresh failure fully clear both cookies and Zustand user state
   - Keep the existing refresh-token flow working without redirect loops or repeated failed retries

4. **Auth UX polish** (`app/(auth)/`, `app/(platform)/`):
   - Preserve existing login redirect behavior from `AuthButton`
   - Ensure hitting `/authenticate` with valid tokens routes users back into the platform instead of leaving them stranded on the login screen
   - Show a deterministic loading state while auth/session initialization is in progress

5. **Knowledge-base update** (`docs/knowledge-base/001-architecture.md`, `docs/knowledge-base/008-agent-builder-ui.md`, spec if needed):
   - Remove the stale statement that auth is disabled once the feature ships
   - Document the protected-route flow and redirect behavior

#### Test suite

**Unit tests** (`agent-builder-ui/`):
- `middleware.ts`: unauthenticated request to `/agents` redirects to `/authenticate` with `redirect_url`
- `middleware.ts`: request to `/authenticate` remains public
- `SessionInitializationWrapper`: missing tokens or `/users/me` auth failure clears user state and triggers redirect
- `axios` auth handling: token-refresh failure clears cookies/store once and does not loop infinitely

**E2E tests** (`agent-builder-ui/e2e/`):
- Visiting `/agents` without auth cookies redirects to `/authenticate`
- Visiting `/agents/create` with valid auth cookies loads the page normally
- Expired access token + valid refresh token triggers refresh and recovers the original request
- Expired access token + invalid refresh token sends the user back to `/authenticate`

**Manual smoke test checklist:**
- [ ] Open `/agents` in a clean browser session -> redirected to `/authenticate`
- [ ] Log in -> redirected back to the original deep link (for example `/agents/create`)
- [ ] Delete cookies while on a protected page -> next protected request logs out cleanly
- [ ] Refresh on `/agents/[id]/chat` with a valid session -> page stays accessible

#### Evaluation — task is done when
- [ ] Anonymous access to `/agents`, `/agents/create`, and deployed-agent pages is blocked
- [ ] Redirects preserve the original target route through the login flow
- [ ] Auth bootstrap no longer flashes protected UI before redirecting
- [ ] Token refresh failures clear local auth state and end on `/authenticate`
- [ ] Middleware + session bootstrap tests pass
- [ ] KB notes no longer describe auth as disabled

---

### TASK-2026-03-25-24: Authenticate Agent Builder Bridge API
- Status: `active`
- Owner: `Worker-1`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `agent-builder-ui/app/api/openclaw/route.ts`, `agent-builder-ui/lib/openclaw/api.ts`, `agent-builder-ui/services/authCookies.ts`, `agent-builder-ui/services/axios.ts`, `agent-builder-ui/e2e/`, `docs/knowledge-base/001-architecture.md`, `docs/knowledge-base/008-agent-builder-ui.md`, `docs/knowledge-base/specs/`
- Summary: `agent-builder-ui` exposes `/api/openclaw` as a server-side proxy to the shared architect gateway with the server-held `OPENCLAW_GATEWAY_TOKEN`, but the route performs no caller authentication of its own. Because `middleware.ts` explicitly excludes `/api/*`, even TASK-2026-03-25-08 would still leave this bridge callable by anonymous clients who can spend the shared architect capacity, trigger gateway-side tool execution, and exercise the `operator.write` session without ever loading a protected page.
- Next step: Start by writing `docs/knowledge-base/specs/SPEC-agent-builder-bridge-auth.md`, then add route-level auth enforcement in `agent-builder-ui/app/api/openclaw/route.ts` before any WebSocket connection is opened.
- Blockers: `None. This complements TASK-2026-03-25-08 and TASK-2026-03-25-14, but it is a separate server-side boundary and should not wait for page auth.`

#### Why this is important now

- `agent-builder-ui/app/api/openclaw/route.ts` accepts any JSON POST with `session_id` and `message`, then immediately connects to the architect gateway using the server-only `OPENCLAW_GATEWAY_TOKEN`.
- `agent-builder-ui/lib/openclaw/api.ts` calls `/api/openclaw` with a bare `fetch` and no auth header, so the bridge currently relies entirely on route reachability rather than caller identity.
- `agent-builder-ui/middleware.ts` excludes `/api/*` from its matcher, so re-enabling page redirects alone will not protect the bridge route.
- The bridge also auto-approves execution requests today (covered separately by TASK-2026-03-25-14), which makes anonymous access to this route materially worse than a simple read-only leak.
- None of the existing backlog items explicitly harden the BFF route itself against direct unauthenticated POSTs, invalid sessions, or cross-site invocation.

#### What to build

1. **Feature spec first** (`docs/knowledge-base/specs/SPEC-agent-builder-bridge-auth.md`):
   - Define who is allowed to call `/api/openclaw`, which credentials prove that identity, and what HTTP status the route returns for missing, expired, or invalid sessions.
   - Decide whether the route trusts access-token cookies, a bearer token forwarded from the browser, or a Next server-side session check backed by the existing Ruh auth APIs.
   - Document same-origin / CSRF protections for this cookie-backed POST route and add backlinks in `[[001-architecture]]` and `[[008-agent-builder-ui]]`.

2. **Route-level auth enforcement** (`agent-builder-ui/app/api/openclaw/route.ts`):
   - Reject unauthenticated callers before any WebSocket handshake or retry loop begins.
   - Reuse the existing auth primitives where possible instead of inventing a parallel session model.
   - Fail closed if auth configuration is missing or if the caller cannot be validated.
   - Include a small structured error payload so the client can distinguish auth failures from gateway failures.

3. **Origin / request-integrity guard** (`agent-builder-ui/app/api/openclaw/route.ts`, auth helpers if needed):
   - Enforce a same-origin contract for browser callers so cookie-backed auth is not enough on its own.
   - Validate `Origin` / `Host` or adopt an explicit anti-CSRF header/token pattern that the browser client can send.
   - Keep the policy documented and deterministic for local development and preview deployments.

4. **Client wiring and failure handling** (`agent-builder-ui/lib/openclaw/api.ts`, related create-page state):
   - Preserve the existing happy-path streaming contract for authenticated sessions.
   - Surface `401` / `403` bridge responses distinctly so the UI can redirect to login or show a session-expired state instead of reporting a fake gateway outage.
   - Ensure retries in the client do not mask server-side auth failures as network flakiness.

5. **Docs and contract update** (`docs/knowledge-base/001-architecture.md`, `docs/knowledge-base/008-agent-builder-ui.md`, API/spec notes):
   - Update the KB so the architect bridge is described as an authenticated backend-for-frontend route, not an implicitly open proxy.
   - Cross-link the bridge-auth spec to TASK-2026-03-25-08 (page auth) and TASK-2026-03-25-14 (approval policy) so future work keeps the layers distinct.

#### Test suite

**Route / unit tests** (`agent-builder-ui/`):
- `POST /api/openclaw` without valid session credentials returns `401` and never constructs a WebSocket client
- Invalid or expired credentials return `401`/`403` with a structured auth error payload
- Requests with a disallowed `Origin` are rejected before the gateway handshake begins
- Authenticated requests still stream status/result events successfully

**Frontend tests** (`agent-builder-ui/`):
- `sendToArchitectStreaming()` surfaces bridge auth failures as auth/session errors rather than generic gateway failures
- Session-expired behavior clears stale create-flow state or redirects consistently instead of leaving the chat spinner running

**E2E tests** (`agent-builder-ui/e2e/`):
- Anonymous browser or direct route call to `/api/openclaw` is blocked
- Authenticated user can still open the create flow and receive architect responses normally
- Expired session while on the create page causes the next architect message to fail cleanly and send the user back through the auth path

#### Evaluation — task is done when
- [ ] `/api/openclaw` no longer proxies architect sessions for anonymous callers
- [ ] Route auth failures are distinguished from gateway connectivity failures in the UI and logs
- [ ] Same-origin / CSRF protections are documented and enforced for the cookie-backed bridge route
- [ ] Authenticated create-flow sessions still work end-to-end after the route hardening change
- [ ] Tests cover unauthenticated, invalid-session, invalid-origin, and authenticated-success cases
- [ ] KB/spec docs describe the bridge as an authenticated BFF boundary

---

### TASK-2026-03-25-28: Harden Agent Builder Session Token Storage
- Status: `active`
- Owner: `Worker-1`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `agent-builder-ui/services/authCookies.ts`, `agent-builder-ui/components/auth/SessionInitializationWrapper.tsx`, `agent-builder-ui/hooks/use-user.ts`, `agent-builder-ui/services/axios.ts`, `agent-builder-ui/app/api/auth.ts`, `agent-builder-ui/middleware.ts`, `docs/knowledge-base/008-agent-builder-ui.md`, `docs/knowledge-base/specs/`
- Summary: Claimed the task and completed its first bounded deliverable: a new KB spec now defines the intended cookie/session contract for `agent-builder-ui`, including `HttpOnly` token cookies, removal of token persistence from Zustand/localStorage, a same-origin BFF pattern for authenticated browser calls, and the prerequisite relationship to page-auth and bridge-auth hardening. Production code has not changed yet; the repo now has a written contract to implement against instead of extending the current JS-readable token model.
- Next step: Implement the spec in `agent-builder-ui` by hardening `authCookies.ts`, removing `accessToken` from persisted client state, and replacing JS-token-dependent request paths with server-owned session propagation.
- Blockers: `None, but this should be treated as a prerequisite design decision for TASK-2026-03-25-08 and TASK-2026-03-25-24 so those tasks do not cement a browser-readable token model.`

#### Why this is important now

- `agent-builder-ui/services/authCookies.ts` sets both `accessToken` and `refreshToken` with `httpOnly: false`, so any client-side script can read both tokens directly.
- `agent-builder-ui/components/auth/SessionInitializationWrapper.tsx` reads the current token and persists it into `useUserStore`, whose `persist` middleware stores that session data under `user-session-storage`.
- `agent-builder-ui/app/api/auth.ts` refreshes the access token and then writes the fresh token back into the persisted user store, keeping the JS-readable token surface alive across refreshes.
- Existing auth tasks focus on route gating, bridge authentication, and backend protection. None of them currently remove the token-exfiltration path itself, so shipping those tasks alone would still leave the authenticated session easy to steal from any XSS foothold.

#### What to build

1. **Feature spec first** (`docs/knowledge-base/specs/SPEC-agent-builder-session-token-hardening.md`):
   - Define the browser/session contract for `agent-builder-ui`: which cookies exist, which are `HttpOnly`, what `SameSite` policy is required, and how middleware, bridge auth, and refresh flow validate the current session without exposing raw tokens to browser JS.
   - Document how this contract composes with TASK-2026-03-25-08 (page auth), TASK-2026-03-25-24 (bridge auth), and TASK-2026-03-25-09 (backend auth).
   - Add backlinks in `[[008-agent-builder-ui]]`, `[[001-architecture]]`, and any new auth spec touched by the final design.

2. **Harden cookie handling** (`agent-builder-ui/services/authCookies.ts`, auth route/helpers as needed):
   - Stop setting auth cookies as JS-readable values; move to `httpOnly: true` and the narrowest viable `sameSite` policy for the deployed app.
   - Ensure clear paths use the same cookie attributes as set paths so logout and refresh failure really remove the cookies.
   - Fail closed if the required cookie/session configuration is missing.

3. **Remove token persistence from client state** (`agent-builder-ui/hooks/use-user.ts`, `agent-builder-ui/components/auth/SessionInitializationWrapper.tsx`, `agent-builder-ui/app/api/auth.ts`):
   - Remove `accessToken` from the persisted user store shape.
   - Stop copying tokens into Zustand/localStorage during bootstrap or refresh.
   - Keep only non-secret user profile data in persisted client state.

4. **Replace JS-token-dependent request paths** (`agent-builder-ui/services/axios.ts`, middleware/route helpers, BFF endpoints if needed):
   - Rework the current request flow so protected calls do not rely on browser JS reading `accessToken` / `refreshToken` directly.
   - Prefer server-side session validation or same-origin route handlers for operations that need bearer propagation.
   - Keep bridge auth and page auth compatible with an `HttpOnly` cookie model instead of introducing a parallel exposed token cache.

5. **Docs and regression coverage** (`docs/knowledge-base/008-agent-builder-ui.md`, tests):
   - Update the KB so it no longer implies the builder auth session depends on browser-readable tokens.
   - Add explicit regression tests that prove tokens are absent from normal JS-visible storage while protected flows still work.

#### Test suite

**Unit / route tests** (`agent-builder-ui/`):
- `authCookies` sets auth cookies with the hardened attributes and clears them with matching attributes
- `SessionInitializationWrapper` no longer writes access tokens into the persisted user store
- `authApi.generateAccessToken()` or its replacement refresh path preserves session behavior without rehydrating a token into Zustand/localStorage
- Middleware / route auth logic still recognizes a valid session when browser JS cannot read the cookies

**Security / integration tests** (`agent-builder-ui/`):
- Browser-side auth bootstrap works without reading `accessToken` or `refreshToken` from JS-visible cookies
- Protected bridge or BFF calls still succeed for authenticated sessions and fail cleanly after logout/expiry
- Logout and invalid-refresh flows remove the hardened cookies and clear persisted non-secret user state

**E2E tests** (`agent-builder-ui/e2e/`):
- After login, `document.cookie` does not expose `accessToken` or `refreshToken`
- Reloading the app does not restore an access token from localStorage/Zustand
- Visiting `/agents` with a valid session still works, and expired-session flows still redirect cleanly to `/authenticate`
- Architect bridge usage remains functional after the token-hardening change

#### Evaluation — task is done when
- [ ] `accessToken` and `refreshToken` are no longer readable from browser JavaScript in the normal app flow
- [ ] Persisted frontend state no longer stores raw auth tokens
- [ ] Page auth, bridge auth, and refresh/logout behavior still work with the hardened session contract
- [ ] Tests explicitly cover token absence from JS-visible storage plus authenticated happy-path behavior
- [ ] KB/spec docs describe the hardened session model and its relationship to the broader auth tasks

---

### TASK-2026-03-25-09: Protect Backend Control-Plane API
- Status: `active`
- Owner: `unassigned`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `ruh-backend/src/app.ts`, `ruh-backend/src/requestAuth.ts`, `ruh-backend/tests/security/`, `ruh-backend/tests/integration/`, `ruh-frontend/`, `agent-builder-ui/`, `.env.example`, `docs/knowledge-base/`
- Summary: `ruh-backend` currently exposes every control-plane route under `/api/*` with no server-side auth. The shipped `docker-compose` + `nginx` stack serves `ruh-frontend`, and that UI calls the backend directly from the browser with raw `fetch`. Even `agent-builder-ui` largely bypasses its own authenticated axios client for agent and sandbox operations. This task adds an actual auth boundary around the backend and updates first-party clients so direct anonymous API access is no longer possible.
- Next step: Start by writing `docs/knowledge-base/specs/SPEC-control-plane-api-auth.md`, then add backend auth middleware in `ruh-backend/src/app.ts` that protects `/api/*` (except `OPTIONS` and `/health`) using an env-configured Ruh user-info or introspection endpoint to validate bearer tokens.
- Blockers: `None`

#### Why this is important now

- `ruh-backend/src/app.ts` registers every `/api/*` route without any auth middleware, so control-plane actions are currently guarded only by network reachability.
- `nginx/nginx.conf` publicly proxies `/api/*` to the backend, and `docker-compose.yml` ships that path in front of `ruh-frontend`.
- `ruh-frontend` calls `/api/sandboxes*`, `/api/*/crons*`, `/api/*/channels*`, and chat endpoints directly from client components with no auth headers.
- `agent-builder-ui/services/axios.ts` already knows how to attach an access token, but high-value flows such as `use-agents-store.ts`, deploy, and chat/config tabs mostly use raw `fetch`, so a future UI auth gate alone would still leave the backend weakly defended.

#### What to build

1. **Feature spec first** (`docs/knowledge-base/specs/SPEC-control-plane-api-auth.md`):
   - Define which routes remain public (`GET /health` and CORS preflight only unless a concrete exception is justified)
   - Document token source, validation flow, failure modes, local-dev behavior, and rollout order
   - Add backlinks in `[[001-architecture]]`, `[[004-api-reference]]`, `[[009-ruh-frontend]]`, and `[[010-deployment]]`

2. **Backend request auth module** (`ruh-backend/src/requestAuth.ts` — new file):
   - Parse `Authorization: Bearer <token>`
   - Validate the bearer token against an env-configured Ruh identity endpoint instead of assuming a JWT format the repo does not document today
   - Cache successful validations briefly so polling and chat flows do not call the auth service on every request
   - Expose normalized caller context (user ID, email, org if available) for downstream handlers and audit logging

3. **Global auth middleware** (`ruh-backend/src/app.ts`):
   - Require authenticated callers for every `/api/*` route before any sandbox or agent handler runs
   - Return consistent `401` / `403` JSON errors
   - Let `OPTIONS` requests through for CORS and keep `/health` public
   - Include caller identity in logs for destructive operations such as sandbox delete, configure-agent, cron mutation, and channel updates

4. **First-party client propagation** (`ruh-frontend/`, `agent-builder-ui/`):
   - Replace raw backend `fetch` usage with a shared authenticated client
   - For `agent-builder-ui`, stop bypassing `services/axios.ts` in `hooks/use-agents-store.ts`, deploy flow, and chat/config tabs
   - For `ruh-frontend`, add the same bearer-token propagation pattern or move backend access behind authenticated Next route handlers; do not leave direct anonymous browser calls in place

5. **Deployment + DX** (`.env.example`, frontend env examples, `docs/knowledge-base/010-deployment.md`):
   - Add the auth-validation environment variables required by the backend
   - Document how local development obtains a valid token and how to exercise protected routes in tests
   - Keep the production path fail-closed: missing auth config should not silently expose `/api/*`

#### Test suite

**Backend security tests** (`ruh-backend/tests/security/`):
- Missing `Authorization` on `POST /api/sandboxes/create` returns `401`
- Invalid bearer token returns `401` without leaking upstream auth details
- Valid bearer token can hit a representative read endpoint and a representative write endpoint
- `OPTIONS` preflight still succeeds for allowed origins

**Backend integration tests** (`ruh-backend/tests/integration/`):
- Auth middleware blocks sandbox and agent mutations before handlers execute
- Validated caller context is available inside route handlers after auth succeeds
- Validation caching avoids repeated auth-service round-trips during bursty polling or chat traffic

**Frontend tests**:
- `ruh-frontend`: sandbox list/create/delete and cron/channel actions include auth and fail cleanly when credentials are absent or expired
- `agent-builder-ui`: `use-agents-store`, deploy flow, and chat/config tabs continue working against an authenticated backend
- E2E: anonymous browser session cannot create or mutate backend resources; authenticated session still can

#### Evaluation — task is done when
- [ ] Anonymous requests to `/api/agents*`, `/api/sandboxes*`, `/api/*/crons*`, and `/api/*/channels*` are rejected server-side
- [ ] The shipped `nginx` -> `ruh-backend` path no longer exposes an open control plane
- [ ] `ruh-frontend` and `agent-builder-ui` both work against the protected backend without raw anonymous `fetch` regressions
- [ ] Security tests cover missing, invalid, and valid bearer-token cases
- [ ] KB/docs describe the new auth boundary and no longer imply that backend control-plane APIs are public

---

### TASK-2026-03-25-10: Per-User Ownership and Access Scoping
- Status: `active`
- Owner: `unassigned`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `ruh-backend/src/agentStore.ts`, `ruh-backend/src/store.ts`, `ruh-backend/src/conversationStore.ts`, `ruh-backend/src/app.ts`, `ruh-backend/tests/integration/`, `ruh-backend/tests/security/`, `agent-builder-ui/hooks/use-agents-store.ts`, `ruh-frontend/`, `docs/knowledge-base/`
- Summary: Agents, sandboxes, and conversations are currently stored as global records with no owner or workspace identity. Once the auth tasks land, every authenticated user would still be able to list and mutate every other user's resources. This task adds first-class ownership fields and request-scoped filtering so the product becomes safely multi-user instead of globally shared.
- Next step: Start by writing `docs/knowledge-base/specs/SPEC-resource-ownership-scoping.md`, then extend the data model with owner identity fields (`owner_user_id`, plus workspace/org identifier if the auth payload provides one) and thread authenticated caller context into every agent + sandbox list/get/mutate path.
- Blockers: `Depends on TASK-2026-03-25-09 for validated caller identity in backend requests, but the spec, schema design, and store-level filtering can be prepared in parallel.`

#### Why this is important now

- `ruh-backend/src/agentStore.ts` defines the `agents` table without any `owner_*` fields and `listAgents()` returns the full table ordered by `created_at DESC`.
- `ruh-backend/src/store.ts` and `conversationStore.ts` follow the same global-record pattern for sandboxes and conversations.
- `agent-builder-ui/hooks/use-agents-store.ts` calls `GET /api/agents` and assumes the backend result set is the current user's whole world.
- The new auth tasks will authenticate callers, but without ownership scoping they will only prove *who* the caller is, not restrict *what* they can see or mutate.

#### What to build

1. **Feature spec first** (`docs/knowledge-base/specs/SPEC-resource-ownership-scoping.md`):
   - Define the ownership model for `agents`, `sandboxes`, and `conversations`
   - Decide whether scoping is user-only or user + workspace/org from the auth context
   - Document migration behavior for existing rows that currently have no owner
   - Add backlinks in `[[001-architecture]]`, `[[004-api-reference]]`, `[[005-data-models]]`, `[[007-conversation-store]]`, `[[008-agent-builder-ui]]`, and `[[009-ruh-frontend]]`

2. **Schema + store changes** (`ruh-backend/src/agentStore.ts`, `ruh-backend/src/store.ts`, `ruh-backend/src/conversationStore.ts`):
   - Add ownership fields to persisted tables:
     - `agents.owner_user_id` and optional `owner_workspace_id`
     - `sandboxes.owner_user_id` and optional `owner_workspace_id`
     - `conversations.owner_user_id` and optional `owner_workspace_id`
   - Add indexes on owner fields so scoped list queries stay cheap
   - Update create/save methods to require caller context and stamp ownership on new rows
   - Replace global `list*()` and `get*()` behavior with scoped variants that only return rows owned by the caller

3. **Route authorization layer** (`ruh-backend/src/app.ts`):
   - Use the caller identity produced by the backend auth middleware to gate every agent, sandbox, and conversation route
   - Return `404` for resources outside the caller's scope instead of leaking existence
   - Ensure nested routes (`/api/agents/:id/sandbox`, `/api/sandboxes/:id/chat`, `/api/sandboxes/:id/conversations/:id/messages`, cron/channel/config endpoints) all enforce ownership before work begins

4. **Frontend contract updates** (`agent-builder-ui/`, `ruh-frontend/`):
   - Keep the existing frontend API shape, but handle empty scoped lists as "your resources" rather than a global system view
   - Add explicit empty states for first-time users after scoping lands
   - Make sure optimistic updates and local caches do not merge another user's records after auth refresh or session switch

5. **Migration + compatibility plan** (`ruh-backend/src/`, docs):
   - Define one-time migration behavior for existing local-dev rows with no owner yet
   - Prefer a deterministic backfill strategy for development environments; do not leave permanent NULL-owner rows that bypass scope checks
   - Document how admin/debug access should work if operators need cross-user visibility later; do not silently build an untracked backdoor into normal routes

#### Test suite

**Backend integration tests** (`ruh-backend/tests/integration/`):
- User A creates an agent/sandbox/conversation; User B cannot list or fetch those resources
- Nested resource access is scoped correctly: User B cannot post chat messages to User A's sandbox or append to User A's conversation
- Scoped list endpoints return only the caller's resources, even when mixed-owner rows exist in the database
- Existing unowned rows are either backfilled or rejected according to the migration plan

**Backend security tests** (`ruh-backend/tests/security/`):
- Cross-user access attempts to `GET`, `PATCH`, `DELETE`, and action endpoints return `404`/`403` without leaking resource existence
- Route handlers do not execute destructive operations when ownership checks fail
- Authenticated caller context is required by persistence helpers for create/update flows

**Frontend tests**:
- `agent-builder-ui`: switching users yields a different `/api/agents` result set and clears stale local records from the previous session
- `ruh-frontend`: sandbox sidebar only shows the current user's sandboxes and handles an empty state cleanly
- E2E: two seeded users see isolated agents/sandboxes and cannot deep-link into one another's resources

#### Evaluation — task is done when
- [ ] Agents, sandboxes, and conversations persist owner identity on creation
- [ ] List and fetch APIs are scoped to the authenticated caller by default
- [ ] A user cannot chat with, reconfigure, or delete another user's sandbox by guessing its ID
- [ ] `agent-builder-ui` and `ruh-frontend` both show only caller-owned resources after a fresh login
- [ ] Cross-user access tests cover list, read, mutate, and nested-action routes
- [ ] KB/docs describe the ownership model and no longer imply that persisted resources are globally shared

---

### TASK-2026-03-25-11: Backend Readiness and Fail-Fast Startup
- Status: `active`
- Owner: `Codex`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `ruh-backend/src/index.ts`, `ruh-backend/src/app.ts`, `ruh-backend/src/backendReadiness.ts`, `ruh-backend/src/startup.ts`, `ruh-backend/tests/unit/backendReadiness.test.ts`, `ruh-backend/tests/unit/startup.test.ts`, `docs/knowledge-base/002-backend-overview.md`, `docs/knowledge-base/004-api-reference.md`, `docs/knowledge-base/010-deployment.md`
- Summary: Completed the first bounded readiness slice. The backend now tracks readiness explicitly, exposes `GET /ready` with a machine-readable ready/not-ready payload, and initializes the DB before it starts listening so missing or failed DB setup aborts startup instead of serving a false-healthy API. Added focused unit coverage for readiness state and startup ordering/failure behavior.
- Next step: Repoint Docker Compose, Dockerfile, Kubernetes, and any smoke/runtime checks that currently treat `/health` as readiness so operators and orchestrators use `/ready` for dependency gating.
- Blockers: `None`

#### Why this is important now

- `ruh-backend/src/index.ts` calls `app.listen(...)` before `initPool()`, `store.initDb()`, `conversationStore.initDb()`, and `agentStore.initDb()`, then logs that DB-dependent endpoints may fail until resolved.
- `ruh-backend/src/app.ts` exposes `/health` as unconditional success, and both `docker-compose.yml` and `ruh-backend/Dockerfile` use that endpoint for health checks.
- `k8s/backend/deployment.yaml` also points readiness/liveness probes at `/health`, so the same false-positive exists outside local Docker.
- Current smoke tests explicitly accept `500` from DB-backed endpoints after a healthy startup, which bakes degraded startup into the expected behavior instead of treating it as a bug.

#### What to build

1. **Explicit readiness model** (`ruh-backend/src/app.ts`, `ruh-backend/src/index.ts`):
   - Track process liveness separately from dependency readiness.
   - Keep `/health` as a simple liveness check if desired, but add a dedicated readiness endpoint such as `/ready` or `/health/ready` that returns non-200 until DB pool init and schema init complete.
   - Include a small machine-readable payload describing readiness state so operators can diagnose whether the DB, schema init, or another dependency is blocking startup.

2. **Fail-fast or hold-unready startup** (`ruh-backend/src/index.ts`, `ruh-backend/src/db.ts`):
   - Rework startup so the process does not present as ready before `initPool()` and all `initDb()` calls finish successfully.
   - Prefer failing process startup when required config like `DATABASE_URL` is missing or DB initialization cannot succeed within the chosen startup contract.
   - If the team wants retry behavior, keep the process explicitly unready until retries succeed; do not serve a fake healthy state during recovery.

3. **Probe alignment across environments** (`docker-compose.yml`, `ruh-backend/Dockerfile`, `k8s/backend/deployment.yaml`, `nginx/` if needed):
   - Point readiness probes/healthchecks at the new readiness endpoint.
   - Keep liveness conservative so transient DB outages do not cause restart loops unless that is an intentional policy.
   - Verify the frontend/backend dependency chain in Compose no longer advances when the backend cannot serve DB-backed requests.

4. **Test and tooling cleanup** (`ruh-backend/tests/smoke/`, `ruh-backend/tests/e2e/`):
   - Stop accepting `500` as a normal post-startup outcome for core DB-backed routes.
   - Add startup tests that prove readiness stays false until DB init completes and that startup fails clearly when required DB config is absent.
   - Preserve fast local feedback for contributors by documenting how to run readiness-aware smoke tests.

5. **Docs update** (`README.md`, `docs/knowledge-base/002-backend-overview.md`, `docs/knowledge-base/004-api-reference.md`, `docs/knowledge-base/010-deployment.md`):
   - Update the backend startup sequence to remove the current “server still runs” behavior once fixed.
   - Document the difference between liveness and readiness and which endpoints each environment should probe.

#### Test suite

**Unit tests** (`ruh-backend/tests/unit/`):
- Readiness state stays false before DB init and flips true only after all init steps succeed
- Missing `DATABASE_URL` causes startup failure or permanent not-ready state according to the selected contract
- Readiness endpoint returns non-200 with a useful state payload when initialization fails

**E2E / smoke tests** (`ruh-backend/tests/e2e/`, `ruh-backend/tests/smoke/`):
- Fresh startup with a working DB reaches ready state and DB-backed endpoints return success, not tolerated `500`s
- Startup with an unreachable DB never reports ready
- If startup is configured to fail fast, the process exits non-zero when DB init cannot complete

**Deployment verification**:
- Docker Compose backend healthcheck only passes after the DB-backed API is truly usable
- Kubernetes readiness probe stays failing until backend initialization completes
- Frontend services do not advance behind a backend that is only live, not ready

#### Evaluation — task is done when
- [ ] Backend no longer reports ready before `initPool()` and all table init steps succeed
- [ ] Compose and Kubernetes probes use a readiness-aware endpoint instead of unconditional `/health`
- [ ] Startup with broken DB config fails clearly or remains explicitly unready, never “healthy but unusable”
- [ ] Smoke tests stop treating DB-backed `500` responses after startup as acceptable
- [ ] README and KB notes describe the corrected startup/readiness contract

---

### TASK-2026-03-25-12: Safe Undeploy + Sandbox Ownership Cleanup
- Status: `active`
- Owner: `unassigned`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `ruh-backend/src/app.ts`, `ruh-backend/src/agentStore.ts`, `ruh-backend/src/store.ts`, `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabMissionControl.tsx`, `agent-builder-ui/app/(platform)/agents/page.tsx`, `agent-builder-ui/hooks/use-agents-store.ts`, `ruh-frontend/components/SandboxSidebar.tsx`, `docs/knowledge-base/`
- Summary: Agent deployment is currently write-only. `/agents/:id/deploy` appends to `agents.sandbox_ids`, but there is no inverse undeploy path in either frontend or backend. Deleting a sandbox only removes the sandbox record/container, and deleting an agent only removes the agent row, so both flows can leave stale `sandbox_ids` or orphan running containers. This task adds first-class undeploy semantics and keeps agent deployment state consistent everywhere the product surfaces deployments.
- Next step: Start by writing `docs/knowledge-base/specs/SPEC-agent-deployment-lifecycle.md`, then add backend support for detaching and deleting a sandbox from an agent atomically before wiring Mission Control and developer-dashboard undeploy actions.
- Blockers: `None`

#### Why this is important now

- `agent-builder-ui/app/(platform)/agents/[id]/deploy/page.tsx` always calls `addSandboxToAgent`, so every deploy grows `sandbox_ids`.
- `ruh-backend/src/app.ts` handles `DELETE /api/sandboxes/:sandbox_id` without updating any linked agent rows.
- `ruh-backend/src/agentStore.ts` has `addSandboxToAgent()` but no matching `removeSandboxFromAgent()` or `detachSandboxFromAllAgents()` primitive.
- `agent-builder-ui/app/(platform)/agents/page.tsx` and `agent-builder-ui/app/(platform)/agents/[id]/chat/page.tsx` trust `agent.sandboxIds` for deployment counts and sandbox pickers, so stale IDs already produce misleading UI state as multi-instance features grow.
- As `TASK-2026-03-25-04` (health), `TASK-2026-03-25-07` (release history), and repeated redeploys land, the inability to undeploy cleanly becomes the main cost-control and operational cleanup gap.

#### What to build

1. **Feature spec first** (`docs/knowledge-base/specs/SPEC-agent-deployment-lifecycle.md`):
   - Define ownership rules between agents and sandboxes
   - Specify what happens when a sandbox is deleted directly vs. undeployed from an agent vs. an agent is deleted
   - Add backlinks in `[[003-sandbox-lifecycle]]`, `[[004-api-reference]]`, `[[008-agent-builder-ui]]`, and `[[009-ruh-frontend]]`

2. **Backend ownership primitives** (`ruh-backend/src/agentStore.ts`):
   - Add `removeSandboxFromAgent(agentId, sandboxId)`
   - Add `findAgentsBySandboxId(sandboxId)` or `detachSandboxFromAllAgents(sandboxId)`
   - Keep `sandbox_ids` deduplicated and consistent after attach/detach operations

3. **Safe undeploy API** (`ruh-backend/src/app.ts`):
   - Add `DELETE /api/agents/:id/sandboxes/:sandbox_id` to stop/remove the container, delete the sandbox record, and remove the sandbox ID from the owning agent in one backend flow
   - Update `DELETE /api/sandboxes/:sandbox_id` to detach that sandbox from all linked agents before returning
   - Update `DELETE /api/agents/:id` to handle associated sandboxes explicitly per spec instead of silently leaving them behind

4. **UI instance management** (`agent-builder-ui/`, `ruh-frontend/`):
   - In Mission Control, list each deployed instance with deployed time, health state, and actions for `Select`, `Copy ID`, and `Undeploy`
   - On the agents list, keep the deployed count accurate after undeploy/delete without requiring a hard refresh
   - In `ruh-frontend`, when deleting a sandbox from `SandboxSidebar`, show whether it is linked to an agent and refresh those agent deployment views cleanly

5. **Reconciliation + guardrails** (`use-agents-store.ts`, backend list/get flows):
   - Prevent stale `sandbox_ids` from lingering after deletes
   - Decide whether agent fetch/list should prune missing sandbox IDs eagerly or rely on explicit detach-on-delete, and test that choice
   - Keep the latest surviving sandbox selected in chat after undeploying the current one

#### Test suite

**Backend unit tests** (`ruh-backend/tests/unit/agentStore.test.ts` and new coverage as needed):
- `removeSandboxFromAgent()` removes exactly one sandbox ID and preserves the rest
- `detachSandboxFromAllAgents()` updates every linked agent record
- Deleting an agent with associated sandboxes follows the spec-selected behavior

**Backend integration tests** (`ruh-backend/tests/integration/`):
- Deploy path: create agent -> associate sandbox -> undeploy via `DELETE /api/agents/:id/sandboxes/:sandbox_id` -> assert sandbox row removed, container removal called, and agent no longer references the sandbox
- Direct sandbox delete: `DELETE /api/sandboxes/:sandbox_id` removes that ID from all linked agents
- Agent delete path behaves explicitly per spec and does not leave silent orphan ownership state behind

**Frontend E2E tests** (`agent-builder-ui/e2e/`, `ruh-frontend/e2e/`):
- Mission Control: undeploy one of two instances -> deployment count drops by one and remaining instance stays selectable
- Delete a sandbox in `ruh-frontend` -> linked agent no longer shows the deleted instance in its chat-page sandbox picker
- After undeploying the active sandbox, chat page switches to a remaining sandbox or shows the "Not deployed yet" empty state without crashing

#### Evaluation — task is done when
- [ ] Every deployment has an inverse undeploy path exposed in the backend and UI
- [ ] Deleting a sandbox no longer leaves stale `sandbox_ids` in agent records
- [ ] Deleting an agent handles associated sandboxes explicitly per the spec instead of silently orphaning them
- [ ] Mission Control can undeploy a specific instance without affecting other deployments of the same agent
- [ ] Agents page deployment counts and chat sandbox pickers stay accurate after undeploy/delete flows
- [ ] Backend and frontend tests cover the cleanup paths and pass

---

### TASK-2026-03-25-18: Redact Sandbox Secrets and Add Explicit Reveal Flow
- Status: `active`
- Owner: `Analyst-1`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `ruh-backend/src/store.ts`, `ruh-backend/src/app.ts`, `ruh-backend/src/utils.ts`, `ruh-backend/tests/security/`, `ruh-backend/tests/integration/`, `ruh-frontend/components/SandboxResult.tsx`, `ruh-frontend/components/SandboxSidebar.tsx`, `ruh-frontend/__tests__/components/SandboxResult.test.tsx`, `docs/knowledge-base/`
- Summary: Sandbox `preview_token` and `gateway_token` are currently persisted in PostgreSQL, returned verbatim by `GET /api/sandboxes` and `GET /api/sandboxes/:sandbox_id`, and rendered with copy buttons in `SandboxResult.tsx`. Channel config already masks secrets, but sandbox records do not. This leaves connection tokens exposed through routine list/detail fetches, screenshots, and browser history even before the broader backend auth work lands.
- Next step: Start by writing `docs/knowledge-base/specs/SPEC-sandbox-secret-handling.md`, then add a redacted sandbox serializer in the backend and update `SandboxResult.tsx` so raw tokens are no longer rendered or copied by default.
- Blockers: `None`

#### Why this is important now

- `ruh-backend/src/store.ts` defines `SandboxRecord` with raw `preview_token` and `gateway_token`, and `listSandboxes()` / `getSandbox()` return the full row.
- `ruh-backend/src/app.ts` sends those records straight through `/api/sandboxes` and `/api/sandboxes/:sandbox_id`.
- `ruh-frontend/components/SandboxResult.tsx` visibly renders both tokens and offers one-click copy for each.
- `docs/knowledge-base/006-channel-manager.md` already documents masked token handling for Slack/Telegram, so sandbox secret exposure is inconsistent with the rest of the product’s secret-handling posture.

#### What to build

1. **Feature spec first** (`docs/knowledge-base/specs/SPEC-sandbox-secret-handling.md`):
   - Define which sandbox fields are safe for routine read APIs vs. which are secrets
   - Specify when a raw gateway/preview token may still be shown (for example: immediately after creation or via an explicit reveal action)
   - Add backlinks in `[[003-sandbox-lifecycle]]`, `[[004-api-reference]]`, `[[005-data-models]]`, `[[009-ruh-frontend]]`, and `[[011-key-flows]]`

2. **Redacted sandbox response model** (`ruh-backend/src/store.ts`, `ruh-backend/src/app.ts`):
   - Introduce a redacted/public sandbox serializer separate from the internal store record
   - Make `GET /api/sandboxes`, `GET /api/sandboxes/:sandbox_id`, and stream-status fallback responses return masked or omitted secret fields instead of raw tokens
   - Keep raw tokens available only to backend-internal gateway proxy logic and other code paths that truly need them

3. **Explicit bootstrap / reveal path** (`ruh-backend/src/app.ts`, `ruh-frontend/`):
   - Preserve the initial “connect to newly created sandbox” workflow without continuing to leak secrets through normal list/detail reads
   - Prefer one of these explicit contracts and document it in the spec before implementation:
     - raw token only in the create-stream `result` event and never again from generic GET routes, or
     - a dedicated explicit reveal endpoint/action for connection details with clear audit/logging expectations
   - Do not persist raw connection tokens in long-lived frontend state once the initial bootstrap step is complete

4. **Frontend secret-handling cleanup** (`ruh-frontend/components/SandboxResult.tsx`, `ruh-frontend/components/SandboxSidebar.tsx`):
   - Stop rendering raw `preview_token` / `gateway_token` in the default sandbox detail UI
   - If reveal is supported, make it explicit, temporary, and visually distinct from normal metadata
   - Ensure copy actions never copy masked placeholders by accident and that reloaded views do not silently regain raw secrets

5. **Docs and compatibility pass** (`docs/knowledge-base/004-api-reference.md`, `docs/knowledge-base/005-data-models.md`, `docs/knowledge-base/011-key-flows.md`):
   - Update API docs so sandbox list/detail routes no longer imply they return reusable raw gateway credentials
   - Document the new bootstrap/reveal flow and how it differs from masked channel config reads

#### Test suite

**Backend security/integration tests** (`ruh-backend/tests/security/`, `ruh-backend/tests/integration/`):
- `GET /api/sandboxes` never returns raw `preview_token` or `gateway_token`
- `GET /api/sandboxes/:sandbox_id` never returns raw tokens in the normal read path
- Gateway proxy endpoints (`/chat`, `/models`, `/status`) still function because backend-internal token access remains intact
- If a reveal endpoint is added, it is isolated from generic list/detail responses and returns only the fields defined by the spec

**Frontend tests** (`ruh-frontend/__tests__/components/SandboxResult.test.tsx`, E2E if needed):
- `SandboxResult` renders masked tokens or no tokens by default
- Reveal/copy UX only exposes raw values when the explicit bootstrap/reveal contract says it should
- Refreshing or reloading the sandbox list does not repopulate raw tokens into normal UI state

#### Evaluation — task is done when
- [ ] Raw `preview_token` and `gateway_token` are absent from normal `GET /api/sandboxes*` responses
- [ ] The default sandbox detail UI no longer displays or copies raw connection tokens
- [ ] A newly created sandbox can still be connected through the documented bootstrap/reveal flow
- [ ] Backend gateway proxy behavior still works with internally stored tokens after the API/UI redaction change
- [ ] Security tests cover the absence of secret leakage on routine read paths
- [ ] KB notes and API docs describe the new secret-handling contract

---

### TASK-2026-03-25-14: Architect Tool Approval Guardrails
- Status: `active`
- Owner: `unassigned`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `agent-builder-ui/app/api/openclaw/route.ts`, `agent-builder-ui/lib/openclaw/api.ts`, `agent-builder-ui/hooks/use-openclaw-chat.ts`, `agent-builder-ui/app/(platform)/agents/create/_components/`, `agent-builder-ui/e2e/`, `docs/knowledge-base/`
- Summary: The architect bridge currently authenticates to the gateway with `operator.write` scope and automatically resolves every `exec.approval.requested` event with `decision: "allow"`. That means any architect prompt or compromised gateway response can execute arbitrary approved tools without an allowlist, user confirmation, or audit trail. This task adds an explicit approval policy so agent-building sessions are not effectively "run anything the architect asks" by default.
- Next step: Start by writing `docs/knowledge-base/specs/SPEC-architect-exec-approval-policy.md`, then change `agent-builder-ui/app/api/openclaw/route.ts` so non-allowlisted execution requests stop auto-resolving and are surfaced to the client as structured approval events.
- Blockers: `None. This can start immediately and complements TASK-2026-03-25-06 (architect isolation), TASK-2026-03-25-08 (frontend auth), and TASK-2026-03-25-09 (backend auth), but it should not wait for them.`

#### Why this is important now

- `agent-builder-ui/app/api/openclaw/route.ts` sends `connect` with `scopes: ["operator.read", "operator.write"]`, then auto-approves every `exec.approval.requested` frame by sending `exec.approval.resolve { decision: "allow" }`.
- `docs/knowledge-base/008-agent-builder-ui.md` documents this auto-approval behavior as the current contract, so the risk is codified rather than accidental.
- The current create-agent flow only emits a generic "Executing: <tool>" status; users cannot inspect the requested command, deny it, or understand what was approved after the fact.
- None of the existing backlog items cover execution-approval policy, least-privilege gating, or approval observability for the architect path.

#### What to build

1. **Feature spec first** (`docs/knowledge-base/specs/SPEC-architect-exec-approval-policy.md`):
   - Define which execution requests are safe to auto-allow, which require explicit user approval, and which must always be denied
   - Specify the UX contract for approval prompts, timeouts, retries, and what happens when the user navigates away mid-request
   - Add backlinks in `[[001-architecture]]`, `[[008-agent-builder-ui]]`, and `[[011-key-flows]]`

2. **Server-side approval policy** (`agent-builder-ui/app/api/openclaw/route.ts`):
   - Replace the blanket `decision: "allow"` behavior with a policy layer that classifies each `exec.approval.requested` payload
   - Support a small explicit allowlist for read-only / low-risk operations if the gateway payload exposes enough metadata to classify them safely
   - Deny clearly dangerous or unclassifiable requests by default instead of silently allowing them
   - Emit structured SSE events for approvals (`approval_required`, `approval_denied`, `approval_auto_allowed`) including session ID, tool name, justification, and any safe-to-display command summary

3. **Client approval flow** (`agent-builder-ui/lib/openclaw/api.ts`, `agent-builder-ui/hooks/use-openclaw-chat.ts`, create-page components):
   - Extend the streaming client to surface approval events distinctly from generic status text
   - Add UI that shows pending approval requests with the requested tool/action, rationale, and Approve / Deny controls
   - Ensure the UI remains session-scoped so one browser tab cannot approve another session's request
   - Add deterministic timeout handling so unanswered approvals fail closed and the chat shows a useful error

4. **Decision plumbing + auditability** (`agent-builder-ui/app/api/openclaw/route.ts`, frontend state/UI):
   - Add a follow-up control channel or route for sending the user's approve / deny decision back to the active gateway run
   - Record approval outcomes in the streamed status log so users can see what was auto-allowed, manually allowed, or denied
   - Include enough structured data for later server-side logging/metrics once auth and multi-user ownership land

5. **Least-privilege cleanup** (`agent-builder-ui/app/api/openclaw/route.ts`, docs):
   - Re-evaluate whether the architect bridge needs `operator.write` for every session or only when an approval-worthy tool is in play
   - Document the selected policy and remove the stale "auto-approval" statement from KB notes once behavior changes

#### Test suite

**Route / unit tests** (`agent-builder-ui/` or route-focused tests):
- Safe allowlisted request -> route resolves approval automatically and emits `approval_auto_allowed`
- Non-allowlisted request -> route emits `approval_required` and does not send `allow` until the client approves
- Explicit deny -> route sends `exec.approval.resolve { decision: "deny" }` and the final UI error is user-readable
- Approval timeout / disconnected client -> pending request fails closed instead of hanging forever

**Frontend tests**:
- `useOpenClawChat` stores at most one pending approval per run and clears it after approve / deny / timeout
- Approval UI renders requested tool metadata and disables duplicate submissions while a decision is in flight
- Generic lifecycle statuses continue working when no approval event occurs

**E2E tests** (`agent-builder-ui/e2e/`):
- Mock gateway requests approval for a non-allowlisted exec -> user sees approval UI before the architect continues
- Denying the request prevents the run from executing the tool and surfaces a clear failure state
- Auto-allowed safe request is logged visibly without interrupting the chat flow

#### Evaluation — task is done when
- [ ] Non-allowlisted architect execution requests are no longer implicitly approved
- [ ] Users can inspect and decide on pending tool executions from the create-agent UI
- [ ] Unanswered or malformed approval requests fail closed instead of defaulting to `allow`
- [ ] The streamed session log distinguishes auto-allowed, manually approved, and denied executions
- [ ] Route and frontend tests cover allow, deny, and timeout paths
- [ ] KB/spec notes describe the new approval policy instead of the current blanket auto-approval behavior

### TASK-2026-03-25-14: Harden Backend Shell Command Construction
- Status: `completed`
- Owner: `Worker-1`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `ruh-backend/src/app.ts`, `ruh-backend/src/docker.ts`, `ruh-backend/tests/security/shellCommands.test.ts`, `ruh-backend/tests/unit/docker.test.ts`, `docs/knowledge-base/000-INDEX.md`, `docs/knowledge-base/002-backend-overview.md`, `docs/knowledge-base/004-api-reference.md`, `docs/knowledge-base/specs/SPEC-backend-shell-command-safety.md`
- Summary: `Implemented the bounded shell-safety slice. Added shared `shellQuote`, `joinShellArgs`, path-segment normalization, and command-builder helpers in `ruh-backend/src/docker.ts`, then rewired `configure-agent` plus cron create/delete/toggle/edit/run/runs routes so user-controlled values are passed as literal args instead of ad hoc shell fragments. Documented the contract in a new KB spec and related notes.`
- Next step: `Extend the same shared helper path to `channelManager.ts` and any remaining `dockerExec(..., "bash -c ...")` call sites outside this first route slice; if route-level HTTP verification is needed later, reuse a harness that avoids the current Bun/supertest `app.address()` failure.`
- Blockers: `None for this slice. Route-level supertest verification remains limited by the existing Bun harness issue, so this run verified the pure command builders plus backend typecheck instead.`

#### Why this is important now

- `ruh-backend/src/docker.ts` runs every container command through `docker exec <container> bash -c <cmd>`, so any unsafe interpolation reaches a real shell.
- `ruh-backend/src/app.ts` currently interpolates untrusted values into command strings in `POST /api/sandboxes/:sandbox_id/configure-agent` and in cron routes such as `DELETE /api/sandboxes/:sandbox_id/crons/:job_id`, `POST /toggle`, `PATCH`, and `POST /run`.
- `ruh-backend/tests/security/injection.test.ts` documents an assumption that "shell commands use JSON.stringify", but the real `configure-agent` route does not consistently do that and the tests only check for graceful failure, not literal argument handling.
- This is a higher-leverage security hardening task than many feature gaps because it protects every authenticated control-plane caller once auth lands and reduces blast radius even in local/dev environments.

#### What to build

1. **Shell-safety contract** (`docs/knowledge-base/specs/` or a design note if the team prefers):
   - Define how backend code is allowed to invoke commands inside a sandbox.
   - Prefer passing argv arrays to Docker/Bun where possible; when `bash -c` is unavoidable, require a single audited escaping utility.
   - Document which fields must be treated as opaque user input (`skill_id`, cron `name`, `schedule`, `message`, `job_id`, dotted config values).

2. **Reusable command builder** (`ruh-backend/src/docker.ts` or `ruh-backend/src/shell.ts`):
   - Add a helper that safely quotes opaque string arguments for shell usage or, preferably, a helper that assembles command argv without going through a composed shell fragment.
   - Expose a small API that makes the safe path easier than manual interpolation.
   - Add unit tests that cover quotes, command substitution syntax, backticks, semicolons, newlines, `$()`, and paths with spaces.

3. **Harden `configure-agent`** (`ruh-backend/src/app.ts`):
   - Stop interpolating `skill.skill_id` into a shell path without sanitization.
   - Replace direct `openclaw cron add --name "${job.name}" ...` interpolation with the safe builder.
   - Keep file-content writes safe for SOUL.md and SKILL.md even when content includes quotes or shell metacharacters.
   - Decide whether `skill_id` should be escaped as a path segment, normalized to a safe slug, or both; document that choice.

4. **Harden cron mutation endpoints** (`ruh-backend/src/app.ts`, `ruh-backend/src/channelManager.ts` if needed):
   - Convert cron delete, toggle, edit, run, and runs endpoints to treat `job_id` and other user fields as literal args, not shell syntax.
   - Review adjacent command-building helpers such as `channelManager.setCfg()` and pairing commands so all user-controlled values go through the same safe path.

5. **Strengthen security coverage** (`ruh-backend/tests/security/`, `ruh-backend/tests/unit/`):
   - Replace the current "does not 500" command-injection assertions with tests that capture the exact command/argv passed to the execution layer and prove malicious input remains literal.
   - Add route-level tests for `configure-agent` and cron endpoints using payloads with quotes, semicolons, command substitution, and path traversal attempts.
   - Keep one regression test that proves valid cron creation/editing still works with benign values after the hardening change.

#### Test suite

**Unit tests** (`ruh-backend/tests/unit/`):
- Command-builder helper escapes or encodes `'`, `"`, `` ` ``, `$()`, `;`, `&&`, newlines, and spaces without changing literal value semantics
- Path-segment handling for `skill_id` rejects or normalizes `../`, `/`, and empty segments
- `channelManager` config writes still produce the expected literal values after moving to the safe helper

**Security tests** (`ruh-backend/tests/security/`):
- `POST /api/sandboxes/:sandbox_id/configure-agent` with malicious `skill_id` / cron payload does not produce an unquoted shell fragment
- `DELETE`, `PATCH`, `POST /toggle`, and `POST /run` cron endpoints treat a malicious `job_id` literally
- Tests assert the exact command or argv received by the execution layer, not just HTTP status codes

**Integration tests** (`ruh-backend/tests/integration/` or targeted mocked route tests):
- Safe cron create/edit/delete flows still work with realistic names, schedules, and messages
- `configure-agent` still writes SOUL.md and SKILL.md correctly for ordinary inputs after the refactor

#### Evaluation — task is done when
- [ ] No backend route interpolates user-controlled values into `bash -c` strings without a shared audited safe-construction path
- [ ] `configure-agent` and all cron mutation routes handle malicious input as literal data rather than shell syntax
- [ ] Security tests verify exact command construction for injection-shaped payloads
- [ ] Normal cron and agent-config flows continue to pass after hardening
- [ ] KB/docs describe the backend shell-safety contract for future endpoint work

---

### TASK-2026-03-25-20: Secure Secret Storage for Agent Tool Credentials
- Status: `active`
- Owner: `unassigned`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `ruh-backend/src/agentStore.ts`, `ruh-backend/src/app.ts`, `agent-builder-ui/hooks/use-agents-store.ts`, `agent-builder-ui/app/(platform)/agents/create/_components/configure/`, `docs/knowledge-base/`, `docs/knowledge-base/specs/`
- Summary: The repo has no secure persistence model for agent tool credentials. Current code keeps provider API keys ephemeral in the Settings tab and masks channel tokens on reads, but `TASK-2026-03-25-02` currently plans to persist `tool_connections.credentials` as raw JSONB on the agent record and return them intact from `GET /api/agents/:id`. Before tool connections ship end-to-end, the product needs a first-class secret-handling layer so API tokens are not stored or echoed back in plaintext.
- Next step: Start by writing `docs/knowledge-base/specs/SPEC-agent-tool-secret-storage.md`, then revise the planned `tool_connections` contract so agent records store only non-sensitive metadata plus masked/configured state or secret references, not raw credentials.
- Blockers: `None, but this should be treated as a prerequisite or tightly-coupled companion to TASK-2026-03-25-02 so plaintext credential persistence does not ship first.`

#### Why this is important now

- `TASK-2026-03-25-02` currently specifies `tool_connections.credentials: Record<string, string>`, JSONB persistence in the `agents` table, and an API round-trip where credentials come back intact from `GET /api/agents/:id`.
- The codebase already establishes a stronger secret-handling precedent elsewhere: `SPEC-agent-model-settings` keeps provider secrets ephemeral in the browser, and `ruh-backend/src/channelManager.ts` masks Telegram/Slack tokens when reading config back out.
- Backend auth and ownership scoping are necessary, but they still would not justify storing high-value tokens directly in normal DB rows or API responses.
- The next wave of tool connections will likely include Slack bot tokens, signing secrets, webhook secrets, and third-party API keys. Those should never appear in standard agent read endpoints or browser-persisted state.

#### What to build

1. **Feature spec first** (`docs/knowledge-base/specs/SPEC-agent-tool-secret-storage.md`):
   - Define the credential lifecycle for agent tool connections: create, update, rotate, apply-to-sandbox, display, and delete.
   - Decide the storage model: encrypted-at-rest Postgres table, secret-reference table, or another repo-supported secret store.
   - Specify the API contract so read endpoints return only masked previews or `configured: true/false`, never raw secret values.
   - Add backlinks in `[[004-api-reference]]`, `[[005-data-models]]`, `[[008-agent-builder-ui]]`, and any spec that extends `TASK-2026-03-25-02`.

2. **Backend secret persistence layer** (`ruh-backend/src/`):
   - Add a dedicated store/module for tool credentials instead of embedding raw secrets in `agents.tool_connections`.
   - Encrypt secrets at rest with an env-configured key if they remain in Postgres, or persist opaque secret references if a separate store is chosen.
   - Scope secrets to agent ID and tool ID, and make rotation/update idempotent.
   - Ensure delete flows remove orphaned secrets when an agent or tool connection is removed.

3. **Safe API shape** (`ruh-backend/src/app.ts`, `ruh-backend/src/agentStore.ts`):
   - Keep agent CRUD responses free of raw tool credentials.
   - Return masked previews only when needed for UX, or a boolean such as `has_credentials: true`.
   - Add dedicated write/update endpoints for credential mutation if the existing agent payload becomes too broad.
   - Ensure deploy/configure flows can still resolve the real secret server-side when calling `openclaw config set`.

4. **Frontend contract changes** (`agent-builder-ui/hooks/use-agents-store.ts`, configure-step components):
   - Stop assuming secrets are readable after save.
   - Represent configured credentials as masked placeholders or status chips, not hydrated plaintext.
   - Support rotation/re-entry UX where editing a tool connection replaces or clears the stored secret without revealing the previous value.
   - Keep secrets out of persisted Zustand/localStorage state.

5. **Planned tool-connections migration** (`TASK-2026-03-25-02` touchpoints):
   - Replace the plaintext `tool_connections.credentials` design with a split model: metadata in the agent record, secrets in the secure store.
   - Update deploy/config snapshot logic so release history and future audit trails do not capture raw secrets.
   - Document local-development key management, rotation expectations, and backfill behavior for any early test data.

#### Test suite

**Backend unit tests** (`ruh-backend/tests/unit/`):
- Secret store encrypts or externalizes stored values and never returns plaintext from read-model helpers
- Masking helper returns deterministic safe previews without leaking full values
- Credential rotation replaces the stored secret while preserving non-sensitive tool metadata

**Backend integration/security tests** (`ruh-backend/tests/integration/`, `ruh-backend/tests/security/`):
- `POST`/`PATCH` flows can save tool credentials, but `GET /api/agents` and `GET /api/agents/:id` never return raw secrets
- Deploy/configure flow can still inject the real credential into the sandbox even though agent read APIs expose only masked metadata
- Deleting an agent or removing a tool connection cleans up associated secrets
- Error payloads, logs, and release snapshots do not leak submitted secret material

**Frontend tests** (`agent-builder-ui/`):
- Saving a tool connection shows masked/configured state after refetch rather than the original plaintext token
- Reloading the page does not restore secrets from localStorage/Zustand persistence
- Editing a configured tool prompts for replacement input instead of revealing the previous secret

#### Evaluation — task is done when
- [ ] Tool credentials are not stored as plaintext in the main `agents` row or returned intact from agent read endpoints
- [ ] The configure flow can persist and later apply credentials without the browser re-reading the raw secret
- [ ] Logs, API errors, release snapshots, and frontend persisted state do not leak secret material
- [ ] Secret rotation and deletion are supported without manual DB cleanup
- [ ] Backend security/integration tests prove that normal read paths never expose raw tool credentials
- [ ] KB/spec docs describe the secret-handling contract before `TASK-2026-03-25-02` ships end-to-end

---

### TASK-2026-03-25-19: Durable Sandbox Provisioning Streams
- Status: `active`
- Owner: `Worker-1`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `ruh-backend/src/app.ts`, `ruh-backend/src/sandboxManager.ts`, `ruh-backend/tests/e2e/sandboxCreate.test.ts`, `ruh-backend/tests/smoke/`, `ruh-frontend/components/SandboxForm.tsx`, `agent-builder-ui/app/(platform)/agents/[id]/deploy/page.tsx`, `docs/knowledge-base/003-sandbox-lifecycle.md`, `docs/knowledge-base/004-api-reference.md`
- Summary: Sandbox creation is currently tied to a single SSE consumer instead of starting durably after `POST /api/sandboxes/create`. In `ruh-backend/src/app.ts`, the POST route only stores a `pending` stream entry; the expensive `createOpenclawSandbox()` generator does not start until `GET /api/sandboxes/stream/:stream_id` is consumed, and that route then rejects reconnects with `409 Stream already consumed`. Both frontends assume one uninterrupted EventSource for a 2-5 minute provisioning flow, while the KB and security tests describe creation as asynchronous immediately after POST. This task makes provisioning begin on POST, keeps progress state server-side, and lets clients reconnect without restarting the job.
- Next step: Start by writing `docs/knowledge-base/specs/SPEC-durable-sandbox-provisioning.md` to lock the creation-job lifecycle, reconnect semantics, replay window, and cleanup policy before changing the SSE implementation.
- Blockers: `None`

#### Why this is important now

- `ruh-backend/src/app.ts` returns `{ stream_id }` from `POST /api/sandboxes/create`, but the actual provisioning work is still lazy and starts only inside `GET /api/sandboxes/stream/:stream_id`.
- The SSE route marks a stream as consumed and returns `409` on the next connection, so a browser refresh or transient network loss can strand the most expensive workflow in the product.
- `ruh-frontend/components/SandboxForm.tsx` and `agent-builder-ui/app/(platform)/agents/[id]/deploy/page.tsx` both open a single EventSource and have no resume path if the tab reloads or the stream drops.
- `docs/knowledge-base/004-api-reference.md` and `ruh-backend/tests/security/auth.test.ts` already describe sandbox creation as starting asynchronously after POST, so the runtime contract is currently weaker than the documented one.
- This is a first-run product reliability issue: losing provisioning state during create/deploy directly harms activation and makes operators retry container creation unnecessarily.

#### What to build

1. **Feature spec first** (`docs/knowledge-base/specs/SPEC-durable-sandbox-provisioning.md`):
   - Define the lifecycle states for a sandbox create job (`pending`, `running`, `result`, `approved`, `error`, `done`)
   - Decide whether `stream_id` remains the public handle or whether create jobs need a separate durable identifier
   - Specify reconnect/replay behavior, retention TTL, and what the polling/status contract is when no SSE client is attached

2. **Background create job execution** (`ruh-backend/src/app.ts`, helpers as needed):
   - Start `createOpenclawSandbox()` from `POST /api/sandboxes/create` in the background instead of from the first SSE subscriber
   - Replace the single-consumer `_streams` entry with a job object that stores current phase, final result/error, and a bounded event buffer
   - Preserve existing `saveSandbox()` and `markApproved()` side effects while decoupling them from the connection lifecycle

3. **Reconnectable progress delivery** (`ruh-backend/src/app.ts`):
   - Update `GET /api/sandboxes/stream/:stream_id` to replay buffered events and then stream live updates for active jobs
   - Allow repeated SSE subscribers for the same in-flight or recently completed create job instead of returning `409`
   - Add cleanup for finished/expired jobs so process memory does not grow forever

4. **Frontend recovery flow** (`ruh-frontend/components/SandboxForm.tsx`, `agent-builder-ui/app/(platform)/agents/[id]/deploy/page.tsx`):
   - Preserve the active create/deploy handle in component state and reconnect when the EventSource drops unexpectedly
   - Add explicit recovery behavior after reload or reconnect so users can reattach to an existing provisioning job instead of starting over
   - Keep success/failure UI aligned with the new replayable backend events

5. **Docs and contract alignment** (`docs/knowledge-base/003-sandbox-lifecycle.md`, `docs/knowledge-base/004-api-reference.md`):
   - Update the lifecycle docs to match the final durable create-job contract
   - Document reconnect semantics, retention behavior, and any status endpoint additions

#### Test suite

**Backend e2e tests** (`ruh-backend/tests/e2e/sandboxCreate.test.ts`):
- `POST /api/sandboxes/create` starts the mocked create generator even when no SSE client connects immediately
- Connecting to `GET /api/sandboxes/stream/:stream_id` after the job has already started replays buffered `log` and `result` events in order
- Reconnecting to the same stream after a disconnect resumes successfully instead of returning `409`
- Recently completed jobs still expose final `result` or `error` state until TTL cleanup runs

**Backend smoke/integration tests** (`ruh-backend/tests/smoke/`, add integration coverage if needed):
- Simulate a delayed or dropped SSE client and verify sandbox persistence still happens once the background job reaches `result`
- Verify stale finished jobs are cleaned up only after the documented retention window

**Frontend tests** (`ruh-frontend/__tests__/components/SandboxForm.test.tsx`, `agent-builder-ui` test coverage as appropriate):
- SandboxForm can reconnect to an existing create job and continue showing logs after a forced EventSource restart
- Deploy page recovers from a transient stream disconnect without losing the in-progress deployment state

#### Evaluation — task is done when
- [ ] `POST /api/sandboxes/create` reliably starts provisioning work even if no SSE client connects
- [ ] A browser refresh or transient network loss can reattach to an in-progress sandbox create/deploy job
- [ ] `GET /api/sandboxes/stream/:stream_id` no longer treats reconnect as an error for active jobs
- [ ] Final create result or error remains queryable long enough for UI recovery after disconnect
- [ ] Finished create jobs are cleaned up on a bounded retention policy instead of accumulating indefinitely
- [ ] KB/API docs and backend tests match the actual provisioning contract

---

### TASK-2026-03-25-21: Fail Sandbox Creation When Gateway Never Becomes Healthy
- Status: `active`
- Owner: `Analyst-1`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `ruh-backend/src/sandboxManager.ts`, `ruh-backend/src/app.ts`, `ruh-backend/tests/unit/sandboxManager.test.ts`, `ruh-backend/tests/e2e/sandboxCreate.test.ts`, `ruh-frontend/components/SandboxForm.tsx`, `agent-builder-ui/app/(platform)/agents/[id]/deploy/page.tsx`, `docs/knowledge-base/003-sandbox-lifecycle.md`, `docs/knowledge-base/011-key-flows.md`
- Summary: Sandbox creation currently yields a `result` event and persists the sandbox record even when the gateway never becomes healthy. In `createOpenclawSandbox()`, a failed 60s gateway health check only emits a warning log before yielding `result`, and both frontends treat `result` as success (`SandboxForm` refreshes the list and deploy adds the sandbox to the agent before config push completes). This leaves the product with sandboxes that look created but cannot actually serve chat, models, or status reliably. This task changes creation to fail closed or enter an explicit degraded state instead of silently saving unusable sandboxes as healthy-enough results.
- Next step: Start by writing `docs/knowledge-base/specs/SPEC-sandbox-creation-health-contract.md`, then change `ruh-backend/src/sandboxManager.ts` so a gateway-health timeout does not yield `result` and the partial container is either cleaned up or surfaced through an explicit non-ready state defined by the spec.
- Blockers: `None`

#### Why this is important now

- `ruh-backend/src/sandboxManager.ts` logs `WARNING: Gateway did not start within 60s` and still yields `['result', resultData]`, which causes `store.saveSandbox()` to persist a record for an unready sandbox.
- `docs/knowledge-base/011-key-flows.md` explicitly documents the current behavior as “Gateway health check timeout -> WARNING logged, sandbox still saved”, so the weak contract is known but not yet fixed.
- `ruh-frontend/components/SandboxForm.tsx` calls `onCreated?.()` as soon as the `result` event arrives, and `agent-builder-ui/app/(platform)/agents/[id]/deploy/page.tsx` adds the sandbox ID to the agent on `result` before configuration or post-create validation has succeeded.
- Existing backlog items cover reconnectable streams, health dashboards, releases, and undeploy, but none prevent the initial creation flow from declaring success for a sandbox whose gateway never came up.

#### What to build

1. **Feature spec first** (`docs/knowledge-base/specs/SPEC-sandbox-creation-health-contract.md`):
   - Define the success criteria for sandbox creation (`container running` is not enough; gateway readiness requirements must be explicit)
   - Decide whether an unhealthy post-create sandbox is treated as a hard error with cleanup or as an explicit `degraded`/`needs_recovery` state that is not surfaced as a normal ready sandbox
   - Add backlinks in `[[003-sandbox-lifecycle]]`, `[[004-api-reference]]`, `[[009-ruh-frontend]]`, and `[[011-key-flows]]`

2. **Backend creation contract** (`ruh-backend/src/sandboxManager.ts`, `ruh-backend/src/app.ts`):
   - Stop yielding `result` when the gateway health probe times out under the default contract
   - Clean up the partial container on failure, or persist a clearly non-ready record only if the spec explicitly requires a recoverable degraded state
   - Include enough failure detail in the emitted `error` path for operators to debug gateway startup issues without inspecting the DB blindly

3. **Persistence and SSE semantics** (`ruh-backend/src/app.ts`):
   - Ensure `store.saveSandbox()` only runs for creation outcomes that satisfy the new readiness contract
   - Keep `approved` handling aligned with the new flow so device approval remains a post-ready step, not a substitute for gateway readiness
   - If a degraded state is introduced, document exactly which events and stored fields represent it

4. **Frontend success criteria** (`ruh-frontend/components/SandboxForm.tsx`, `agent-builder-ui/app/(platform)/agents/[id]/deploy/page.tsx`):
   - Do not treat `result` as a durable success unless it represents a gateway-ready sandbox under the new contract
   - Avoid refreshing the sandbox list or attaching the sandbox to an agent when creation ended in the new unhealthy-gateway failure path
   - Surface a clear retry/debuggable error state to the user when the gateway never becomes reachable

5. **Regression coverage and docs** (`ruh-backend/tests/`, KB notes above):
   - Add unit and e2e coverage for the unhealthy-gateway path, including container cleanup or degraded-state persistence according to the chosen contract
   - Update lifecycle docs so they no longer normalize “warning but still saved” as expected behavior

#### Test suite

**Backend unit tests** (`ruh-backend/tests/unit/sandboxManager.test.ts`):
- Gateway health timeout yields `error` or the new explicit degraded event, but not a normal `result`
- Partial container cleanup is attempted when the chosen contract is fail-closed
- Happy-path creation still yields `result` and `approved` as before

**Backend e2e tests** (`ruh-backend/tests/e2e/sandboxCreate.test.ts`):
- Unhealthy gateway create run does not call `saveSandbox()` as a normal ready sandbox
- SSE output surfaces a debuggable failure/degraded event instead of `result` + silent warning
- Frontend-facing create contract still streams logs and terminal state in order

**Frontend tests** (`ruh-frontend/__tests__/components/SandboxForm.test.tsx`, `agent-builder-ui` coverage as appropriate):
- SandboxForm does not call `onCreated` on the unhealthy-gateway failure path
- Deploy page does not attach the sandbox to the agent when creation never produced a ready gateway
- Users see a retryable error message when the gateway startup contract fails

#### Evaluation — task is done when
- [ ] A sandbox whose gateway never becomes healthy is no longer persisted or surfaced as a normal successful create result
- [ ] `store.saveSandbox()` runs only for creation outcomes that satisfy the documented readiness contract
- [ ] Frontends stop treating an unhealthy-gateway create as a successful sandbox/agent deployment
- [ ] Backend tests cover the unhealthy-gateway path and the normal happy path
- [ ] KB/API flow docs no longer describe “warning but still saved” as the expected creation outcome

---

### TASK-2026-03-25-23: Add real backend schema migrations
- Status: `active`
- Owner: `Worker-1`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `ruh-backend/src/index.ts`, `ruh-backend/src/db.ts`, `ruh-backend/src/store.ts`, `ruh-backend/src/agentStore.ts`, `ruh-backend/src/conversationStore.ts`, `ruh-backend/tests/integration/`, `docker-compose.yml`, `docs/knowledge-base/002-backend-overview.md`, `docs/knowledge-base/005-data-models.md`, `docs/knowledge-base/010-deployment.md`, `docs/knowledge-base/specs/`
- Summary: The backend still relies on `initDb()` functions that only run `CREATE TABLE IF NOT EXISTS` statements at startup. There is no migration ledger, no ordered schema evolution, and no safe path for adding columns/indexes/constraints to an already-populated database. That is now a repo-wide reliability risk because several active tasks already depend on schema changes (`agent_releases`, ownership fields, secret storage, tool connections), and shipping them without a real migration system will make existing environments drift silently or fail inconsistently. This task introduces a first-class migration workflow before more schema-changing work lands on top of ad hoc startup DDL.
- Next step: Start by writing `docs/knowledge-base/specs/SPEC-backend-schema-migrations.md`, then choose and implement the minimal migration mechanism for `ruh-backend` so startup runs ordered migrations from a tracked ledger instead of relying on per-table `CREATE TABLE IF NOT EXISTS` helpers.
- Blockers: `None`

#### Why this is important now

- `ruh-backend/src/store.ts`, `ruh-backend/src/agentStore.ts`, and `ruh-backend/src/conversationStore.ts` only create base tables/indexes if they do not exist; they do not handle column additions, backfills, constraints, or reversible schema changes.
- `ruh-backend/src/index.ts` calls those `initDb()` functions directly on startup, which works for an empty local database but provides no deployment-safe contract for evolving an existing one.
- Active backlog items already require schema evolution, not just table creation:
  - `TASK-2026-03-25-07` needs an `agent_releases` table and related indexes
  - `TASK-2026-03-25-10` needs ownership columns and migration behavior for existing rows
  - `TASK-2026-03-25-20` needs dedicated secret storage beyond the current `agents` row
  - `TASK-2026-03-25-02` plans new persisted tool/trigger fields
- Without a migration system, each of those tasks will either re-implement one-off `ALTER TABLE` startup logic or assume a fresh database, which is exactly how schema drift becomes production breakage.

#### What to build

1. **Feature spec first** (`docs/knowledge-base/specs/SPEC-backend-schema-migrations.md`):
   - Define the migration contract: file layout, naming/versioning, execution order, failure behavior, and how local/dev/prod environments apply migrations.
   - Decide whether migrations are SQL-first, TypeScript-runner-based, or another lightweight mechanism appropriate for Bun + `pg`.
   - Document how schema backfills and one-time data migrations should be handled alongside structural changes.
   - Add backlinks in `[[002-backend-overview]]`, `[[005-data-models]]`, and `[[010-deployment]]`.

2. **Migration runner + ledger** (`ruh-backend/src/`, new migrations directory as needed):
   - Add a tracked migration table (for example `schema_migrations`) that records applied migration IDs and timestamps.
   - Implement a startup-safe migration runner that applies pending migrations in order and stops clearly on failure.
   - Keep the runner idempotent so repeated startup on an already-migrated database is a no-op.

3. **Refactor current startup DDL** (`ruh-backend/src/index.ts`, `ruh-backend/src/store.ts`, `ruh-backend/src/agentStore.ts`, `ruh-backend/src/conversationStore.ts`):
   - Move today’s table/index creation into initial migration files instead of hidden `initDb()` side effects.
   - Reduce the store modules to runtime data-access responsibilities rather than schema management.
   - Preserve bootstrap behavior for a fresh database while making existing-database upgrades explicit and ordered.

4. **Developer and deployment workflow** (`docker-compose.yml`, scripts/docs, `docs/knowledge-base/010-deployment.md`):
   - Define how migrations run in local development, tests, Docker Compose, and deployment environments.
   - Document whether migrations run automatically at backend startup, via an explicit command, or both.
   - Make sure failure to apply required migrations is surfaced clearly instead of leaving the app partially started against stale schema.

5. **Schema-change guidance for pending tasks** (`docs/knowledge-base/005-data-models.md`, TODO cross-references):
   - Document that future DB-affecting tasks should land schema changes as ordered migrations, not new ad hoc `CREATE TABLE IF NOT EXISTS` or inline `ALTER TABLE` calls.
   - Note the immediate dependents in the KB/spec so follow-on tasks can build on the migration framework instead of inventing their own.

#### Test suite

**Backend integration tests** (`ruh-backend/tests/integration/`):
- Fresh database bootstraps successfully by applying the full migration chain
- Partially migrated database applies only the remaining migrations in order
- Failed migration stops startup/runner clearly and does not mark the migration as applied

**Backend unit tests** (`ruh-backend/tests/unit/`):
- Migration discovery/order logic is deterministic
- Migration ledger handling is idempotent on repeated runs
- Initial migration reproduces the current base schema for sandboxes, agents, conversations, and messages

**Operational verification**:
- Local developer workflow documents how to initialize or reset a DB and re-run migrations
- Compose/startup behavior is verified so stale-schema deployments fail clearly instead of drifting silently

#### Evaluation — task is done when
- [ ] Backend schema changes are applied through an ordered migration system with a tracked ledger
- [ ] Current base tables/indexes come from migrations rather than implicit startup DDL in store modules
- [ ] Fresh and already-populated databases can both reach the expected schema deterministically
- [ ] Startup/deploy docs explain how migrations are applied and how failures surface
- [ ] Follow-on schema tasks can reference the migration framework instead of inventing one-off upgrade logic

---

### TASK-2026-03-25-19: Sandbox Creation Quotas + Idempotent Deploy Guardrails
- Status: `active`
- Owner: `Worker-1`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `ruh-backend/src/app.ts`, `ruh-backend/src/sandboxManager.ts`, `ruh-backend/src/agentStore.ts`, `ruh-backend/tests/e2e/sandboxCreate.test.ts`, `ruh-backend/tests/integration/`, `agent-builder-ui/app/(platform)/agents/[id]/deploy/page.tsx`, `ruh-frontend/components/SandboxForm.tsx`, `docs/knowledge-base/003-sandbox-lifecycle.md`, `docs/knowledge-base/004-api-reference.md`, `docs/knowledge-base/specs/`
- Summary: Sandbox creation and deploy are currently server-side unbounded and non-idempotent. `POST /api/sandboxes/create` accepts unlimited requests with no concurrency cap or quota, `agent-builder-ui` deploy calls it directly with no idempotency key, and `agentStore.addSandboxToAgent()` happily appends every resulting `sandbox_id`. A browser retry, double submit, or noisy client can therefore spawn duplicate containers, inflate `sandbox_ids`, and exhaust the Docker host even after auth lands. This task adds admission control, duplicate-request protection, and explicit quota errors so create/deploy becomes safe under retries and load.
- Next step: Start by writing `docs/knowledge-base/specs/SPEC-sandbox-create-admission-control.md`, then add a small creation-job admission layer in `ruh-backend/src/app.ts` that enforces in-flight dedupe and configurable global/per-agent limits before a new create job is accepted.
- Blockers: `None. This complements TASK-2026-03-25-12 (undeploy cleanup) and the durable provisioning task above, but it is a separate admission-control problem and can start immediately.`

#### Why this is important now

- `ruh-backend/src/app.ts` accepts `POST /api/sandboxes/create` immediately and tracks jobs in `_streams`, but there is no system-wide concurrency limit, per-agent limit, or duplicate-request check.
- `agent-builder-ui/app/(platform)/agents/[id]/deploy/page.tsx` calls `/api/sandboxes/create` directly from `startDeploy()` and does not send an idempotency key or check whether the same agent already has an in-flight deployment.
- `ruh-frontend/components/SandboxForm.tsx` also posts directly to `/api/sandboxes/create`, so the low-level sandbox UI has the same retry/double-submit behavior.
- `ruh-backend/src/agentStore.ts:addSandboxToAgent()` appends every successful sandbox ID, so accidental duplicate deploys immediately create long-lived state and cleanup work.
- The backlog already covers auth, ownership, durable SSE reconnects, and undeploy cleanup; none of those tasks prevent a valid caller from accidentally or intentionally over-creating containers.

#### What to build

1. **Feature spec first** (`docs/knowledge-base/specs/SPEC-sandbox-create-admission-control.md`):
   - Define the admission contract for sandbox creation and deploy: duplicate submit behavior, in-flight job reuse, quota failure status codes, and operator-visible error copy
   - Decide which limits are required now: global concurrent creates, per-agent concurrent deploys, per-user or per-workspace active sandbox caps once auth context exists
   - Add backlinks in `[[003-sandbox-lifecycle]]`, `[[004-api-reference]]`, and `[[011-key-flows]]`

2. **Backend admission controller** (`ruh-backend/src/app.ts`, helper module if needed):
   - Add one shared create/deploy guard that evaluates whether a new sandbox create request should start, reuse an existing in-flight job, or fail with `409` / `429`
   - Support an idempotency key or deterministic create fingerprint so retries for the same logical action return the existing job handle instead of starting another container
   - Enforce configurable global create concurrency and a per-agent in-flight deploy limit before provisioning work begins
   - Prepare the design so ownership-based per-user quotas can plug in later without rewriting the contract

3. **Deploy and sandbox-form client wiring** (`agent-builder-ui/app/(platform)/agents/[id]/deploy/page.tsx`, `ruh-frontend/components/SandboxForm.tsx`):
   - Send a stable idempotency token for each logical create/deploy attempt
   - Reuse the returned existing job when the backend reports a duplicate in-flight request
   - Surface quota/duplicate errors clearly instead of generic "deployment failed" messages
   - Keep button-disable behavior aligned with the backend contract, but do not rely on frontend state alone for safety

4. **Persistence and cleanup alignment** (`ruh-backend/src/agentStore.ts`, related deploy flows):
   - Prevent the same in-flight or already-attached sandbox from being appended repeatedly to `agent.sandbox_ids`
   - Decide whether a failed create job consumes quota temporarily and document the release conditions
   - Keep the admission logic compatible with the durable create-job retention window so reused job handles do not outlive their policy

5. **Docs and operator guidance** (`docs/knowledge-base/003-sandbox-lifecycle.md`, `docs/knowledge-base/004-api-reference.md`):
   - Document quota responses, duplicate-request reuse semantics, and any new request header/body field for idempotency
   - Clarify how deploy differs from raw sandbox creation if per-agent limits are stricter than low-level sandbox UI limits

#### Test suite

**Backend e2e / integration tests** (`ruh-backend/tests/e2e/sandboxCreate.test.ts`, `ruh-backend/tests/integration/`):
- Two `POST /api/sandboxes/create` requests with the same idempotency key return the same create-job handle instead of starting two containers
- A second deploy request for the same agent while the first is still in flight is rejected or reused according to the spec-selected contract
- Exceeding configured global create concurrency returns a deterministic `429` or `409` with a useful error payload
- Once a create job finishes or fails, a new request with a fresh idempotency key can start normally

**Backend unit tests** (`ruh-backend/tests/unit/`):
- Admission helper classifies requests correctly for `new`, `duplicate_in_flight`, `quota_exceeded`, and `already_deployed` cases
- Agent sandbox attachment logic remains deduplicated when the same sandbox ID is reported more than once

**Frontend tests** (`agent-builder-ui/`, `ruh-frontend/__tests__/components/`):
- Deploy page reuses an existing create job when the backend reports a duplicate in-flight attempt
- SandboxForm shows a clear quota/capacity error instead of a generic failure when create admission is denied
- Repeated button clicks do not create multiple visible deployment rows for the same logical attempt

#### Evaluation — task is done when
- [ ] Duplicate create/deploy submissions no longer start multiple sandbox containers for the same logical action
- [ ] Backend enforces explicit create/deploy admission limits instead of accepting unlimited concurrent provisioning
- [ ] Agent deployment state does not grow duplicate `sandbox_ids` from retry races
- [ ] Frontends surface duplicate-in-flight and quota errors clearly and can reattach to the reused job handle
- [ ] Tests cover idempotent retry, quota rejection, and successful retry after completion
- [ ] KB/API docs describe the new admission-control and idempotency contract

---

### TASK-2026-03-25-22: Enforce Conversation-to-Sandbox Boundaries in Chat Proxy
- Status: `active`
- Owner: `Worker-1`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `ruh-backend/src/app.ts`, `ruh-backend/src/conversationStore.ts`, `ruh-backend/tests/e2e/chatProxy.test.ts`, `docs/knowledge-base/004-api-reference.md`, `docs/knowledge-base/007-conversation-store.md`, `docs/knowledge-base/011-key-flows.md`, `docs/knowledge-base/000-INDEX.md`, `docs/knowledge-base/specs/SPEC-chat-conversation-boundaries.md`
- Summary: Completed a bounded implementation slice for the chat-boundary task. Added `SPEC-chat-conversation-boundaries`, documented the `404 Conversation not found` mismatch contract across the affected KB notes, introduced `conversationStore.getConversationForSandbox()` for reusable same-sandbox lookups, and hardened `POST /api/sandboxes/:sandbox_id/chat` so an existing conversation from another sandbox no longer contributes a session key. Also added a route-level regression in `ruh-backend/tests/e2e/chatProxy.test.ts` plus green unit coverage for the new store helper.
- Next step: Once the Bun/supertest HTTP harness is repaired, re-run `ruh-backend/tests/e2e/chatProxy.test.ts` (or equivalent route-level coverage) to validate the new 404 behavior end-to-end and then close the task if the route contract stays stable.
- Blockers: `The existing Bun + supertest harness still fails before requests execute with TypeError: null is not an object (evaluating 'app.address().port'), so the new route-level regression is added but could not be verified in this run`

#### Why this is important now

- `ruh-backend/src/app.ts` handles `conversation_id` in the chat proxy by calling `getConversation(conversationId)` and immediately reusing `conv.openclaw_session_key`, but it never checks `conv.sandbox_id === req.params.sandbox_id`.
- The rest of the conversation routes already enforce that boundary: message fetch/append, rename, and delete all return `404` when the conversation belongs to a different sandbox.
- `docs/knowledge-base/007-conversation-store.md` and `docs/knowledge-base/011-key-flows.md` describe the happy path as though the chat proxy simply “looks up the conversation record,” but they do not document this missing sandbox verification.
- Existing tests in `ruh-backend/tests/e2e/chatProxy.test.ts` only confirm that `conversation_id` becomes the forwarded session-key header; there is no regression test proving that a conversation from sandbox A is rejected when used against sandbox B.

#### What to build

1. **Feature spec first** (`docs/knowledge-base/specs/SPEC-chat-conversation-boundaries.md`):
   - Define the route contract for `POST /api/sandboxes/:sandbox_id/chat` when `conversation_id` is present, missing, unknown, or belongs to a different sandbox
   - Decide whether mismatch should return `404` (consistent with other conversation routes) or another explicit error, and document the reason
   - Add backlinks in `[[004-api-reference]]`, `[[007-conversation-store]]`, and `[[011-key-flows]]`

2. **Backend route hardening** (`ruh-backend/src/app.ts`):
   - Refactor chat-proxy conversation lookup into one helper that verifies both existence and sandbox ownership before deriving the session key
   - Reject cross-sandbox `conversation_id` values before any gateway request is attempted
   - Keep the existing “unknown conversation ID falls back to derived session key” behavior only if the spec explicitly preserves it; otherwise fail closed and update clients/tests accordingly

3. **Conversation-store affordance** (`ruh-backend/src/conversationStore.ts` if useful):
   - Add a store helper such as `getConversationForSandbox(convId, sandboxId)` or equivalent to make the safe path easy to reuse
   - Keep the helper aligned with future ownership-scoping work so sandbox validation composes cleanly with user/workspace validation later

4. **Regression coverage** (`ruh-backend/tests/e2e/chatProxy.test.ts`, `ruh-backend/tests/contract/chatCompletions.test.ts`):
   - Add a route test where the supplied `conversation_id` exists but belongs to another sandbox and assert the backend rejects it without forwarding to the gateway
   - Preserve the existing positive test for a valid conversation in the same sandbox
   - Add one test for the chosen unknown-conversation behavior so the route contract is explicit instead of accidental

5. **Documentation correction** (`docs/knowledge-base/004-api-reference.md`, `docs/knowledge-base/007-conversation-store.md`, `docs/knowledge-base/011-key-flows.md`):
   - Document the sandbox-boundary requirement for `conversation_id`
   - Update the flow notes so they match the new validation behavior and error contract

#### Test suite

**Backend E2E / contract tests** (`ruh-backend/tests/e2e/chatProxy.test.ts`, `ruh-backend/tests/contract/chatCompletions.test.ts`):
- Valid `conversation_id` for the same sandbox still forwards the correct `x-openclaw-session-key`
- `conversation_id` belonging to a different sandbox is rejected and never reaches the gateway client
- Unknown `conversation_id` follows the spec-selected behavior consistently and is covered explicitly

**Backend integration/unit tests** (`ruh-backend/tests/integration/`, `ruh-backend/tests/unit/` as needed):
- Safe helper returns the conversation only when both conversation ID and sandbox ID match
- Chat route preserves current non-conversation chat behavior when no `conversation_id` is supplied

#### Evaluation — task is done when
- [ ] `POST /api/sandboxes/:sandbox_id/chat` no longer reuses a session key from a conversation owned by a different sandbox
- [ ] Cross-sandbox `conversation_id` attempts fail before any gateway request is sent
- [ ] The route contract for unknown vs. mismatched conversation IDs is explicit, tested, and documented
- [ ] Existing same-sandbox chat flows continue to work with the correct session-key forwarding
- [ ] KB/API docs describe the conversation-boundary rule consistently with the code

---

### TASK-2026-03-25-24: Make Agent Config Apply Fail-Closed and Verified
- Status: `completed`
- Owner: `Worker-1`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `docs/knowledge-base/specs/SPEC-agent-config-apply-contract.md`, `docs/knowledge-base/000-INDEX.md`, `docs/knowledge-base/004-api-reference.md`, `docs/knowledge-base/008-agent-builder-ui.md`, `docs/knowledge-base/011-key-flows.md`, `ruh-backend/src/app.ts`, `ruh-backend/tests/unit/`, `ruh-backend/tests/integration/`, `agent-builder-ui/lib/openclaw/agent-config.ts`, `agent-builder-ui/app/(platform)/agents/[id]/deploy/page.tsx`, `agent-builder-ui/app/(platform)/agents/create/page.tsx`, `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabMissionControl.tsx`
- Summary: Implemented [[SPEC-agent-config-apply-contract]] end-to-end for the first production slice. `POST /api/sandboxes/:sandbox_id/configure-agent` now returns structured step objects, emits a non-2xx fail-closed response when any SOUL/skill/cron mutation fails, and records failure audit events instead of always claiming success. `pushAgentConfig()` now preserves backend `ok/applied/detail` semantics, the deploy flow waits for verified config apply before attaching the sandbox to the agent, and Improve Agent / Mission Control no longer present unconditional success when runtime push fails; the multi-instance Improve Agent overlay now reports how many sandbox updates failed and which sandbox IDs need attention.
- Next step: If we want broader confidence later, add higher-level UI regression coverage for deploy-page attach gating and multi-instance hot-push status rendering once the current agent-builder test typing issues are cleaned up.
- Blockers: `None for the shipped fail-closed contract. Focused backend/frontend tests and backend typecheck passed; full agent-builder typecheck still reports pre-existing test typing and next.config errors outside this feature slice.`

#### Why this is important now

- `ruh-backend/src/app.ts` pushes step logs like `SOUL.md failed: ...` or `Skill <id> failed: ...` into `steps`, but still returns `{ ok: true, steps }` even when one or more steps failed.
- `agent-builder-ui/lib/openclaw/agent-config.ts` ignores `data.ok` from the backend and returns `{ ok: true }` for any HTTP-200 response, so callers cannot distinguish full success from partial apply.
- `agent-builder-ui/app/(platform)/agents/[id]/deploy/page.tsx` calls `addSandboxToAgent()` as soon as the create stream emits `result`, before config apply succeeds, then logs a warning but still treats the deployment as successful.
- `agent-builder-ui/app/(platform)/agents/create/page.tsx` uses `Promise.all(pushAgentConfig(...))` for hot-push and marks the update as `done` as long as requests do not throw, even if one or more sandboxes return failed config steps.
- `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabMissionControl.tsx` also treats `pushAgentConfig()` as success-only and surfaces `Config updated` without checking whether the sandbox actually accepted the full config.

#### What to build

1. **Feature spec first** (`docs/knowledge-base/specs/SPEC-agent-config-apply-contract.md`):
   - Define the success contract for `configure-agent`: which steps are mandatory, what counts as a partial apply, and whether failed initial deploys should clean up the sandbox or leave it unattached with an explicit recovery state.
   - Define the response shape for apply results, including per-step status and a top-level success flag that callers can rely on.
   - Add backlinks in `[[004-api-reference]]`, `[[008-agent-builder-ui]]`, `[[009-ruh-frontend]]`, and `[[011-key-flows]]`.

2. **Backend config-apply contract** (`ruh-backend/src/app.ts`):
   - Track each apply step as structured status (`kind`, `target`, `ok`, `detail`) instead of human-only log strings.
   - Return non-2xx or `{ ok: false }` when any required step fails; do not advertise success for partial applies.
   - Add optional post-write verification where practical: confirm `SOUL.md` exists, skill files were written, and cron registration returns the expected job metadata.
   - Keep backend logs actionable without leaking secrets or oversized command output.

3. **Frontend client handling** (`agent-builder-ui/lib/openclaw/agent-config.ts`):
   - Parse the backend’s real `ok` field and structured step results instead of converting every 200 response into success.
   - Propagate enough detail upward so deploy, hot-push, and Mission Control can show which step failed and on which sandbox.
   - Preserve a typed result shape that future release-history work can reuse.

4. **Initial deploy fail-closed behavior** (`agent-builder-ui/app/(platform)/agents/[id]/deploy/page.tsx`, backend if cleanup is chosen):
   - Do not attach the sandbox to the agent until both sandbox creation and config apply satisfy the new contract.
   - If config apply fails on first deploy, surface a clear terminal error and either clean up the new sandbox or leave it explicitly unattached according to the spec.
   - Do not show the final deployment screen as success when the sandbox is running without the requested SOUL/skills/triggers.

5. **Hot-push and Mission Control semantics** (`agent-builder-ui/app/(platform)/agents/create/page.tsx`, `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabMissionControl.tsx`):
   - Treat any failed sandbox update as an error or partial-success state, not unconditional `done`.
   - Show which instances succeeded vs. failed during multi-sandbox hot-push.
   - Keep the UI deterministic so users know when a redeploy or retry is required.

#### Test suite

**Backend unit/integration tests** (`ruh-backend/tests/unit/`, `ruh-backend/tests/integration/`):
- `configure-agent` returns failure when SOUL write, skill write, or cron registration fails
- Structured step results identify the failing step without requiring string parsing
- Verification logic catches a missing post-write artifact and flips the overall result to failure
- Happy-path config apply still returns success with all expected steps present

**Frontend tests** (`agent-builder-ui/`):
- `pushAgentConfig()` returns `ok: false` when backend responds with partial failure over HTTP 200
- Deploy page does not call `addSandboxToAgent()` or show success when config apply fails
- Create-page hot-push reports error or partial failure when any sandbox update fails
- Mission Control does not show `Config updated` on a failed apply

**E2E / flow tests** (`agent-builder-ui/e2e/`, backend route tests as needed):
- New deploy with a forced config-write failure ends in an error state and leaves no attached successful deployment
- Multi-instance hot-push with one failing sandbox surfaces the failed instance clearly instead of reporting blanket success
- Successful deploy still reaches the current happy path with readable step output

#### Evaluation — task is done when
- [x] `POST /api/sandboxes/:sandbox_id/configure-agent` no longer returns a success contract when required apply steps failed
- [x] `pushAgentConfig()` preserves backend failure semantics instead of converting every HTTP-200 response into success
- [x] Initial deploy does not attach a sandbox to an agent or show success until config apply succeeds
- [x] Hot-push and Mission Control distinguish full success from partial or failed config apply
- [ ] Tests cover backend apply failure, frontend deploy gating, and multi-instance hot-push failure handling
- [x] KB/API docs describe the new config-apply contract and no longer imply best-effort deployment success

---

### TASK-2026-03-25-25: Ship v1 Signed Webhook Triggers for Deployed Agents
- Status: `active`
- Owner: `unassigned`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `agent-builder-ui/app/(platform)/agents/create/_components/configure/StepSetTriggers.tsx`, `agent-builder-ui/app/(platform)/agents/create/_components/review/ReviewAgent.tsx`, `agent-builder-ui/hooks/use-agents-store.ts`, `agent-builder-ui/lib/openclaw/agent-config.ts`, `agent-builder-ui/app/(platform)/agents/[id]/deploy/page.tsx`, `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabMissionControl.tsx`, `ruh-backend/src/agentStore.ts`, `ruh-backend/src/app.ts`, `ruh-backend/tests/integration/`, `ruh-backend/tests/e2e/`, `docs/knowledge-base/`
- Summary: The builder UI already advertises event/webhook triggers, but the runtime only supports cron extracted from free-form agent rules. `StepSetTriggers` exposes selectable webhook cards, `ReviewAgent` reduces triggers to display text, `SavedAgent` and `AgentRecord` do not yet carry a first-class deployable trigger contract, and `configure-agent` only writes files plus `cron_jobs[]`. This task adds a real v1 webhook trigger runtime so deployed agents can receive external POST events through a signed URL instead of treating non-cron triggers as decorative copy.
- Next step: Start by writing `docs/knowledge-base/specs/SPEC-agent-webhook-trigger-runtime.md`, then lock a narrow v1 contract (`cron` plus `webhook.post`) before wiring persisted trigger definitions, signed inbound delivery, and deploy-time webhook provisioning.
- Blockers: `Depends on TASK-2026-03-25-02 for first-class trigger persistence in the agent model. Signing secrets should use a one-way hashed verifier so the v1 webhook path does not have to wait on TASK-2026-03-25-20. The spec and supported-trigger UX work can start immediately.`

#### Why this is important now

- `agent-builder-ui/app/(platform)/agents/create/_components/configure/StepSetTriggers.tsx` exposes an `Event / Webhook` category and preselects `webhook-post` when rules mention webhooks, so the UI implies webhook triggers are a supported deployment path today.
- `agent-builder-ui/app/(platform)/agents/create/_components/configure/mockData.ts` lists concrete trigger cards such as `Webhook POST`, `Message Received`, and `Service Alert`, but they are mock catalog entries with no backed runtime contract.
- `agent-builder-ui/hooks/use-agents-store.ts` and `ruh-backend/src/agentStore.ts` currently persist only `triggerLabel` plus generic `workflow` and `agentRules`; no deployed trigger endpoint, secret, or supported trigger type is modeled.
- `agent-builder-ui/lib/openclaw/agent-config.ts:buildCronJobs()` regex-scrapes a cron expression from `agentRules`, and `ruh-backend/src/app.ts` only accepts `cron_jobs` inside `configure-agent`, so non-cron trigger selections never become runtime behavior.
- `TASK-2026-03-25-02` will make trigger choices storable end-to-end, but without a real inbound trigger path the product will keep saving trigger selections that cannot actually fire.

#### What to build

1. **Feature spec first** (`docs/knowledge-base/specs/SPEC-agent-webhook-trigger-runtime.md`):
   - Define the supported v1 trigger surface explicitly: keep `cron` working, add `webhook.post`, and mark other trigger catalog entries as unsupported or coming soon until they have a runtime owner.
   - Specify the webhook URL shape, signature/secret contract, payload size and type limits, timeout budget, idempotency behavior, and whether the endpoint returns synchronous agent output or an accepted delivery record.
   - Add backlinks in `[[004-api-reference]]`, `[[008-agent-builder-ui]]`, `[[009-ruh-frontend]]`, and `[[011-key-flows]]`.

2. **Persist real trigger definitions** (`agent-builder-ui/hooks/use-agents-store.ts`, `ruh-backend/src/agentStore.ts`, compatible with `TASK-2026-03-25-02`):
   - Extend the saved agent shape from `triggerLabel` display text to a structured `triggers[]` contract that can represent at least `cron` and `webhook.post`.
   - Keep the persisted shape compatible with the existing configure-step work so trigger selections survive reloads and are available at deploy time without re-parsing prose rules.
   - Store only safe webhook metadata in normal read paths; do not echo raw signing secrets back once created.

3. **Backend webhook provisioning and invocation** (`ruh-backend/src/app.ts`, helper/store module as needed):
   - Generate a stable public webhook handle for each deployed `webhook.post` trigger and a server-generated signing secret or verifier.
   - Add a public inbound route such as `POST /api/triggers/webhooks/:public_id` that validates the signature or secret, resolves the target agent's active sandbox, and forwards the request body into the agent via the existing gateway/chat path using an isolated trigger session key.
   - Return a deterministic success or failure contract and reject unsigned, malformed, or unknown deliveries before any sandbox work runs.

4. **Builder and deploy UX alignment** (`agent-builder-ui/app/(platform)/agents/create/_components/configure/StepSetTriggers.tsx`, `agent-builder-ui/app/(platform)/agents/create/_components/review/ReviewAgent.tsx`, `agent-builder-ui/app/(platform)/agents/[id]/deploy/page.tsx`, `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabMissionControl.tsx`):
   - Make only the v1-supported triggers selectable for deployment, or clearly badge unsupported trigger cards as not yet deployable so the UI stops over-promising.
   - After deploy, surface the generated webhook URL and the one-time secret or reveal flow needed to connect an external system.
   - Show configured webhook triggers as masked metadata on later loads rather than rehydrating plaintext secrets into the browser.

5. **Docs and regression coverage** (`docs/knowledge-base/004-api-reference.md`, `docs/knowledge-base/008-agent-builder-ui.md`, `docs/knowledge-base/011-key-flows.md`, `ruh-backend/tests/integration/`, `ruh-backend/tests/e2e/`, frontend tests):
   - Document how webhook triggers are configured, signed, delivered, and debugged.
   - Add regression coverage for both the happy path and signature or availability failures.

#### Test suite

**Backend integration / E2E tests** (`ruh-backend/tests/integration/`, `ruh-backend/tests/e2e/`):
- Creating or updating an agent with a `webhook.post` trigger persists the trigger metadata without leaking the signing secret in read responses.
- A valid signed `POST /api/triggers/webhooks/:public_id` request reaches the target sandbox and produces the spec-selected success response.
- A missing or invalid signature returns `401` or `403` and never invokes the sandbox.
- Webhook delivery to an agent with no active sandbox returns a clear `409` or `412` style error instead of silently succeeding.

**Frontend tests** (`agent-builder-ui/`):
- `StepSetTriggers` distinguishes deployable vs. unsupported trigger cards and only persists the supported v1 selection.
- Review and deploy flows surface webhook provisioning info after a successful deploy and show masked configured state after refetch.
- `useAgentsStore` round-trips structured trigger definitions instead of collapsing everything into `triggerLabel`.

#### Evaluation — task is done when
- [ ] Deployed agents can expose at least one real signed inbound webhook trigger without manual DB edits
- [ ] Trigger selections survive save and load in a structured `triggers[]` shape instead of relying on display text or regex-parsed rules
- [ ] Valid webhook deliveries reach the target agent runtime, while invalid or unsigned deliveries fail before sandbox invocation
- [ ] The builder UI no longer implies that unsupported trigger catalog entries are deployable today
- [ ] Tests cover persisted trigger metadata, signed delivery success, signature rejection, and no-sandbox failure cases
- [ ] KB and API docs describe the new webhook-trigger contract and how it relates to existing cron triggers

### TASK-2026-03-25-31: Detect and Repair Sandbox Runtime Drift
- Status: `active`
- Owner: `unassigned`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `ruh-backend/src/app.ts`, `ruh-backend/src/docker.ts`, `ruh-backend/src/store.ts`, `ruh-backend/tests/unit/`, `ruh-backend/tests/integration/`, `ruh-backend/tests/e2e/`, `docs/knowledge-base/003-sandbox-lifecycle.md`, `docs/knowledge-base/004-api-reference.md`, `docs/knowledge-base/specs/`
- Summary: Sandbox runtime identity currently splits across PostgreSQL and Docker with no reconciliation layer. After creation, list/detail APIs trust only the `sandboxes` table, `DELETE /api/sandboxes/:sandbox_id` deletes the DB row before best-effort container removal, and `GET /api/sandboxes/:sandbox_id/status` falls back to record data when the gateway is unreachable. Manual Docker changes, failed cleanup, or crashed containers can therefore leave DB-only or container-only sandboxes that the product still presents as healthy-enough records. This task adds an explicit runtime-drift contract plus a repair path so operators and future health UI can trust sandbox inventory again.
- Next step: Start by writing `docs/knowledge-base/specs/SPEC-sandbox-runtime-reconciliation.md`, then add backend helpers that compare Postgres sandbox rows against Docker container state and surface explicit drift categories before wiring admin repair actions.
- Blockers: `None. This complements TASK-2026-03-25-04 (health dashboard), TASK-2026-03-25-12 (undeploy cleanup), and TASK-2026-03-25-21 (creation health), but none of those tasks add a repo-wide repair path once DB and Docker have already drifted.`

#### Why this is important now

- `ruh-backend/src/store.ts` treats the `sandboxes` table as the source for list/detail APIs, but the actual runtime lives in Docker containers named `openclaw-<sandbox_id>`.
- `ruh-backend/src/app.ts` currently removes the DB row first and calls `stopAndRemoveContainer(...).catch(() => {})`, so a failed Docker cleanup can immediately create an invisible orphan container.
- `GET /api/sandboxes/:sandbox_id/status` returns fallback record data when the gateway is unreachable, so callers do not get a truthful `missing container` or `gateway down` state.
- `ruh-frontend/components/MissionControlPanel.tsx` and `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabMissionControl.tsx` currently show `Running` based on `approved` or sandbox presence, so stale rows already look healthier than they are.
- There is no `docker ps` / `docker inspect` inventory scan, reconciliation report, or repair endpoint anywhere in the repo today.

#### What to build

1. **Feature spec first** (`docs/knowledge-base/specs/SPEC-sandbox-runtime-reconciliation.md`):
   - Define the authoritative runtime states for a sandbox: `healthy`, `gateway_unreachable`, `db_only`, `container_only`, `missing`, and any repairable sub-states needed by the implementation.
   - Specify which source of truth wins for runtime existence vs. metadata, and what the operator-facing repair actions are allowed to do.
   - Add backlinks in `[[003-sandbox-lifecycle]]`, `[[004-api-reference]]`, `[[005-data-models]]`, and `[[011-key-flows]]`.

2. **Docker inventory helpers** (`ruh-backend/src/docker.ts`, helper module if needed):
   - Add helpers to list repo-managed `openclaw-*` containers and inspect container running state without relying on gateway reachability alone.
   - Normalize Docker output so backend routes can compare `sandbox_id -> container state` deterministically in tests.
   - Keep the helpers narrow and reusable for both status routes and future cleanup flows.

3. **Backend reconciliation layer** (`ruh-backend/src/app.ts`, `ruh-backend/src/store.ts`):
   - Add a reconciliation function that joins Postgres sandbox rows with Docker inventory and classifies each sandbox into the spec-selected drift state.
   - Update `GET /api/sandboxes/:sandbox_id/status` so it reports explicit runtime truth instead of silently returning a normal-looking DB fallback when the container or gateway is unavailable.
   - Add an admin-only report endpoint such as `GET /api/admin/sandboxes/reconcile` that returns DB-only, container-only, and unhealthy sandbox entries in one operator-visible response.

4. **Explicit repair actions** (`ruh-backend/src/app.ts`, `ruh-backend/src/store.ts`, Docker helper):
   - Add narrowly scoped admin repair operations for the safe cases chosen in the spec, such as marking a DB-only sandbox missing, deleting a stale DB row, or removing an untracked orphan container.
   - Reuse the existing admin token pattern rather than inventing a second operator auth path.
   - Keep repair actions idempotent and return enough context for an operator to understand what changed.

5. **Docs and downstream contract alignment** (`docs/knowledge-base/003-sandbox-lifecycle.md`, `docs/knowledge-base/004-api-reference.md`, `docs/knowledge-base/011-key-flows.md`):
   - Document that sandbox inventory now distinguishes persisted metadata from live runtime state.
   - Make TASK-2026-03-25-04 consume `drift_state` / truthful status fields instead of building more UI on top of `approved` or raw record existence alone.
   - Note how this repair path interacts with TASK-2026-03-25-12 undeploy cleanup and TASK-2026-03-25-21 creation health changes so follow-on work does not duplicate lifecycle logic.

#### Test suite

**Backend unit tests** (`ruh-backend/tests/unit/`):
- Docker inventory helpers parse running, exited, and missing container cases deterministically.
- Reconciliation helper classifies `healthy`, `db_only`, and `container_only` cases correctly from mixed DB and Docker inputs.
- Repair helpers are idempotent when asked to re-run the same action on already-fixed state.

**Backend integration / E2E tests** (`ruh-backend/tests/integration/`, `ruh-backend/tests/e2e/`):
- `GET /api/sandboxes/:sandbox_id/status` on a missing container returns the spec-selected drift state instead of a misleading normal record.
- `GET /api/admin/sandboxes/reconcile` reports both DB-tracked missing containers and Docker-only orphan containers.
- The chosen admin repair action updates the DB and/or Docker runtime as expected and requires the admin token.

**Operator verification**:
- Manually stop or remove a sandbox container behind a persisted DB row and confirm the reconciliation report flags it clearly.
- Create or simulate an orphan `openclaw-*` container with no DB row and confirm the reconciliation report exposes it and the repair flow can remove it.
- Existing healthy sandboxes continue to report `healthy` without changing their public metadata shape unexpectedly.

#### Evaluation — task is done when
- [ ] Sandbox runtime drift is detectable via an explicit backend contract rather than being inferred from stale DB rows
- [ ] `GET /api/sandboxes/:sandbox_id/status` no longer masks missing containers or dead gateways as ordinary sandbox records
- [ ] Operators can list current DB-vs-Docker drift and run the safe repair actions defined by the spec
- [ ] Healthy sandboxes remain unaffected while drifted ones become obvious and actionable
- [ ] Backend tests cover drift classification, report output, and admin repair behavior
- [ ] KB/API docs describe the runtime-reconciliation contract and how downstream health UI should consume it

### TASK-2026-03-25-32: Persist Sandbox Provisioning Jobs Across Backend Restarts
- Status: `active`
- Owner: `Analyst-1`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `ruh-backend/src/app.ts`, `ruh-backend/src/store.ts`, `ruh-backend/src/sandboxManager.ts`, `ruh-backend/tests/e2e/`, `ruh-backend/tests/integration/`, `ruh-frontend/components/SandboxForm.tsx`, `agent-builder-ui/app/(platform)/agents/[id]/deploy/page.tsx`, `docs/knowledge-base/003-sandbox-lifecycle.md`, `docs/knowledge-base/004-api-reference.md`, `docs/knowledge-base/005-data-models.md`, `docs/knowledge-base/specs/`
- Summary: Sandbox creation state currently lives only in the backend process. `POST /api/sandboxes/create` just inserts a `pending` entry into the in-memory `_streams` map, `GET /api/sandboxes/stream/:stream_id` consumes that entry and drives `createOpenclawSandbox()`, and both frontends rely on one uninterrupted EventSource for a 2-5 minute flow. If the backend restarts, deploys, or crashes during provisioning, the repo loses the job handle, buffered progress, and final outcome even though Docker work may already be in flight or a partial container may already exist. TASK-2026-03-25-19 improves reconnectability inside one process, but it does not yet give sandbox provisioning a restart-safe persistence contract.
- Next step: Start by writing `docs/knowledge-base/specs/SPEC-sandbox-provisioning-job-persistence.md`, then replace the in-memory-only create-job state with a persisted provisioning-job ledger that survives backend restart and can resume or reconcile the create outcome.
- Blockers: `None. This should be designed alongside TASK-2026-03-25-19 so the durable-stream refactor does not stop at process-local recovery.`

#### Why this is important now

- `ruh-backend/src/app.ts` defines `_streams` as a process-local `Map<string, StreamEntry>`, so a backend restart erases every active create job immediately.
- `POST /api/sandboxes/create` currently returns only `{ stream_id }`; there is no persisted job row, replay buffer, or durable status record a restarted backend can reload.
- `GET /api/sandboxes/stream/:stream_id` is the only place that currently runs the async generator, so restart during provisioning can strand the user between "no stream found" and an unknown Docker runtime state.
- `ruh-frontend/components/SandboxForm.tsx` and `agent-builder-ui/app/(platform)/agents/[id]/deploy/page.tsx` each open one EventSource and treat stream loss as terminal failure; neither has a crash-recovery path.
- The existing durable-stream task covers reconnect after transient disconnect and moving work start to `POST`, but its current outline still uses an in-memory job object plus TTL cleanup. That is not sufficient for backend restart, pod replacement, or deploy-time process churn.

#### What to build

1. **Feature spec first** (`docs/knowledge-base/specs/SPEC-sandbox-provisioning-job-persistence.md`):
   - Define the persisted provisioning-job lifecycle and whether `stream_id` stays the public handle or becomes an alias of a durable `job_id`.
   - Specify restart semantics: how an in-flight create job is recovered, how terminal state is exposed after restart, and when an operator must intervene.
   - Add backlinks in `[[003-sandbox-lifecycle]]`, `[[004-api-reference]]`, and `[[005-data-models]]`.

2. **Persisted provisioning-job ledger** (`ruh-backend/src/store.ts` or a dedicated store module):
   - Add a first-class persisted create-job record with fields such as job ID, requested sandbox name, status, last event sequence, partial sandbox metadata, terminal result/error, timestamps, and retention metadata.
   - Persist progress updates as the create flow advances so a fresh backend process can reconstruct current state instead of depending on `_streams`.
   - Keep the model compact enough for polling/replay but explicit enough to distinguish `pending`, `running`, `result`, `approved`, `error`, `abandoned`, and `reconciling` style states if the spec needs them.

3. **Restart recovery / reconciliation loop** (`ruh-backend/src/app.ts`, `ruh-backend/src/index.ts`, `ruh-backend/src/sandboxManager.ts`):
   - On startup, reload incomplete provisioning jobs and reconcile them against Docker/container state before accepting new stream subscribers.
   - Decide per spec whether active jobs resume execution, mark themselves recoverable-but-stopped, or transition into an explicit operator-repair state when the previous process died mid-flight.
   - Ensure partial success cases (for example container exists but result was never persisted) are surfaced deterministically instead of disappearing into a missing `_streams` entry.

4. **Status and streaming contract** (`ruh-backend/src/app.ts`):
   - Keep SSE for live progress, but make `GET /api/sandboxes/stream/:stream_id` read from persisted job state so reconnect after restart replays known progress and terminal outcome.
   - Add or formalize a non-SSE status/read endpoint for provisioning jobs so clients can recover even when EventSource cannot reconnect immediately.
   - Preserve compatibility with TASK-2026-03-25-19 where possible so transient-disconnect recovery and restart recovery share one job model instead of diverging implementations.

5. **Frontend recovery path and docs** (`ruh-frontend/components/SandboxForm.tsx`, `agent-builder-ui/app/(platform)/agents/[id]/deploy/page.tsx`, KB/docs above):
   - Persist the active create/deploy job handle in UI state long enough to recover after a page reload or backend restart.
   - Distinguish "backend restarted, reconnecting to provisioning job" from generic create failure so users do not blindly resubmit and create duplicates.
   - Update KB/API docs so sandbox creation is documented as crash-recoverable only once the persisted-job contract exists.

#### Test suite

**Backend integration / E2E tests** (`ruh-backend/tests/integration/`, `ruh-backend/tests/e2e/`):
- Create job starts, backend process state is reinitialized, and the job status can still be queried/replayed from persisted state
- Restart after container creation but before terminal SSE delivery exposes a deterministic recoverable or terminal job state instead of `404 stream_id not found`
- Completed jobs remain queryable through the documented retention window after restart
- Duplicate create submissions after restart can detect or reconcile the existing in-flight job rather than blindly spawning a second container if the spec chooses that behavior

**Backend unit tests** (`ruh-backend/tests/unit/`):
- Provisioning-job persistence writes ordered event/status transitions and reloads them correctly on startup
- Recovery logic classifies incomplete jobs using persisted state plus Docker inspection without requiring the original in-memory map
- Cleanup/retention logic removes expired terminal jobs without touching active or recoverable ones

**Frontend tests** (`ruh-frontend/__tests__/components/SandboxForm.test.tsx`, `agent-builder-ui` coverage as appropriate):
- A saved provisioning job handle can reconnect after simulated backend restart and continue rendering progress or terminal result
- UI shows a restart-recovery state instead of immediately inviting blind retry when the backend disappears mid-create
- Deploy flow does not attach a sandbox to an agent twice if recovery returns the original job outcome after restart

#### Evaluation — task is done when
- [ ] Backend restart during sandbox provisioning no longer loses the create job state behind an empty `_streams` map
- [ ] Clients can recover progress or terminal outcome for an in-flight create job after backend restart without blindly creating a new sandbox
- [ ] Partial-create states are classified explicitly instead of surfacing as `404 stream_id not found`
- [ ] The persisted job model composes with TASK-2026-03-25-19 instead of creating a second incompatible provisioning flow
- [ ] Backend and frontend tests cover restart recovery, terminal replay, and duplicate-submit guardrails
- [ ] KB/API docs describe the persisted provisioning-job contract and its restart semantics

### TASK-2026-03-25-33: Make Architect Bridge Retries Idempotent and Cancelable
- Status: `active`
- Owner: `unassigned`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `agent-builder-ui/app/api/openclaw/route.ts`, `agent-builder-ui/lib/openclaw/api.ts`, `agent-builder-ui/hooks/use-openclaw-chat.ts`, `agent-builder-ui/e2e/`, `docs/knowledge-base/008-agent-builder-ui.md`, `docs/knowledge-base/specs/`
- Summary: The architect bridge currently retries the whole gateway run whenever the transport drops, but each retry generates a fresh `chat.send` `idempotencyKey` and the client has no abort path for an in-flight request. In `agent-builder-ui/app/api/openclaw/route.ts`, `connectWithRetry()` wraps the entire `chat.send` flow, `forwardToGateway()` sends `randomUUID()` as the idempotency key on every attempt, and the same route still auto-approves tool executions. In `agent-builder-ui/lib/openclaw/api.ts` and `hooks/use-openclaw-chat.ts`, architect requests cannot be canceled when the user navigates away or starts over. A disconnect after `chat.send` is accepted can therefore duplicate the same logical architect run, repeat tool side effects, and confuse the create flow with multiple responses for one user message.
- Next step: Start by writing `docs/knowledge-base/specs/SPEC-architect-bridge-retry-safety.md`, then add a stable per-message request ID from client to bridge and stop blind post-send retries until the route can prove it is resuming the same logical run instead of resubmitting it.
- Blockers: `None. This complements TASK-2026-03-25-06 (architect isolation), TASK-2026-03-25-14 (approval guardrails), and [[SPEC-agent-builder-gateway-error-reporting]], but none of those currently make transport retries safe after a run has already been accepted.`

#### Why this is important now

- `agent-builder-ui/app/api/openclaw/route.ts` retries on any non-auth transport failure, even after the request may already have crossed the `chat.send` boundary.
- The bridge sends `idempotencyKey: randomUUID()` inside `chat.send`, so every retry is treated as a new logical run instead of a retry of the same run.
- The same bridge still auto-approves `exec.approval.requested` events, which means duplicate runs can also duplicate tool execution side effects.
- `agent-builder-ui/lib/openclaw/api.ts` exposes no `AbortSignal`, and `hooks/use-openclaw-chat.ts` has no way to cancel an architect request during navigation, reset, or user retry.

#### What to build

1. **Feature spec first** (`docs/knowledge-base/specs/SPEC-architect-bridge-retry-safety.md`):
   - Define safe retry semantics for the architect bridge: which failures are safe to retry automatically, when a request becomes non-retriable, and how the UI should surface "run may still be in progress" states.
   - Document cancellation semantics, request identity, and how this work composes with `[[SPEC-agent-builder-gateway-error-reporting]]`, TASK-2026-03-25-06, and TASK-2026-03-25-14.
   - Add backlinks in `[[008-agent-builder-ui]]` and `[[001-architecture]]`.

2. **Stable logical request identity** (`agent-builder-ui/lib/openclaw/api.ts`, `agent-builder-ui/hooks/use-openclaw-chat.ts`):
   - Generate one stable request ID per user message before the bridge call starts.
   - Send that request ID to `/api/openclaw` and reuse it for every safe retry of the same logical message.
   - Stop generating a brand-new gateway idempotency key on each retry attempt.

3. **Retry state machine in the bridge** (`agent-builder-ui/app/api/openclaw/route.ts`):
   - Distinguish failures before `chat.send` is acknowledged from failures after the gateway has already accepted the run.
   - Retry automatically only while the bridge can prove the request has not crossed the "run accepted" boundary.
   - After `chat.send` acknowledgement or `runId` assignment, either resume/reattach using the same logical request if the protocol supports it or surface a structured recoverable error instead of blindly resending.
   - Log retry stage plus request ID so duplicate-run investigations are possible.

4. **Cancellation and disconnect handling** (`agent-builder-ui/lib/openclaw/api.ts`, `agent-builder-ui/hooks/use-openclaw-chat.ts`, `agent-builder-ui/app/api/openclaw/route.ts`):
   - Add `AbortSignal` support to `sendToArchitectStreaming()` and wire it from the create flow.
   - Cancel in-flight bridge requests on route change, reset, or replacement request.
   - Stop retry timers and close the WebSocket when the HTTP client disconnects. If the gateway supports explicit abort, send it; otherwise fail closed without starting another attempt.

5. **Docs and regression coverage** (`agent-builder-ui/`, KB/spec files above):
   - Add route-level tests with mocked WebSocket frames so retry stages are regression-testable.
   - Update the KB to describe architect retry/cancel behavior once the contract is implemented.
   - Keep create-flow UX explicit when a run may still be finishing in the background so users do not spam resend.

#### Test suite

**Bridge route tests** (`agent-builder-ui/app/api/openclaw/route.test.ts` or equivalent Bun-covered route harness):
- Failure before `chat.send` acknowledgement retries with the same logical request ID.
- Failure after `chat.send` acknowledgement does not emit a second logical run with a new idempotency key.
- Client disconnect or abort stops scheduled retries and closes the socket.

**Client tests** (`agent-builder-ui/lib/openclaw/`, `agent-builder-ui/hooks/`):
- `sendToArchitectStreaming()` honors `AbortSignal` and exits without waiting for a terminal `result` after cancellation.
- `useOpenClawChat()` ignores stale completions from an aborted request and allows a fresh retry cleanly.

**E2E / interaction tests** (`agent-builder-ui/e2e/`):
- A transient bridge failure during architect chat surfaces one recoverable error or resumed run, not duplicate architect replies for one user message.
- Navigating away from `/agents/create` during an in-flight architect run does not keep emitting bridge retry/tool-execution status back into a dead session.

#### Evaluation — task is done when
- [ ] One user message maps to one stable architect request ID across safe retries
- [ ] The bridge no longer blindly resends `chat.send` after the gateway has already accepted the run
- [ ] Users can cancel or abandon an in-flight architect request without leaving background retries running
- [ ] Retry behavior is explicit and regression-tested for pre-send failure, post-send failure, and client disconnect
- [ ] KB/spec docs describe the architect retry-safety contract and its relationship to existing gateway error-reporting and approval tasks

### TASK-2026-03-25-39: Add control-plane audit trail for sensitive actions
- Status: `completed`
- Owner: `Worker-1`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `ruh-backend/src/app.ts`, `ruh-backend/src/auditStore.ts`, `ruh-backend/src/startup.ts`, `ruh-backend/tests/unit/auditStore.test.ts`, `ruh-backend/tests/unit/auditApp.test.ts`, `ruh-backend/tests/unit/startup.test.ts`, `docs/knowledge-base/001-architecture.md`, `docs/knowledge-base/002-backend-overview.md`, `docs/knowledge-base/004-api-reference.md`, `docs/knowledge-base/005-data-models.md`, `docs/knowledge-base/specs/SPEC-control-plane-audit-log.md`, `docs/journal/2026-03-25.md`, `/Users/prasanjitdey/.codex/automations/worker-1/memory.md`
- Summary: Completed the first backend-owned control-plane audit slice. `ruh-backend` now creates a durable `control_plane_audit_events` table at startup, records redacted audit rows for representative sensitive mutations (sandbox delete, agent delete, configure-agent, LLM reconfigure, shared-Codex retrofit, cron writes, channel writes, and pairing approvals), and exposes `GET /api/admin/audit-events` for bounded admin queries.
- Next step: Extend the same audit contract into the architect bridge once approval guardrails land, and add higher-fidelity integration coverage when the Bun/supertest listener issue is fixed.
- Blockers: `Depends on TASK-2026-03-25-09 for full caller identity on ordinary backend routes, but the event taxonomy, storage contract, admin-token coverage, and redaction policy can start immediately.`

#### Why this is important now

- `ruh-backend/src/app.ts` exposes destructive or sensitive mutations such as `DELETE /api/sandboxes/:sandbox_id`, `POST /api/sandboxes/:sandbox_id/configure-agent`, `POST /api/sandboxes/:sandbox_id/reconfigure-llm`, `POST|PATCH|DELETE /api/sandboxes/:sandbox_id/crons*`, `PUT /api/sandboxes/:sandbox_id/channels/*`, conversation rename/delete routes, and `POST /api/admin/sandboxes/:sandbox_id/retrofit-shared-codex`, but none of them persist actor, target, or outcome metadata after the request returns.
- TASK-2026-03-25-09 explicitly plans to expose validated caller context for downstream handlers and audit logging, but there is no separate backlog item that actually defines or stores those audit events once auth succeeds.
- TASK-2026-03-25-18 (sandbox secret redaction/reveal) expects explicit reveal logging, TASK-2026-03-25-14 (architect approval guardrails) calls out the lack of an approval audit trail, and TASK-2026-03-25-07 (release history) only versions applied config snapshots rather than broader operational actions.
- Without a durable audit log, upcoming security work will still leave the product unable to answer who deleted a sandbox, changed live credentials, approved a dangerous tool run, or revealed a connection secret.

#### What to build

1. **Feature spec first** (`docs/knowledge-base/specs/SPEC-control-plane-audit-log.md`):
   - Define the audit-event taxonomy for high-risk actions across backend control-plane routes and architect approval decisions.
   - Specify required metadata: actor identity, request origin, action type, target type/ID, outcome, timestamp, request ID, and safe structured details.
   - Define redaction rules so secrets, bearer tokens, gateway tokens, prompt bodies, and raw tool credentials never land in the audit payload.
   - Add backlinks in `[[001-architecture]]`, `[[004-api-reference]]`, and `[[008-agent-builder-ui]]`.

2. **Durable backend audit ledger** (`ruh-backend/src/`, new store/module as needed):
   - Add a first-class persisted audit-event store such as `control_plane_audit_events` instead of relying on console logs.
   - Support writes from both ordinary authenticated routes and existing admin-token flows.
   - Keep the write path lightweight and deterministic so high-value mutations can record success/failure without leaking secret material or blocking indefinitely on logging side effects.

3. **Route instrumentation for the highest-risk actions** (`ruh-backend/src/app.ts`, related helpers/stores):
   - Record audit events for sandbox delete/create-failure cleanup decisions, configure-agent, LLM reconfigure, cron create/edit/delete/run, channel config changes, pairing approval, agent delete, and any future sandbox secret reveal endpoint.
   - Include normalized caller context when available and fall back to explicit admin/service actor labels where auth has not landed yet.
   - Record both successful mutations and the policy-relevant denials or failures defined in the spec when those outcomes matter for investigations.

4. **Architect approval and bridge audit hooks** (`agent-builder-ui/app/api/openclaw/route.ts`, shared helpers if needed):
   - Emit audit events for architect approval decisions once TASK-2026-03-25-14 lands, including auto-allowed, manually approved, denied, and timed-out requests.
   - Capture enough safe metadata to explain what was requested without storing raw secret-bearing command payloads unnecessarily.
   - Keep the bridge audit contract aligned with the future authenticated BFF/session model instead of inventing a one-off actor format.

5. **Admin query surface and docs** (`ruh-backend/src/app.ts`, KB/API notes above, lightweight frontend follow-up only if needed):
   - Add an admin-only audit query endpoint such as `GET /api/admin/audit-events` with bounded filters for actor, target, action type, outcome, and time range.
   - Document retention, pagination, and which roles may read audit events.
   - Make release history, secret reveal, and approval-policy work reference this audit contract instead of inventing separate ad hoc history mechanisms.

#### Test suite

**Backend unit tests** (`ruh-backend/tests/unit/`):
- Audit-event serializer redacts or drops secret-bearing fields consistently.
- Event-store helpers persist actor/target/outcome metadata deterministically and remain idempotent for repeated writes where the spec requires it.
- Request/admin context mapping produces the expected actor shape for bearer-auth, admin-token, and service-generated events.

**Backend integration/security tests** (`ruh-backend/tests/integration/`, `ruh-backend/tests/security/`):
- Representative mutations such as sandbox delete, cron create, channel update, and LLM reconfigure emit persisted audit rows with the expected action metadata.
- Audit payloads never store raw gateway tokens, preview tokens, tool credentials, or other secret values from the triggering request.
- The admin audit-query endpoint requires the documented auth/admin boundary and filters results predictably.

**Bridge / route tests** (`agent-builder-ui/`, backend route harnesses as needed):
- Approval allow/deny/timeout decisions emit the expected audit events once the approval-policy task is wired.
- Auth or policy failures that should be visible to operators are captured with the documented outcome code without masquerading as successful actions.

#### Evaluation — task is done when
- [ ] Sensitive control-plane mutations create durable audit events instead of relying on transient console logs
- [ ] Audit rows capture actor, target, action, timestamp, and outcome without storing raw secret material
- [ ] Admins can query recent audit history with bounded filters through a documented backend contract
- [ ] Secret reveal, approval-policy, and release-history work can reference one shared audit model instead of inventing separate history stores
- [ ] Backend tests prove both event creation and secret redaction behavior
- [ ] KB/spec docs describe the control-plane audit boundary and how future agents should extend it

### TASK-2026-03-25-42: Add abuse-rate limiting for expensive control-plane routes
- Status: `active`
- Owner: `Analyst-1`
- Started: `2026-03-25`
- Updated: `2026-03-25`
- Areas: `TODOS.md`, `ruh-backend/src/app.ts`, `ruh-backend/src/requestAuth.ts`, `ruh-backend/tests/security/`, `ruh-backend/tests/e2e/`, `agent-builder-ui/app/api/openclaw/route.ts`, `agent-builder-ui/lib/openclaw/api.ts`, `agent-builder-ui/e2e/`, `docs/knowledge-base/001-architecture.md`, `docs/knowledge-base/002-backend-overview.md`, `docs/knowledge-base/004-api-reference.md`, `docs/knowledge-base/008-agent-builder-ui.md`, `docs/knowledge-base/specs/`
- Summary: The repo still has no route-level abuse controls for its most expensive control-plane operations. `ruh-backend/src/app.ts` exposes sandbox creation, chat proxying, config pushes, cron mutation, and channel mutation with no rate limiting, concurrency guard, or `429` contract, while `agent-builder-ui/app/api/openclaw/route.ts` accepts unlimited architect runs and retries them against a shared privileged gateway. Existing backlog items cover auth, ownership, request validation, secret handling, quotas for sandbox creation, and architect isolation, but none define a general throttling boundary that stops one user, buggy client, or anonymous caller from burning Docker capacity, shared gateway slots, or provider spend through repeated requests.
- Next step: Start by writing `docs/knowledge-base/specs/SPEC-control-plane-rate-limits.md`, then add one shared limiter module and enforce it first on `POST /api/sandboxes/create`, `POST /api/sandboxes/:sandbox_id/chat`, and `POST /api/openclaw` with deterministic `429` responses and `Retry-After` headers.
- Blockers: `Depends partly on TASK-2026-03-25-09 and TASK-2026-03-25-24 for the strongest caller identity on every route, but an IP/session/admin-token fallback policy and the first expensive-route protections can start immediately. This complements TASK-2026-03-25-19 rather than duplicating it: quotas control sandbox-create admission, while this task defines broader request-throttling across backend and architect control-plane paths.`

#### Why this is important now

- `ruh-backend/src/app.ts` registers expensive mutation and proxy routes behind plain `express.json()` + CORS with no limiter middleware, no `429` handling, and no `Retry-After` contract anywhere in the API surface.
- `POST /api/sandboxes/create` can start multi-minute Docker provisioning work, but today nothing prevents rapid repeated submissions beyond the separate planned create-idempotency/quota task.
- `POST /api/sandboxes/:sandbox_id/chat` can forward arbitrarily many long-running gateway requests for the same sandbox with no per-sandbox, per-conversation, or per-caller throttle even before backend auth lands.
- `agent-builder-ui/app/api/openclaw/route.ts` accepts any POST body with `session_id` and `message`, opens a privileged gateway socket, and will retry failed attempts up to three times, but it has no concurrency cap or caller-level throttling of its own.
- `docs/knowledge-base/004-api-reference.md` documents no `429` outcomes for any expensive route, so clients currently have no explicit backoff contract and may keep retrying into overload.

#### What to build

1. **Feature spec first** (`docs/knowledge-base/specs/SPEC-control-plane-rate-limits.md`):
   - Define the abuse-control contract for expensive backend and builder routes: keying strategy, rate windows, concurrency caps, and which routes return `429` vs other errors.
   - Specify how limits key requests before and after auth lands: authenticated user/workspace when available, otherwise IP/session/admin-token fallbacks.
   - Document required response headers/body (`Retry-After`, stable error shape, optional policy hint) and add backlinks in `[[001-architecture]]`, `[[002-backend-overview]]`, `[[004-api-reference]]`, and `[[008-agent-builder-ui]]`.

2. **Shared limiter primitive** (`ruh-backend/src/`, `agent-builder-ui/` helper as needed):
   - Add a reusable limiter module that can enforce short-window request throttles plus bounded in-flight concurrency for long-running routes.
   - Make the policy route-aware instead of one global ceiling; sandbox creation, chat proxy, cron mutation, and architect runs should have different budgets.
   - Keep the limiter fail-closed when limits are exceeded but fail-open only in explicitly documented development scenarios.

3. **First-pass backend protection** (`ruh-backend/src/app.ts`, `ruh-backend/src/requestAuth.ts` if needed):
   - Enforce limits on `POST /api/sandboxes/create`, `POST /api/sandboxes/:sandbox_id/chat`, and one representative mutation route such as `POST /api/sandboxes/:sandbox_id/configure-agent` or cron create/edit.
   - Return deterministic `429` JSON responses with `Retry-After` so first-party clients can distinguish overload from auth or validation failures.
   - Include enough key metadata for later audit/debug work without logging raw request bodies, prompts, or secrets.

4. **Architect bridge protection** (`agent-builder-ui/app/api/openclaw/route.ts`, `agent-builder-ui/lib/openclaw/api.ts`):
   - Add route-level throttling and in-flight session limits so one browser session or caller cannot fan out unlimited architect runs against the shared gateway.
   - Ensure retry logic respects the limiter contract and does not convert a local retry storm into more upstream load.
   - Surface `429` responses distinctly in the client so the create flow can back off or show a “try again later” state instead of a fake gateway outage.

5. **Client/backoff contract and docs** (`agent-builder-ui/lib/openclaw/api.ts`, `ruh-frontend/` chat/create flows, KB notes above):
   - Teach first-party clients to honor `Retry-After` and stop immediate hammer retries on expensive endpoints.
   - Keep create/chat UX explicit when the system is throttling rather than letting the UI look stuck or broken.
   - Update the API reference and architecture notes so future routes inherit the same overload contract instead of inventing ad hoc behavior.

#### Test suite

**Backend security/integration tests** (`ruh-backend/tests/security/`, `ruh-backend/tests/e2e/`):
- Repeated `POST /api/sandboxes/create` calls from the same limiter key eventually return `429` with a stable error payload and `Retry-After`
- Repeated or concurrent `POST /api/sandboxes/:sandbox_id/chat` requests hit the configured limit before the gateway client is invoked beyond the allowed budget
- Representative mutation route throttling returns `429` without executing downstream Docker or store side effects

**Bridge / client tests** (`agent-builder-ui/`):
- `POST /api/openclaw` rejects over-budget callers before opening a WebSocket connection
- Bridge retries respect the limiter state and do not spawn extra upstream attempts after a local `429`
- `sendToArchitectStreaming()` surfaces throttle responses distinctly from auth and gateway failures

**E2E / interaction tests** (`agent-builder-ui/e2e/`, `ruh-frontend/e2e/`):
- Hammering architect chat from one session produces a clear throttled state instead of duplicate concurrent runs
- Repeated sandbox-create submits from the UI back off cleanly and show a retry-later message rather than spinning forever
- First-party clients honor the documented `Retry-After` contract instead of immediately resubmitting

#### Evaluation — task is done when
- [ ] Expensive backend and architect routes enforce documented rate or concurrency limits instead of accepting unlimited requests
- [ ] Over-budget requests return deterministic `429` responses with `Retry-After` and no downstream side effects
- [ ] First-party clients distinguish throttling from auth, validation, and gateway-connectivity failures
- [ ] Sandbox-create quotas and request throttling have a documented relationship instead of overlapping ambiguously
- [ ] Tests cover backend create/chat throttling plus architect-bridge throttling behavior
- [ ] KB/spec docs describe the overload and backoff contract future agents should reuse

## Deferred / Backlog

### Deferred from Agent Settings Tab (SPEC-agent-model-settings)

#### TODO-002: Live model fetch in TabSettings
**What:** When the Settings tab is opened, call `GET /api/sandboxes/:sandbox_id/models` and merge the response with the curated model list. Show a visual indicator for which models are actually available in the active sandbox (vs. listed but not configured).

**Why:** The curated list shows all possible models, but only providers with API keys in the sandbox will work. Showing availability at a glance prevents confusion.

**Cons:** Adds loading state and error handling to TabSettings. The endpoint currently returns a synthetic fallback list (`openclaw-default`) when the gateway is unreachable — the enhancement is only useful once the gateway reliably exposes real model lists.

**Context:** The endpoint exists at `GET /api/sandboxes/:sandbox_id/models` (see `004-api-reference.md`). The fallback is `syntheticModels()` in `ruh-backend/src/utils.ts`. Start here: `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabSettings.tsx`.

**Depends on:** Agent Settings Tab PR merged. More useful after TODO-001 is done (gateway will expose real model lists once provider switching works).
