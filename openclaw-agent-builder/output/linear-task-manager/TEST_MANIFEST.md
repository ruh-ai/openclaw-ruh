# Test Manifest: Linear Task Manager

**Generation Mode:** openclaw-native  
**Date:** 2024-03-18  
**Status:** Pending validation

---

## Required Files Checklist

### Core Configuration
- [ ] `openclaw.json` — Agent configuration
- [ ] `.env.example` — Environment variable template
- [ ] `.gitignore` — Git ignore rules
- [ ] `README.md` — Deployment guide

### Scheduling
- [ ] `cron/daily-digest.json` — OpenClaw cron job

### Workflow
- [ ] `workflows/main.yaml` — Lobster workflow definition

### Workspace
- [ ] `workspace/SOUL.md` — Agent persona + workflow orchestration
- [ ] `workspace/IDENTITY.md` — Agent identity

### Skills (must have inline exec commands)
- [ ] `skills/data-ingestion-openclaw/SKILL.md`
- [ ] `skills/linear-to-ingestion-wrapper/SKILL.md`
- [ ] `skills/task-criticality-analyzer/SKILL.md`
- [ ] `skills/task-digest-builder/SKILL.md`
- [ ] `skills/telegram-sender/SKILL.md`

### Files that should NOT exist
- [ ] `main.py` (should NOT exist)
- [ ] `skills/*/run.py` (should NOT exist)
- [ ] `setup.sh` (should NOT exist)
- [ ] `validate_env.py` (should NOT exist)

---

## Validation Rules

### 1. openclaw.json
- Must be valid JSON
- Must have `agentId: "linear-task-manager"`
- Must list all 5 skills in agents[0].skills
- Must have skills.dirs and workflows.dirs

### 2. Cron Job
- Must be valid JSON
- Must have schedule.kind = "cron"
- Must have payload.kind = "agentTurn"
- Trigger message must match SOUL.md workflow section

### 3. Skills with Inline Exec
Each skill MUST:
- Have YAML frontmatter with metadata.openclaw
- Have "Usage" section with bash/python code blocks
- NOT reference external run.py files
- Include required env vars in metadata

### 4. SOUL.md Workflow Orchestration
Must include:
- Section: "When Triggered by Cron"
- Explicit step-by-step execution instructions
- Reference to message() tool for Telegram delivery
- Error handling logic

### 5. No Standalone Files
Must NOT include:
- main.py (orchestrator)
- skills/*/run.py (subprocess scripts)
- setup.sh (manual setup)
- validate_env.py (env validation)

---

## Test Commands

### File Existence Check
```bash
cd /home/daytona/.openclaw/workspace/output/linear-task-manager

# Check required files
test -f openclaw.json && echo "✓ openclaw.json" || echo "✗ openclaw.json"
test -f .env.example && echo "✓ .env.example" || echo "✗ .env.example"
test -f cron/daily-digest.json && echo "✓ cron/daily-digest.json" || echo "✗ cron/daily-digest.json"
test -f workflows/main.yaml && echo "✓ workflows/main.yaml" || echo "✗ workflows/main.yaml"
test -f workspace/SOUL.md && echo "✓ workspace/SOUL.md" || echo "✗ workspace/SOUL.md"
test -f workspace/IDENTITY.md && echo "✓ workspace/IDENTITY.md" || echo "✗ workspace/IDENTITY.md"

# Check skills
test -f skills/linear-to-ingestion-wrapper/SKILL.md && echo "✓ linear-to-ingestion-wrapper" || echo "✗ linear-to-ingestion-wrapper"
test -f skills/task-criticality-analyzer/SKILL.md && echo "✓ task-criticality-analyzer" || echo "✗ task-criticality-analyzer"
test -f skills/task-digest-builder/SKILL.md && echo "✓ task-digest-builder" || echo "✗ task-digest-builder"
test -f skills/telegram-sender/SKILL.md && echo "✓ telegram-sender" || echo "✗ telegram-sender"

# Check that unwanted files DON'T exist
test ! -f main.py && echo "✓ NO main.py" || echo "✗ main.py EXISTS"
test ! -f setup.sh && echo "✓ NO setup.sh" || echo "✗ setup.sh EXISTS"
test ! -f validate_env.py && echo "✓ NO validate_env.py" || echo "✗ validate_env.py EXISTS"
find skills -name "run.py" | grep -q . && echo "✗ run.py files EXIST" || echo "✓ NO run.py files"
```

### JSON Validation
```bash
# Validate openclaw.json
jq empty openclaw.json && echo "✓ openclaw.json valid" || echo "✗ openclaw.json invalid"

# Validate cron job
jq empty cron/daily-digest.json && echo "✓ cron/daily-digest.json valid" || echo "✗ cron/daily-digest.json invalid"
```

### Skill Inline Exec Check
```bash
# Check that skills have inline exec commands (not run.py references)
for skill in linear-to-ingestion-wrapper task-criticality-analyzer task-digest-builder telegram-sender; do
  if grep -q '```bash' skills/$skill/SKILL.md; then
    echo "✓ $skill has inline exec"
  else
    echo "✗ $skill missing inline exec"
  fi
done
```

### SOUL.md Workflow Check
```bash
# Check SOUL.md has workflow orchestration
if grep -q "When Triggered by Cron" workspace/SOUL.md; then
  echo "✓ SOUL.md has workflow orchestration"
else
  echo "✗ SOUL.md missing workflow orchestration"
fi
```

---

## Expected Test Results

All checks should pass:
```
✓ openclaw.json
✓ .env.example
✓ cron/daily-digest.json
✓ workflows/main.yaml
✓ workspace/SOUL.md
✓ workspace/IDENTITY.md
✓ linear-to-ingestion-wrapper
✓ task-criticality-analyzer
✓ task-digest-builder
✓ telegram-sender
✓ NO main.py
✓ NO setup.sh
✓ NO validate_env.py
✓ NO run.py files
✓ openclaw.json valid
✓ cron/daily-digest.json valid
✓ linear-to-ingestion-wrapper has inline exec
✓ task-criticality-analyzer has inline exec
✓ task-digest-builder has inline exec
✓ telegram-sender has inline exec
✓ SOUL.md has workflow orchestration
```

---

## Status: Ready for Validation

Run test commands to verify generation.
