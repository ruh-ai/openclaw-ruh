# Architecture Review: Paperclip + OpenSpace Integration Patterns

[[000-INDEX|← Index]] | [[SPEC-competitive-intelligence-learnings|Spec]] | [[001-architecture|Architecture]] | [[002-backend-overview|Backend]]

**Reviewer:** Agent Architect (cc02418e)
**Date:** 2026-03-30
**Issue:** RUH-12 (child of RUH-9)
**Branch:** `prasanjit/competitive-learnings-spec`

---

## 1. OpenSpace MCP Integration Pattern

### Current State
`openspaceClient.ts` does NOT actually call `execute_task` via MCP. It implements a lightweight **heuristic pattern detector** that:
1. Writes execution logs as JSON files to `/root/agent/.execution-logs/` inside the sandbox container via `dockerExec()`
2. Reads the last 10 logs by shelling out (`ls -t | head -10 | cat`)
3. Extracts tool-call sequences and counts repeats
4. Proposes CAPTURED skills when a sequence appears 3+ times

### Assessment: Right pattern, wrong name
The file is named `openspaceClient` but doesn't use OpenSpace at all yet. This is fine for Phase 1 — the heuristic gives us data to validate the skill capture concept before investing in full LLM-powered analysis. But the naming creates false expectations.

### Recommendations

| # | Finding | Severity | Recommendation |
|---|---------|----------|----------------|
| 1.1 | File named `openspaceClient.ts` but doesn't call OpenSpace | Low | Rename to `skillAnalyzer.ts` or `executionAnalyzer.ts`. Reserve `openspaceClient.ts` for when MCP integration lands. |
| 1.2 | No timeout on `dockerExec` calls | Medium | The `detectRepeatablePatterns` function shells out 3 times (mkdir, write, ls+cat). If a container is hung, these block indefinitely. Add a per-call timeout (e.g., 10s). |
| 1.3 | No circuit breaker for OpenSpace-down scenario | Low | Currently N/A since we don't call OpenSpace. When we do, add a circuit breaker (similar to `paperclipClient.ts`'s health cache) so a slow/down OpenSpace doesn't pile up pending calls. |
| 1.4 | Shell injection risk in log write | **High** | Line 79: `echo '${escaped}' > ${logPath}` — the `escaped` variable uses single-quote escaping, but `execution.responseContent` could contain shell metacharacters that survive the `replace(/'/g, "'\\''")` escaping in edge cases. **Use `docker.shellQuote()` from `docker.ts`** instead of manual escaping, or better yet, pipe via stdin: `echo <base64> \| base64 -d > ${logPath}`. |

### OpenSpace Integration Readiness
When we wire up real OpenSpace MCP `execute_task`:
- It should be called **from the backend** (not from inside the sandbox), since the MCP server runs on the host machine
- Use a dedicated async worker/queue, not inline in the fire-and-forget chain — LLM analysis could take 10-30s
- The current heuristic should remain as a fast pre-filter: only send to OpenSpace when the heuristic detects something worth analyzing

---

## 2. Fire-and-Forget Hooks in app.ts

### Current Hooks
| Hook | Trigger | Location |
|------|---------|----------|
| `provisionPaperclipCompany` | Agent creation (forge) | Line ~977 |
| `provisionPaperclipCompany` | Agent promotion | Line ~1406 |
| `teardownPaperclipCompany` | Agent deletion | Line ~839 |
| `recordAndAnalyze` | Post-chat (SSE stream complete) | Line ~2316 |

### Assessment: Mostly robust, one structural gap

**Good:**
- All hooks use `.catch()` to swallow errors — chat/creation never blocked
- `paperclipClient.ts` has a 5s timeout and health cache (30s TTL) — good protection
- `isAvailable()` check is cheap and cached

**Concerns:**

