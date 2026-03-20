# Linear Task Manager

**Automated daily task prioritization and digest delivery** (OpenClaw-native agent)

---

## What It Does

Every day at 8:00 AM IST, this agent:
1. Fetches your assigned Linear tasks (all statuses except "Done")
2. Analyzes each task for criticality based on:
   - **Impact**: Keywords like "urgent", "immediate" + Linear priority field + due date proximity
   - **Complexity**: Subtasks, estimated time, description depth
3. Generates a prioritized top-10 digest sorted by:
   - Due date (ascending)
   - Criticality score (descending)
4. Sends the digest to your Telegram

---

## Architecture (OpenClaw-Native)

### Skills
- **linear-to-ingestion-wrapper** (custom): Fetches tasks via linear-cli, writes to entity_issues
- **task-criticality-analyzer** (custom): LLM-based impact + complexity scoring → result_metrics
- **task-digest-builder** (custom): Query + sort + format top-10 digest
- **telegram-sender** (custom): Deliver via OpenClaw message tool
- **data-ingestion-openclaw** (always-included): Database read/write

### Data Flow
```
Linear API → linear-cli → wrapper → entity_issues (data-ingestion)
                                   ↓
                           analyzer reads issues → writes result_metrics
                                   ↓
                           digest builder queries metrics → formats top-10
                                   ↓
                           telegram sender → your Telegram (via message tool)
```

### Workflow Orchestration
- **Trigger**: OpenClaw cron job (`cron/daily-digest.json`)
- **Execution**: Agent reads SOUL.md, executes skills via exec() tool
- **Delivery**: Native message() tool (Telegram channel)

---

## Deployment (OpenClaw Instance)

### Prerequisites
- OpenClaw instance (v1.0+)
- Linear API key (read access to issues)
- Data Ingestion Service account (org_id)
- Telegram configured in OpenClaw
- linear-cli installed: `npm install -g linear-cli`

### Quick Start Scripts

We provide helper scripts for easy setup:

```bash
# 1. Install dependencies (curl, jq, python3, linear-cli)
./install-dependencies.sh

# 2. Check environment (validates all requirements)
./check-environment.sh

# 3. Test workflow manually (dry-run without OpenClaw)
./test-workflow.sh
```

### Installation

**Step 1: Clone the Repository**
```bash
git clone git@github.com:arunima-ruh/linear-task-manager-v2.git
cd linear-task-manager-v2
```

**Step 2: Copy Files to OpenClaw Instance**
```bash
# Set your OpenClaw path
OPENCLAW_PATH=/path/to/openclaw

# Copy agent configuration
cp openclaw.json $OPENCLAW_PATH/

# Copy skills
cp -r skills/* $OPENCLAW_PATH/skills/

# Copy workspace (SOUL.md, IDENTITY.md)
cp -r workspace/* $OPENCLAW_PATH/workspace/

# Copy Lobster workflow
cp -r workflows/* $OPENCLAW_PATH/workflows/

# Copy cron job
cp cron/daily-digest.json $OPENCLAW_PATH/cron/
```

**Step 3: Configure Environment Variables**

Edit `$OPENCLAW_PATH/.env` and add:
```bash
# Linear API
LINEAR_API_KEY=your_linear_api_key

# Data Ingestion Service
DATA_INGESTION_BASE_URL=https://ingestion-service-s45p.onrender.com
DATA_INGESTION_ORG_ID=your_org_id
DATA_INGESTION_AGENT_ID=linear-task-manager

# Telegram
TELEGRAM_CHAT_ID=your_telegram_user_id
```

**Step 4: Install Dependencies**
```bash
# Option A: Use the install script (recommended)
./install-dependencies.sh

# Option B: Manual installation
npm install -g linear-cli

# Verify installation
linear --version
```

**Step 5: Validate Environment (Recommended)**
```bash
# Run the environment checker
./check-environment.sh

# This will verify:
# - All required binaries are installed (curl, jq, python3, linear)
# - Environment variables are set correctly
# - Data Ingestion Service is reachable
# - Linear API key is valid
```

**Step 6: (Optional) Test Workflow Manually**
```bash
# Test the workflow without OpenClaw
./test-workflow.sh

# This simulates what the agent will do:
# - Fetches your Linear tasks
# - Transforms and writes to data-ingestion
# - Verifies the data pipeline works
```

**Step 7: Restart OpenClaw**
```bash
cd $OPENCLAW_PATH
openclaw gateway restart
```

OpenClaw will:
- Load `openclaw.json` (agent config)
- Register skills from `skills/` directory
- Read `workspace/SOUL.md` for behavior
- Schedule cron job from `cron/daily-digest.json`

