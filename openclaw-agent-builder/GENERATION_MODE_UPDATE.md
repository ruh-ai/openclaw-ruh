# Generation Mode Update: OpenClaw-Native

**Date:** 2026-03-18  
**Status:** ✅ Complete  
**Architect Agent:** Updated

---

## What Changed

The architect/builder process has been updated to generate **OpenClaw-native agents** instead of standalone pipelines.

### Before (Standalone Pipeline)
```
Generated:
  ✓ main.py (standalone orchestrator)
  ✓ skills/*/run.py (subprocess scripts)
  ✓ setup.sh (manual installation)
  ✓ validate_env.py (env validation)

Deployment:
  → Run as cron job
  → Calls Python scripts via subprocess
  → Sends to Telegram via stub implementation
```

### After (OpenClaw-Native)
```
Generated:
  ✓ skills/*/SKILL.md (with inline exec commands)
  ✓ cron/*.json (OpenClaw cron format)
  ✓ workspace/SOUL.md (with workflow orchestration)
  ✓ workflows/main.yaml (Lobster workflow)

Deployment:
  → Copy files to OpenClaw instance
  → OpenClaw loads agent config + skills + cron
  → Agent executes workflow via exec() tool
  → Uses native message() tool for delivery
```

---

## Files Updated

### 1. SOUL.md (Architect Agent)
**Added:**
- Section: "Generation Mode: OpenClaw-Native"
- Mandatory generation rules:
  - Skills use inline exec/sh commands
  - Generate cron/*.json
  - SOUL.md includes workflow orchestration
  - No run.py files, no main.py
- Builder spawn payload format with `generation_mode` field

**Location:** `/home/daytona/.openclaw/workspace/SOUL.md`

---

### 2. Templates (OpenClaw-Native)
**Created:**
- `templates/openclaw-native/skill-inline-exec.md.template`
  - Template for skills with inline exec commands
  - Variables: SKILL_ID, EXEC_COMMANDS, REQUIRED_BINS, etc.

- `templates/openclaw-native/cron-job.json.template`
  - OpenClaw cron job format
  - Variables: JOB_NAME, CRON_EXPRESSION, TRIGGER_MESSAGE

- `templates/openclaw-native/soul-workflow.md.template`
  - Agent persona + workflow orchestration
  - Variables: AGENT_NAME, WORKFLOW_STEPS, DELIVERY_METHOD

- `templates/openclaw-native/README.md`
  - Template usage guide
  - Variable reference
  - Builder instructions

**Location:** `/home/daytona/.openclaw/workspace/templates/openclaw-native/`

---

### 3. file-ops Skill
**Updated:**
- Added "Generation Modes" section
- Documented `openclaw-native` as default mode
- Added template variable reference
- Updated file structure diagram

**Location:** `/home/daytona/.openclaw/workspace/skills/file-ops/SKILL.md`

---

### 4. .gitignore
**Added:**
- `output/` directory (exclude generated systems from git)

**Location:** `/home/daytona/.openclaw/workspace/.gitignore`

---

## Generation Rules (Summary)

### ✅ DO Generate:
- `openclaw.json` — Agent configuration
- `skills/*/SKILL.md` — With inline bash/python commands
- `cron/*.json` — OpenClaw cron jobs
- `workflows/main.yaml` — Lobster workflow
- `workspace/SOUL.md` — Persona + workflow orchestration
- `workspace/IDENTITY.md` — Agent identity
- `README.md` — Deployment guide
- `.env.example` — Required env vars

### ❌ DON'T Generate:
- `main.py` — Standalone orchestrator
- `skills/*/run.py` — Subprocess scripts
- `setup.sh` — Manual installation script
- `validate_env.py` — Env validation script

---

## Deployment Model

### User Workflow:
1. **Clone generated repo** from GitHub
2. **Copy files to OpenClaw instance:**
   ```bash
   cp openclaw.json /path/to/openclaw/
   cp -r skills /path/to/openclaw/
   cp -r workspace /path/to/openclaw/
   cp -r workflows /path/to/openclaw/
   cp cron/*.json /path/to/openclaw/cron/
   ```
3. **Set environment variables** in OpenClaw's .env
4. **Restart OpenClaw gateway:**
   ```bash
   openclaw gateway restart
   ```
5. **Agent loads automatically:**
   - Reads openclaw.json
   - Loads skills from skills/ directory
   - Reads SOUL.md for behavior
   - Registers cron jobs from cron/
   - Parses Lobster workflow (if runtime available)

---

## Skill Format (OpenClaw-Native)

### Structure:
```markdown
---
name: task-criticality-analyzer
metadata:
  openclaw:
    requires:
      bins: [curl, python3]
      env: [DATA_INGESTION_BASE_URL, RUN_ID]
---

# Task Criticality Analyzer

## Usage

### Step 1: Query Data
\`\`\`bash
curl -s -X POST ${DATA_INGESTION_BASE_URL}/data/query ...
\`\`\`

### Step 2: Process
\`\`\`bash
python3 -c '...' < /tmp/input.json > /tmp/output.json
\`\`\`

### Step 3: Write Results
\`\`\`bash
curl -s -X POST ${DATA_INGESTION_BASE_URL}/data/results/metrics ...
\`\`\`
```

**Key:**
- All logic is inline (bash/python one-liners)
- Agent reads SKILL.md and executes via exec() tool
- No separate run.py file

---

## Cron Format (OpenClaw)

### File: `cron/daily-digest.json`
```json
{
  "name": "Daily Task Digest",
  "enabled": true,
  "schedule": {
    "kind": "cron",
    "expr": "30 2 * * *",
    "tz": "UTC"
  },
  "sessionTarget": "isolated",
  "payload": {
    "kind": "agentTurn",
    "message": "Run daily digest workflow",
    "timeoutSeconds": 600
  }
}
```

**Deployment:**
```bash
cp cron/daily-digest.json /path/to/openclaw/cron/
openclaw gateway restart
```

OpenClaw loads cron jobs from `cron/*.json` on startup.

---

## SOUL.md Orchestration

### Added Section: Workflow Triggers
```markdown
## Workflow Orchestration

When you receive "Run daily digest workflow":

1. Set run ID:
   ```bash
   export RUN_ID=$(uuidgen)
   ```

2. Execute skills in order:
   - Read skills/linear-fetch/SKILL.md, execute commands
   - Read skills/analyzer/SKILL.md, execute commands
   - Read skills/digest-builder/SKILL.md, execute commands

3. Deliver results:
   Use message() tool:
   ```
   message(action="send", channel="telegram", target=..., message=...)
   ```

4. Error handling:
   If any step fails, log error and alert user
```

**Key:**
- Explicit workflow orchestration instructions
- Agent knows what to do when triggered by cron
- Uses native OpenClaw tools (exec, message, etc.)

---

## Testing

### Verify Generation Process:
1. Give architect a requirement
2. Architect generates skill graph
3. Builder creates OpenClaw-native system
4. Verify output structure:
   ```
   ✓ cron/*.json exists
   ✓ skills/*/SKILL.md has inline exec commands
   ✓ No run.py files
   ✓ No main.py
   ✓ SOUL.md has workflow triggers
   ✓ Lobster workflow references skills correctly
   ```

### Verify Deployment:
1. Copy files to OpenClaw instance
2. Restart gateway
3. Check agent loads successfully
4. Trigger cron job manually
5. Verify workflow executes

---

## Next Steps

### 1. Regenerate linear-task-manager
Use new generation mode to create OpenClaw-native version.

### 2. Test Deployment
Deploy to fresh OpenClaw instance and verify functionality.

### 3. Document Deployment Guide
Update README.md templates with deployment instructions.

---

## Benefits of OpenClaw-Native

### ✅ Advantages:
- **No external dependencies** (no npm packages to install)
- **Conversational interface** (users can ask "show me tasks")
- **Native tool integration** (message, exec, cron)
- **Runtime orchestration** (Lobster workflow execution)
- **Session management** (agent maintains state)

### ⚠️ Considerations:
- **Requires OpenClaw instance** (not standalone)
- **Assumes Lobster runtime** (may need fallback)
- **Skills less portable** (inline commands tied to environment)

---

## Status

**✅ Architect/Builder Process Updated**

Ready to regenerate requirements with OpenClaw-native output format.

---

*Updated: 2026-03-18 12:20 UTC*
