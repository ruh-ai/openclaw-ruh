# Helper Scripts Integration - Complete

**Date:** 2024-03-18  
**Status:** ✅ Integrated into generation process  
**Affects:** All future OpenClaw-native agent generations

---

## Problem Identified

When reviewing the generated `linear-task-manager-v2`, you noticed:
> "is there any file generated not for openclaw to understand, but for developers, which they can manually run inside openclaw instance. otherwise manual effort will also not know what to install."

**The issue:** Generated systems had:
- ✅ Files for OpenClaw (openclaw.json, skills/, workflows/, cron/)
- ❌ NO files for developers to manually validate or test setup
- ❌ NO automated way to install dependencies
- ❌ NO way to test the data pipeline without OpenClaw

---

## Solution Implemented

### Phase 1: Added Scripts to linear-task-manager-v2 (Manual)

Created 3 executable helper scripts:

1. **install-dependencies.sh** (3.3 KB)
   - Auto-detects OS (Ubuntu, CentOS, macOS)
   - Installs system packages (curl, jq, python3)
   - Installs npm packages (linear-cli)
   - Verifies installations

2. **check-environment.sh** (3.7 KB)
   - Validates all required binaries exist
   - Checks environment variables are set
   - Tests Data Ingestion Service connectivity
   - Validates Linear API key
   - Color-coded output (✓ green, ✗ red, ⚠ yellow)

3. **test-workflow.sh** (5.2 KB)
   - Generates RUN_ID for audit trail
   - Fetches Linear tasks via linear-cli
   - Transforms to entity_issues schema
   - Writes to data-ingestion service
   - Queries back to verify write
   - Simulates what OpenClaw agent will do

**Result:** linear-task-manager-v2 now has developer-friendly tooling ✅

---

### Phase 2: Templatized for All Future Generations (Automated)

**Created templates:**

1. **check-environment.sh.template** (2.5 KB)
   - Template variables:
     - `{{SYSTEM_NAME}}`: System name
     - `{{BINARY_CHECKS}}`: Generated from skill requirements
     - `{{ENV_VAR_CHECKS}}`: Generated from skill requirements
     - `{{CUSTOM_CHECKS}}`: API-specific validation logic

2. **install-dependencies.sh.template** (2.5 KB)
   - Template variables:
     - `{{SYSTEM_NAME}}`: System name
     - `{{SYSTEM_PACKAGES_APT}}`: apt-get packages
     - `{{SYSTEM_PACKAGES_YUM}}`: yum packages
     - `{{SYSTEM_PACKAGES_BREW}}`: brew packages
     - `{{NPM_PACKAGES_INSTALL}}`: npm install commands

3. **test-workflow.sh.template** (1.3 KB)
   - Template variables:
     - `{{SYSTEM_NAME}}`: System name
     - `{{REQUIRED_ENV_VARS_ARRAY}}`: Bash array of env vars
     - `{{WORKFLOW_TEST_STEPS}}`: Generated from workflow steps

**Result:** Every future agent will automatically include these scripts ✅

---

## Updated Generation Rules

### Architect SOUL.md (Updated)

**NEW Rule 6:**
```
6. **ALWAYS generate helper scripts:**
   - ✅ check-environment.sh (validates binaries + env vars + API connectivity)
   - ✅ install-dependencies.sh (auto-installs dependencies)
   - ✅ test-workflow.sh (tests data pipeline manually)
```

**Updated Rule 7:**
```
7. **Do NOT generate:**
   - ❌ main.py (orchestrator)
   - ❌ skills/*/run.py (subprocess scripts)
   - ❌ setup.sh (deprecated - use install-dependencies.sh instead)
   - ❌ validate_env.py (deprecated - use check-environment.sh instead)
```

---

## File Structure (Every Future Generation)