| # | Finding | Severity | Recommendation |
|---|---------|----------|----------------|
| 2.1 | Double provisioning on promote | Medium | `provisionPaperclipCompany` is called at both creation AND promotion. The function does check `if (agent.paperclip_company_id)` to skip re-provisioning, but if the first call is still in-flight when promotion fires, you could get a race condition creating two Paperclip companies. Add a simple in-memory lock (agent ID → Promise) or use a database-level `INSERT ... ON CONFLICT` pattern. |
| 2.2 | `teardownPaperclipCompany` is a no-op | Low | It just logs. Fine for now, but should be tracked as tech debt. When Paperclip adds cascade delete, wire it up. |
| 2.3 | No error categorization | Low | All hook failures log to `console.warn` with no distinction between transient (network timeout) and permanent (invalid company ID) errors. Consider logging a structured system event so the Mission Control dashboard can show "Paperclip integration degraded" instead of silence. |
| 2.4 | Post-chat hook does an extra DB read | Medium | `recordAndAnalyze` at line 2314 calls `agentStore.getAgentBySandboxId()` to find the agent. This is a DB query on every chat completion. The agent record is likely already loaded earlier in the request — pass it through instead of re-reading. |

---

## 3. Data Flow: Execution → Logs → Patterns → Skills

### Current Flow
```
Chat SSE completes
  → collector.buildExecutionSummary()     [in-memory, fast]
  → agentStore.getAgentBySandboxId()      [DB read]
  → recordAndAnalyze()                    [fire-and-forget]
    → openspace.recordAndAnalyzeExecution()
      → dockerExec: mkdir -p              [shell out]
      → dockerExec: echo > logPath        [shell out - write log]
      → dockerExec: ls skills/ | wc -l    [shell out - count skills]
      → dockerExec: ls logs/ | wc -l      [shell out - count logs]
      → detectRepeatablePatterns()
        → dockerExec: ls -t | head -10 | cat  [shell out - read 10 logs]
        → Parse JSON, count sequences
        → Return proposals
```

### Race Condition Analysis

| Scenario | Risk | Impact |
|----------|------|--------|
| Two concurrent chats for same agent | **Medium** | Both write logs simultaneously. File writes to different filenames (timestamp-based) so no data corruption. But `detectRepeatablePatterns` reads "last 10" — if both read at the same moment, they see the same 10 logs and may both propose the same skill. **Mitigation:** Skill proposals are idempotent (deduplicate by skill name before surfacing to user). |
| Chat completes while previous analysis is still running | **Low** | The `dockerExec` calls are sequential within one `recordAndAnalyze` call, but two calls can interleave. The `mkdir -p` is safe. The log write uses unique timestamps. The pattern detection is read-only after the write. No corruption risk. |
| Container restart during analysis | **Low** | `dockerExec` will fail, caught by try/catch, returns null. No partial state left behind. |

### Recommendations

| # | Finding | Severity | Recommendation |
|---|---------|----------|----------------|
| 3.1 | 5 sequential `dockerExec` calls per chat | Medium | Each is a `docker exec` subprocess spawn. For a busy agent, this is 5 process spawns per chat message. Consider batching into a single shell script: write one script, execute once. |
| 3.2 | Log filenames use `new Date().toISOString()` with `-` replacement | Low | Two logs in the same millisecond would collide. Add a random suffix or use a UUID. |
| 3.3 | `responseSummary` truncated to 2000 chars | Low | Fine for pattern detection, but when we do full LLM analysis, we'll need the complete response. Consider storing full content compressed, or storing a reference to the persisted message ID instead. |
| 3.4 | Pattern detection is O(n) per chat | Low | Reading 10 JSON files and parsing them is cheap. But at scale (100+ logs), the `ls -t | head -10` will still read directory metadata for all files. Consider pruning old logs (keep last 50) on a periodic basis. |

---

## 4. Phase 2 Readiness: Coordinator Worker Decomposition

### Current State
The spec describes workers as "prompt-level constructs, not separate processes." The `paperclipOrchestrator.ts` already provisions a Coordinator + domain workers in Paperclip, but **none of them actually execute anything yet**. They're metadata records only.

### How Coordinator Decomposition Should Work

**Recommended approach:**

1. **Coordinator as a pre-processing step.** Before routing a user message to the OpenClaw gateway, the backend:
   - Calls the Coordinator worker (a focused LLM prompt) to decompose the request
   - Coordinator writes a `task-board.json` to the container
   - Each worker is then invoked sequentially or in parallel via separate OpenClaw sessions
   - Results are merged by the Coordinator in a final pass

