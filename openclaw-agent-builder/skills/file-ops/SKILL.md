---
name: file-ops
version: 1.0.0
description: "File system operations for the builder agent: create directories, write files, copy templates, read file contents. Used when generating multi-agent system output directories."
user-invocable: false
metadata:
  openclaw:
    requires:
      bins: [mkdir, cp, cat, sed]
---

# File Operations Skill

Provides file system primitives for the builder agent to create generated system directories.

## Generation Modes

### openclaw-native (default)
Generate OpenClaw-native agents:
- Skills: Inline exec commands in SKILL.md
- Orchestration: Lobster workflow + cron/*.json
- No run.py files, no main.py

### standalone-pipeline (legacy)
Generate standalone automation pipelines:
- Skills: SKILL.md + run.py subprocess scripts
- Orchestration: main.py orchestrator
- Deployable Python pipelines

**Current mode:** `openclaw-native`

## Operations

### Create Directory Structure (OpenClaw-Native)
```bash
mkdir -p output/<system-name>/{cron,workflows,workspace,skills}
mkdir -p output/<system-name>/skills/{data-ingestion-openclaw,<custom-skill-1>,<custom-skill-2>}
```

### Write File
Write content to a file path. Use heredoc for multi-line content:
```bash
cat > output/<system-name>/openclaw.json << JSONEOF
{content}
JSONEOF
```

### Copy Template (OpenClaw-Native)
Copy template and substitute variables:
```bash
sed -e "s|{{SKILL_ID}}|<skill-id>|g" \
    -e "s|{{SKILL_NAME}}|<skill-name>|g" \
    -e "s|{{EXEC_COMMANDS}}|<commands>|g" \
    templates/openclaw-native/skill-inline-exec.md.template > \
    output/<system-name>/skills/<skill-id>/SKILL.md
```

### Template Variables (OpenClaw-Native)

**skill-inline-exec.md.template:**
- `{{SKILL_ID}}`: Skill identifier (kebab-case)
- `{{SKILL_NAME}}`: Human-readable name
- `{{SKILL_DESCRIPTION}}`: Short description
- `{{REQUIRED_BINS}}`: JSON array of required binaries
- `{{REQUIRED_ENV_VARS}}`: JSON array of env var names
- `{{PRIMARY_ENV_VAR}}`: Main env var (e.g., API key)
- `{{EXEC_COMMANDS}}`: Bash/python commands to execute
- `{{EXPECTED_OUTPUT}}`: What the skill produces
- `{{ERROR_HANDLING}}`: Error handling logic

**cron-job.json.template:**
- `{{JOB_NAME}}`: Human-readable job name
- `{{CRON_EXPRESSION}}`: Cron syntax (e.g., "30 2 * * *")
- `{{TIMEZONE}}`: Timezone (default: "UTC")
- `{{TRIGGER_MESSAGE}}`: Message sent to agent on trigger
- `{{MODEL}}`: LLM model (default: "openrouter/anthropic/claude-sonnet-4.5")
- `{{TIMEOUT_SECONDS}}`: Job timeout (default: 600)

**soul-workflow.md.template:**
- `{{AGENT_NAME}}`: Agent name
- `{{AGENT_TYPE}}`: Type (e.g., "task prioritization assistant")
- `{{AGENT_PURPOSE}}`: Purpose statement
- `{{TONE}}`: Tone description
- `{{SKILL_LIST}}`: Bullet list of available skills
- `{{TRIGGER_MESSAGE}}`: Cron trigger message
- `{{WORKFLOW_STEPS}}`: Numbered list of execution steps
- `{{DELIVERY_METHOD}}`: How results are delivered
- `{{ALERT_CHANNEL}}`: Error alert channel
- `{{MANUAL_COMMANDS}}`: User commands supported

### Read File
```bash
cat output/<system-name>/openclaw.json
```

### List Directory
```bash
ls -la output/<system-name>/
```

## Output Directory Convention

All generated systems are created under `output/<system-name>/` relative to the factory workspace root. The builder MUST use this convention.

## OpenClaw-Native File Structure

```
output/<system-name>/
├── openclaw.json
├── README.md
├── .env.example
├── .gitignore
├── check-environment.sh         ← Generated from template
├── install-dependencies.sh      ← Generated from template
├── test-workflow.sh             ← Generated from template
├── cron/
│   └── <job-name>.json
├── workflows/
│   └── main.yaml
├── workspace/
│   ├── SOUL.md
│   └── IDENTITY.md
└── skills/
    ├── data-ingestion-openclaw/SKILL.md
    └── <custom-skill>/SKILL.md
```

### Helper Script Generation

The builder MUST generate three executable helper scripts for every system:

1. **check-environment.sh**: Validates binaries, env vars, API connectivity
2. **install-dependencies.sh**: Auto-installs system packages and npm packages
3. **test-workflow.sh**: Tests the data pipeline manually

See `templates/openclaw-native/README-SCRIPTS.md` for template usage.
