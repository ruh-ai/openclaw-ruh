# OpenClaw-Native Generation Templates

These templates are used by the builder agent to generate OpenClaw-native agent systems.

## Template Files

| Template | Purpose | Variables |
|----------|---------|-----------|
| `skill-inline-exec.md.template` | Custom skill with inline exec commands | SKILL_ID, SKILL_NAME, EXEC_COMMANDS, etc. |
| `cron-job.json.template` | OpenClaw cron job configuration | JOB_NAME, CRON_EXPRESSION, TRIGGER_MESSAGE |
| `soul-workflow.md.template` | Agent persona + workflow orchestration | AGENT_NAME, WORKFLOW_STEPS, DELIVERY_METHOD |

## Variable Reference

### skill-inline-exec.md.template

```yaml
SKILL_ID: task-criticality-analyzer
SKILL_NAME: Task Criticality Analyzer
SKILL_DESCRIPTION: Analyzes task impact and complexity
SKILL_LONG_DESCRIPTION: |
  Scores tasks on impact (urgency keywords + priority) and complexity 
  (subtasks + estimates). Writes to result_metrics.
REQUIRED_BINS: ["curl", "jq", "python3"]
REQUIRED_ENV_VARS: ["DATA_INGESTION_BASE_URL", "RUN_ID"]
PRIMARY_ENV_VAR: DATA_INGESTION_BASE_URL
EXEC_COMMANDS: |
  ### Step 1: Query Tasks
  ```bash
  curl -s -X POST ${DATA_INGESTION_BASE_URL}/data/query ...
  ```
  
  ### Step 2: Analyze
  ```bash
  python3 -c '...' < /tmp/tasks.json > /tmp/metrics.json
  ```
  
  ### Step 3: Write Results
  ```bash
  curl -s -X POST ${DATA_INGESTION_BASE_URL}/data/results/metrics ...
  ```
EXPECTED_OUTPUT: Writes criticality scores (0-100) to result_metrics
ERROR_HANDLING: If data-ingestion fails, exit 1 and log error
```

### cron-job.json.template

```yaml
JOB_NAME: Linear Task Daily Digest
CRON_EXPRESSION: 30 2 * * *
TIMEZONE: UTC
TRIGGER_MESSAGE: Run daily Linear task digest workflow
MODEL: openrouter/anthropic/claude-sonnet-4.5
TIMEOUT_SECONDS: 600
```

### soul-workflow.md.template

```yaml
AGENT_NAME: Linear Task Manager
AGENT_TYPE: task prioritization assistant
AGENT_PURPOSE: helping you stay on top of Linear tasks
AGENT_DESCRIPTION: |
  Every morning at 8:00 AM IST, you:
  1. Fetch assigned Linear tasks
  2. Analyze criticality
  3. Send top-10 digest to Telegram
TONE: Professional but warm
TONE_DESCRIPTION: You're helping someone manage their workload
SKILL_LIST: |
  - linear-to-ingestion-wrapper
  - task-criticality-analyzer
  - task-digest-builder
  - telegram-sender
TRIGGER_MESSAGE: Run daily Linear task digest workflow
WORKFLOW_STEPS: |
  1. **Fetch**: Read skills/linear-to-ingestion-wrapper/SKILL.md, execute commands
  2. **Analyze**: Read skills/task-criticality-analyzer/SKILL.md, execute commands
  3. **Digest**: Read skills/task-digest-builder/SKILL.md, execute commands
  4. **Send**: Use message tool with digest output
DELIVERY_METHOD: |
  Use message() tool:
  ```
  message(action="send", channel="telegram", target=${TELEGRAM_CHAT_ID}, message=<digest>)
  ```
ALERT_CHANNEL: Telegram (same as delivery)
MANUAL_COMMANDS: |
  - "Show me my Linear tasks" → Run workflow on-demand
  - "Refresh my digest" → Re-run latest analysis
AGENT_MISSION: make task management effortless
```

## Usage (Builder Agent)

### Generate Skill with Inline Exec

```bash
sed -e "s|{{SKILL_ID}}|task-criticality-analyzer|g" \
    -e "s|{{SKILL_NAME}}|Task Criticality Analyzer|g" \
    -e "s|{{SKILL_DESCRIPTION}}|Analyzes task criticality|g" \
    -e "s|{{REQUIRED_BINS}}|[\"curl\", \"python3\"]|g" \
    -e "s|{{REQUIRED_ENV_VARS}}|[\"DATA_INGESTION_BASE_URL\", \"RUN_ID\"]|g" \
    -e "s|{{PRIMARY_ENV_VAR}}|DATA_INGESTION_BASE_URL|g" \
    templates/openclaw-native/skill-inline-exec.md.template > \
    output/linear-task-manager/skills/task-criticality-analyzer/SKILL.md

# Then manually append EXEC_COMMANDS section with actual commands
cat >> output/linear-task-manager/skills/task-criticality-analyzer/SKILL.md << 'EOF'

## Usage

### Step 1: Query Tasks
```bash
curl -s -X POST ${DATA_INGESTION_BASE_URL}/data/query \
  -H "Content-Type: application/json" \
  -d '{"table_name":"entity_issues",...}' > /tmp/tasks.json
```

### Step 2: Analyze
```bash
python3 -c '
import json, sys
tasks = json.load(sys.stdin)
# ... scoring logic ...
print(json.dumps(metrics))
' < /tmp/tasks.json > /tmp/metrics.json
```

### Step 3: Write Results
```bash
curl -s -X POST ${DATA_INGESTION_BASE_URL}/data/results/metrics \
  -H "Content-Type: application/json" \
  -d @/tmp/metrics.json
```
EOF
```

### Generate Cron Job

```bash
sed -e "s|{{JOB_NAME}}|Linear Task Daily Digest|g" \
    -e "s|{{CRON_EXPRESSION}}|30 2 * * *|g" \
    -e "s|{{TIMEZONE}}|UTC|g" \
    -e "s|{{TRIGGER_MESSAGE}}|Run daily Linear task digest workflow|g" \
    -e "s|{{MODEL}}|openrouter/anthropic/claude-sonnet-4.5|g" \
    -e "s|{{TIMEOUT_SECONDS}}|600|g" \
    templates/openclaw-native/cron-job.json.template > \
    output/linear-task-manager/cron/daily-digest.json
```

### Generate SOUL.md

```bash
# SOUL.md is complex, so generate with write() tool instead of sed
# Use the template as a guide for structure
```

## Key Principles

1. **Skills are documentation + inline commands**
   - Agent reads SKILL.md
   - Agent executes via exec() tool
   - No separate executable files

2. **Cron triggers agent turns**
   - OpenClaw cron sends message to agent
   - SOUL.md defines what to do when triggered
   - Agent orchestrates workflow

3. **Lobster workflow is executable**
   - Assumes OpenClaw has Lobster runtime
   - Defines step order and dependencies
   - Agent or runtime executes

4. **Message tool for delivery**
   - Agent uses native message() tool
   - No stub implementations
   - Works with Telegram, Slack, Discord, etc.

## Testing Generated Systems

Deploy to fresh OpenClaw instance:

```bash
# Copy files
cp output/<system-name>/openclaw.json /path/to/openclaw/
cp -r output/<system-name>/skills /path/to/openclaw/
cp -r output/<system-name>/workspace /path/to/openclaw/
cp -r output/<system-name>/workflows /path/to/openclaw/
cp output/<system-name>/cron/*.json /path/to/openclaw/cron/

# Restart OpenClaw
openclaw gateway restart

# Agent will load config, skills, and cron jobs
```
