# Agent Builder Feature Test Plan

> Comprehensive test coverage for all features built in the April 2-3, 2026 sprint.

## Features Under Test

### 1. Auto-Flow Pipeline (Think → Plan → Build → Ship)
### 2. Instant Build (Plan-stage content → 5s deploy)
### 3. Skill Reuse System (20 seed skills + registry matching)
### 4. GitHub Integration (PAT auth + API push)
### 5. Runtime Inputs UX (types, defaults, grouping)
### 6. Build Phase UX (milestones, live feed, stats)
### 7. Agent Templates (8 seed templates + instant deploy)
### 8. Skill Testing Framework (auto-generated smoke tests)
### 9. Agent Monitoring Dashboard
### 10. Clone/Fork API
### 11. Agent Versioning (config snapshots + rollback)

---

## Test Cases by Feature

### 1. Auto-Flow Pipeline

| ID | Test | Expected |
|----|------|----------|
| AF-1 | Fresh agent creation triggers Think auto-send | thinkStatus → "generating", message sent silently |
| AF-2 | Think completion triggers Plan auto-send | devStage → "plan", planStatus → "generating" |
| AF-3 | Plan completion auto-approves after 2s delay | planStatus → "approved", devStage → "build" |
| AF-4 | Build completion advances to Review | buildStatus → "done", devStage → "review" |
| AF-5 | Review auto-advances to Test | evalTasks populated from skill tests |
| AF-6 | Ship deploys + pushes to GitHub (if connected) | Agent status → "active", GitHub repo created |

### 2. Instant Build

| ID | Test | Expected |
|----|------|----------|
| IB-1 | Plan with soulContent + all skillMd → fast path | Build completes in <10s |
| IB-2 | Plan without skillMd → slow path | Falls back to architect build |
| IB-3 | planHasInlineContent returns true for complete plans | All skills have skillMd + soulContent present |
| IB-4 | planHasInlineContent returns false for partial plans | Missing skillMd on any skill → false |
| IB-5 | deployFromPlan writes all files to sandbox | configure-agent returns ok:true, all steps ok |
| IB-6 | Fast path shows file-by-file progress | BuildActivityPanel shows SOUL.md + each skill |

### 3. Skill Reuse System

| ID | Test | Expected |
|----|------|----------|
| SR-1 | categorizeSkillReuse finds exact match | slack-reader planned → "install", confidence ≥ 0.7 |
| SR-2 | categorizeSkillReuse finds similar match | "weather-data-fetch" → customize from weather-fetcher |
| SR-3 | categorizeSkillReuse returns "build" for novel skills | "quantum-simulator" → no match, build from scratch |
| SR-4 | Reuse decisions inject into build prompt | Install section includes SKILL.md content |
| SR-5 | Skills auto-published after build | POST /api/skills called for each skill_md |
| SR-6 | Registry search works | GET /api/skills?q=slack returns slack-reader + slack-sender |
| SR-7 | Registry grows with community skills | After publish, total count increases |

### 4. GitHub Integration