2. **Paperclip API patterns for sub-task tracking:**
   - Use `paperclipClient.createIssue()` for each sub-task — already implemented
   - Use `paperclipClient.checkoutIssue()` for atomic ownership — already implemented
   - Add `completeIssue()` and `failIssue()` to close the lifecycle (not yet implemented)
   - The task-board.json in the container mirrors Paperclip issues for offline/disconnected operation

3. **Worker invocation model:**
   - Each worker = a separate OpenClaw gateway session with a worker-specific system prompt
   - Session key pattern: `agent:worker:<worker_id>:<task_id>`
   - Workers share the container filesystem (artifacts/) but have isolated conversation context
   - The Coordinator reads artifacts/ to merge results

### Gaps to Close Before Phase 2

| Gap | What's Missing | Effort |
|-----|---------------|--------|
| Worker invocation | No code to invoke a worker as a separate gateway session | Medium — extend `sandboxExec` to support worker-specific prompts |
| Task lifecycle | `completeIssue()` and `failIssue()` not in `paperclipClient.ts` | Small |
| Coordinator prompt | No `coordinator.md` template exists yet | Medium — needs prompt engineering |
| Progress tracking | No `progress.json` read/write logic | Small — extend `dockerExec` pattern |
| Dependency resolution | No logic for "task B waits for task A" | Medium — need a simple topological sort |
| Budget enforcement | No per-worker budget check before invocation | Medium — middleware + DB check |

---

## 5. Scalability Assessment

### Current Approach: Read Last 10 Logs + Write Files to Sandbox

| Dimension | Current | At 100 agents × 50 chats/day | At 1000 agents |
|-----------|---------|-------------------------------|-----------------|
| Log file count per container | Low (grows unbounded) | ~50/day = 1500/month | Same per container |
| `dockerExec` calls per chat | 5 | 250/day per agent | Bottleneck: host Docker daemon |
| Pattern detection latency | <1s | <1s (only reads 10) | Same |
| Disk usage per container | ~KB | ~75MB/month (uncompressed JSON) | Need pruning |

### What Needs to Change at Scale

| # | Issue | When It Matters | Recommendation |
|---|-------|-----------------|----------------|
| 5.1 | `dockerExec` per chat is expensive | >50 concurrent agents | Move execution logging to a sidecar process inside the container, or use a mounted volume + host-side writer. Eliminate per-chat subprocess spawns. |
| 5.2 | Execution logs grow unbounded | >30 days of usage | Add a log rotation/pruning job. Keep last 100 logs, archive older ones to a shared volume or object storage. |
| 5.3 | Pattern detection is per-container | Cross-agent learning (Phase 4) | Move pattern detection to a centralized service that reads from all containers. The current per-container approach is correct for Phase 1-3 but blocks Phase 4. |
| 5.4 | Health check caching is per-process | Multiple backend instances | The `_healthCache` in `paperclipClient.ts` is an in-memory variable. With multiple backend processes, each maintains its own cache. Fine for single-instance, but at scale use Redis or a shared health endpoint. |
| 5.5 | Cost estimation is a rough heuristic | When budget enforcement matters | Line 126 of `paperclipOrchestrator.ts`: token count is estimated from `responseContent.length / 4`. This is wildly inaccurate for tool-heavy responses. When budget hard-stops matter, parse actual token counts from the OpenClaw gateway response headers or usage metadata. |

---

## Summary

### Blocking Concerns: None

The integration is well-structured for its current phase. All Paperclip/OpenSpace calls are properly fire-and-forget, fail-safe, and non-blocking.

### Priority Fixes (should land before Phase 1 ships)

1. **[High] Shell injection risk in log write** (1.4) — use `docker.shellQuote()` or base64 pipe
2. **[Medium] Double-provisioning race** (2.1) — add in-memory lock per agent ID
3. **[Medium] Redundant DB read in post-chat hook** (2.4) — pass agent record through

### Before Phase 2

4. Add `completeIssue()` / `failIssue()` to `paperclipClient.ts`
5. Design the Coordinator prompt template
6. Implement worker-specific gateway session invocation
7. Add execution log pruning

### Architectural Principles Validated

- **Chat is never blocked** ✅ — confirmed in all four hooks
- **Both integrations are optional** ✅ — `isAvailable()` and `isEnabled()` gates everywhere
- **Skills are proposed, not auto-applied** ✅ — proposals returned but not written (TODOs in code)
- **Workers are prompt-level constructs** ✅ — spec and code align