```
output/<system-name>/
├── openclaw.json
├── README.md
├── .env.example
├── .gitignore
├── check-environment.sh         ← NEW (always generated)
├── install-dependencies.sh      ← NEW (always generated)
├── test-workflow.sh             ← NEW (always generated)
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

---

## Builder Integration Logic

The builder will:

1. **Collect requirements from skills:**
   - Required binaries (from metadata.openclaw.requires.bins)
   - Required env vars (from metadata.openclaw.requires.env)
   - External APIs (detect from skill types: Linear, GitHub, Jira, etc.)

2. **Generate BINARY_CHECKS:**
   ```bash
   check_binary "curl" "apt-get install curl"
   check_binary "linear" "npm install -g linear-cli"
   ```

3. **Generate ENV_VAR_CHECKS:**
   ```bash
   check_env "LINEAR_API_KEY"
   check_env "DATA_INGESTION_BASE_URL"
   ```

4. **Generate CUSTOM_CHECKS** (API-specific):
   ```bash
   # For Linear
   if [ -n "$LINEAR_API_KEY" ]; then
       linear whoami && echo "✓ Linear API valid" || echo "✗ Invalid key"
   fi
   ```

5. **Generate NPM_PACKAGES_INSTALL:**
   ```bash
   npm install -g linear-cli
   echo "✓ linear-cli installed"
   ```

6. **Generate WORKFLOW_TEST_STEPS:**
   ```bash
   echo "=== Step 1: Fetch Data ==="
   linear issue list --json > /tmp/data.json
   echo "✓ Fetched data"
   ```

7. **Render templates and write to output directory**

8. **Make scripts executable:**
   ```bash
   chmod +x check-environment.sh install-dependencies.sh test-workflow.sh
   ```

---

## Documentation Created

| File | Purpose |
|------|---------|
| `templates/openclaw-native/README-SCRIPTS.md` | Template documentation, variable reference, builder integration guide |
| `templates/openclaw-native/check-environment.sh.template` | Template for environment validator |
| `templates/openclaw-native/install-dependencies.sh.template` | Template for dependency installer |
| `templates/openclaw-native/test-workflow.sh.template` | Template for workflow tester |

---

## Standard Requirements by System Type

### Data Pipeline (All Systems)
- **Binaries:** curl, jq, python3
- **Env Vars:** DATA_INGESTION_BASE_URL, DATA_INGESTION_ORG_ID, DATA_INGESTION_AGENT_ID, RUN_ID

### External API Systems

**Linear:**
- Binaries: +linear
- Env Vars: +LINEAR_API_KEY
- Custom Check: `linear whoami`

**GitHub:**
- Binaries: +gh
- Env Vars: +GITHUB_TOKEN, +GITHUB_ORG
- Custom Check: `gh auth status`

**Jira:**
- Binaries: (curl only)
- Env Vars: +JIRA_URL, +JIRA_USER, +JIRA_API_TOKEN
- Custom Check: `curl $JIRA_URL/rest/api/2/myself`

**Slack:**
- Env Vars: +SLACK_CHANNEL_ID
- Custom Check: Verify OpenClaw Slack config

**Telegram:**
- Env Vars: +TELEGRAM_CHAT_ID
- Custom Check: Verify OpenClaw Telegram config

---

## Before vs After

### Before This Change

```bash
# Developer clones repo
git clone repo
cd repo

# No guidance on what to install
# README says "install linear-cli" but...
# - Which OS?
# - What else is needed?
# - How to verify setup?
# - How to test before deploying?

# Manual trial and error
npm install -g linear-cli
# Did it work? Who knows...

# Copy to OpenClaw, hope it works
cp -r files /path/to/openclaw/
openclaw gateway restart
# Does it work? Debug in production...
```

### After This Change

```bash
# Developer clones repo
git clone repo
cd repo

# Clear path forward
./install-dependencies.sh
# ✅ Installs everything automatically

./check-environment.sh
# ✅ Validates setup with clear pass/fail
# ❌ Shows exactly what's missing

./test-workflow.sh
# ✅ Tests data pipeline end-to-end
# ✅ Confirms it works BEFORE deploying

# Deploy with confidence
cp -r files /path/to/openclaw/
openclaw gateway restart
# Agent works on first try ✅
```

---

## Commits

### Workspace (Templates)
**Commit:** `ab710a7`  
**Message:** "Add helper script templates to generation process"  
**Files:**
- templates/openclaw-native/check-environment.sh.template
- templates/openclaw-native/install-dependencies.sh.template
- templates/openclaw-native/test-workflow.sh.template
- templates/openclaw-native/README-SCRIPTS.md
- SOUL.md (updated generation rules)
- skills/file-ops/SKILL.md (updated docs)

### linear-task-manager-v2 (Example)
**Commit:** `efb1c13`  
**Message:** "Add developer helper scripts"  
**Files:**
- check-environment.sh
- install-dependencies.sh
- test-workflow.sh
- README.md (updated with Quick Start Scripts section)

---

## Impact

### Immediate (linear-task-manager-v2)
✅ Has helper scripts  
✅ Developers can validate environment  
✅ Developers can test before deploying

### Future (All Generated Agents)
✅ **Every new agent will automatically include helper scripts**  
✅ No more manual uncertainty about dependencies  
✅ Clear validation and testing path for developers  
✅ Reduced deployment errors

---

## Testing the Integration

### Next Agent Generation Test

When you generate the next agent:

1. Architect receives requirement
2. Builder generates system
3. **Verify these files exist:**
   - ✅ check-environment.sh
   - ✅ install-dependencies.sh
   - ✅ test-workflow.sh
4. **Verify README.md documents them**
5. **Verify scripts are executable** (chmod +x)

---

## Status

**Phase 1 (Manual):** ✅ Complete  
**Phase 2 (Templatized):** ✅ Complete  
**Integration:** ✅ Complete  
**Documentation:** ✅ Complete  
**Testing:** ⏳ Awaiting next agent generation

---

## Summary

**Before:** Generated systems were OpenClaw-native but lacked developer tooling.  
**After:** Every generated system includes:
- ✅ install-dependencies.sh (auto-install)
- ✅ check-environment.sh (validate setup)
- ✅ test-workflow.sh (test pipeline)

**Result:** Developers have a clear path from clone → install → validate → test → deploy.

---

*Updated: 2024-03-18 13:15 UTC*