| ID | Test | Expected |
|----|------|----------|
| GH-1 | Token validation via proxy | POST /api/github {action:"validate"} returns user |
| GH-2 | Token stored in localStorage | ruh-github-token and ruh-github-user set |
| GH-3 | Connected state shows avatar + disconnect | Green checkmark, username, Disconnect button |
| GH-4 | Auto-generated repo name | Format: {username}/{agent-slug}-{4chars} |
| GH-5 | Push creates repo + commits files | SOUL.md, skills/*/SKILL.md, README.md, config.yml |
| GH-6 | Push runs during Deploy Agent flow | GitHub push non-blocking, repo created |
| GH-7 | Disconnect clears credentials | localStorage cleared, UI shows Connect button |

### 5. Runtime Inputs UX

| ID | Test | Expected |
|----|------|----------|
| RI-1 | Boolean inputs render as toggles | inputType:"boolean" → switch component |
| RI-2 | Select inputs render as dropdowns | inputType:"select" + options → <select> |
| RI-3 | Number inputs render as number fields | inputType:"number" → type="number" |
| RI-4 | Defaults pre-fill values | defaultValue shown, "Default" badge |
| RI-5 | Groups organize inputs | "Authentication", "Behavior" section headers |
| RI-6 | Missing count excludes defaulted inputs | Inputs with defaults not counted as "missing" |
| RI-7 | Backend accepts enriched fields | PATCH /api/agents/:id/config with inputType/defaultValue → 200 |
| RI-8 | Backend resolves defaultValue in .env | value || defaultValue written to .env file |

### 6. Build Phase UX

| ID | Test | Expected |
|----|------|----------|
| BX-1 | Milestone bar shows 6 stages | Connect, Soul, Skills, Tools, Triggers, Assemble |
| BX-2 | Active milestone pulses | Current stage icon animates |
| BX-3 | Completed milestones show checkmark | Green CheckCircle2 for passed stages |
| BX-4 | Stats row updates in real-time | Skills count, file count, elapsed time |
| BX-5 | Activity feed scrolls to bottom | Auto-scroll on new entries |
| BX-6 | skill_created events show purple icon | Type "skill" → Zap icon |
| BX-7 | file_written events show gray icon | Type "file" → FileText icon |

### 7. Agent Templates

| ID | Test | Expected |
|----|------|----------|
| AT-1 | GET /api/templates returns 8 templates | All categories present |
| AT-2 | GET /api/templates?category=Productivity | Returns 3 templates |
| AT-3 | GET /api/templates?q=weather | Returns Weather Reporter |
| AT-4 | GET /api/templates/:id returns full plan | soulContent + skillMd present |
| AT-5 | Template deploy uses instant build path | planHasInlineContent → true → 5s deploy |
| AT-6 | Template picker shows categories | Filter tabs at top |

### 8. Skill Testing Framework

| ID | Test | Expected |
|----|------|----------|
| ST-1 | generateSkillTests produces domain-specific prompts | weather skill → "What's the weather in London?" |
| ST-2 | Skills with requires_env marked needsConfig | SLACK_BOT_TOKEN required → needsConfig:true |
| ST-3 | skillTestsToEvalTasks converts to EvalTask format | Correct id, description, status:"pending" |
| ST-4 | Tests populate after build completes | coPilotStore.evalTasks filled |
| ST-5 | validateFn checks for keywords | Weather response must contain temperature |

### 9. Agent Monitoring

| ID | Test | Expected |
|----|------|----------|
| AM-1 | /agents/:id/monitor loads dashboard | Metrics cards visible |
| AM-2 | Metrics show zero for new agents | 0 conversations, 0 messages, 0 errors |
| AM-3 | Activity feed shows empty state | "No activity yet" message |
| AM-4 | Auto-refresh every 30s | loadData called on interval |
| AM-5 | Monitor button visible on active agents | BarChart2 icon in agent card |

### 10. Clone/Fork

| ID | Test | Expected |
|----|------|----------|
| CF-1 | POST /api/agents/:id/clone creates copy | New agent with "(Copy)" suffix |
| CF-2 | Clone preserves config | skillGraph, workflow, agentRules copied |
| CF-3 | Clone has no sandbox | sandboxIds empty, status "draft" |

### 11. Versioning

| ID | Test | Expected |
|----|------|----------|
| VR-1 | Version auto-created on activation | PATCH status:"active" → version snapshot |
| VR-2 | List versions returns newest first | ORDER BY version_number DESC |
| VR-3 | Rollback restores config | Config fields match snapshot |
| VR-4 | Version number auto-increments | Each new version = MAX + 1 |

---

## Running Tests

```bash
# Unit tests (fast, no dependencies)
cd agent-builder-ui && bun test lib/

# Skill testing framework tests
bun test lib/openclaw/skill-test-generator.test.ts
bun test lib/openclaw/skill-test-runner.test.ts

# Backend template tests
cd ruh-backend && bun test tests/unit/templateRegistry.test.ts

# E2E (requires running dev servers)
cd agent-builder-ui && npx tsx e2e/agent-creation-e2e.ts
```