---

## Usage

### Automatic Daily Digest
The agent runs automatically at 8:00 AM IST (2:30 AM UTC) via cron trigger.

### Manual Trigger
Ask the agent directly:
```
"Show me my Linear tasks"
"Refresh my digest"
"What's my top priority today?"
```

### Dry-Run Mode
Set `DRY_RUN=true` in OpenClaw's .env to skip Telegram send (testing).

---

## Output Example

```
📋 Your Top 10 Linear Tasks (2024-03-18)

1. [CRITICAL] Fix authentication bug in prod
   Project: Backend | Due: 2024-03-18 | Criticality: 95/100

2. [HIGH] Implement rate limiting
   Project: Backend | Due: 2024-03-19 | Criticality: 87/100

3. [MEDIUM] Refactor user service
   Project: Backend | Due: 2024-03-20 | Criticality: 72/100

...
```

---

## Troubleshooting

### Linear API Rate Limits
If you hit rate limits, the system will log errors. Adjust schedule frequency if needed.

### Data Ingestion Service Cold Start
The Render free tier service may take 30-60s to wake up on first request. Be patient.

### Telegram Delivery Failures
Verify:
- `TELEGRAM_CHAT_ID` is correct (numeric ID, not username)
- Telegram is configured in OpenClaw (`openclaw.json`)
- Run `openclaw status` to check Telegram connection

### linear-cli Not Found
Install: `npm install -g linear-cli`

Verify: `which linear` should show the path

---

## Customization

### Adjust Criticality Scoring
Edit `skills/task-criticality-analyzer/SKILL.md`:
- Change keyword weights (line ~40)
- Adjust priority score mapping (line ~45)
- Modify complexity heuristics (line ~60)

### Change Digest Format
Edit `skills/task-digest-builder/SKILL.md`:
- Modify markdown template (line ~100)
- Adjust top-N limit (currently 10)

### Add More Filters
Edit `skills/linear-to-ingestion-wrapper/SKILL.md`:
- Change status filter (line ~25)
- Add project filter, label filter, etc.

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `LINEAR_API_KEY` | Yes | Your Linear API key |
| `DATA_INGESTION_BASE_URL` | Yes | Data ingestion service URL |
| `DATA_INGESTION_ORG_ID` | Yes | Your organization ID |
| `DATA_INGESTION_AGENT_ID` | Yes | Agent identifier (use `linear-task-manager`) |
| `TELEGRAM_CHAT_ID` | Yes | Your Telegram user ID |
| `RUN_ID` | No | Auto-generated if not provided |

---

## Helper Scripts (Developer Tools)

We provide executable scripts to help with setup and testing:

| Script | Purpose |
|--------|---------|
| `install-dependencies.sh` | Installs all required system packages and linear-cli |
| `check-environment.sh` | Validates that all dependencies and env vars are correct |
| `test-workflow.sh` | Manually tests the data pipeline (fetch → transform → write) |

**Usage:**
```bash
# 1. Install everything
./install-dependencies.sh

# 2. Check if ready
./check-environment.sh

# 3. Test the workflow
./test-workflow.sh
```

These scripts are **optional** but highly recommended for troubleshooting.

---

## Files Included

```
linear-task-manager/
├── openclaw.json                               ← Agent config
├── README.md                                   ← This file
├── .env.example                                ← Env var template
├── .gitignore                                  ← Standard ignores
├── install-dependencies.sh                     ← Install script
├── check-environment.sh                        ← Environment validator
├── test-workflow.sh                            ← Workflow tester
├── cron/
│   └── daily-digest.json                       ← OpenClaw cron job
├── workflows/
│   └── main.yaml                               ← Lobster workflow
├── workspace/
│   ├── SOUL.md                                 ← Persona + orchestration
│   └── IDENTITY.md                             ← Agent identity
└── skills/
    ├── data-ingestion-openclaw/SKILL.md        ← Data pipeline
    ├── linear-to-ingestion-wrapper/SKILL.md    ← Fetch + write
    ├── task-criticality-analyzer/SKILL.md      ← Score tasks
    ├── task-digest-builder/SKILL.md            ← Format digest
    └── telegram-sender/SKILL.md                ← Deliver via message()
```

---

## Support

- **Issues**: https://github.com/arunima-ruh/linear-task-manager/issues
- **OpenClaw Docs**: https://docs.openclaw.ai
- **Data Ingestion Service**: https://ingestion-service-s45p.onrender.com/docs

---

## License

MIT

---

**Generated by Agent Factory (OpenClaw architect agent)**  
**Mode:** openclaw-native  
**Date:** 2024-03-18
