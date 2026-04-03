# Helper Scripts Template Documentation

This document explains how to generate the three helper scripts for any OpenClaw-native agent.

## Scripts to Generate

1. **check-environment.sh** - Validates environment setup
2. **install-dependencies.sh** - Auto-installs dependencies
3. **test-workflow.sh** - Tests the data pipeline

---

## Template Variables

### check-environment.sh.template

| Variable | Type | Example | Description |
|----------|------|---------|-------------|
| `{{SYSTEM_NAME}}` | string | "linear-task-manager" | Human-readable system name |
| `{{BINARY_CHECKS}}` | multiline | See below | check_binary calls for each required binary |
| `{{ENV_VAR_CHECKS}}` | multiline | See below | check_env calls for each env var |
| `{{CUSTOM_CHECKS}}` | multiline | Optional | Additional validation logic |

**BINARY_CHECKS example:**
```bash
check_binary "curl" "apt-get install curl"
check_binary "jq" "apt-get install jq"
check_binary "python3" "apt-get install python3"
check_binary "linear" "npm install -g linear-cli"
```

**ENV_VAR_CHECKS example:**
```bash
check_env "LINEAR_API_KEY"
check_env "DATA_INGESTION_BASE_URL"
check_env "DATA_INGESTION_ORG_ID"
check_env "DATA_INGESTION_AGENT_ID"
check_env "TELEGRAM_CHAT_ID"
```

**CUSTOM_CHECKS example (Linear-specific):**
```bash
echo ""
echo "=== Checking Linear API Access ==="

if [ -n "$LINEAR_API_KEY" ]; then
    if command -v linear &> /dev/null; then
        LINEAR_TEST=$(linear whoami 2>&1 || echo "failed")
        if [[ "$LINEAR_TEST" != *"failed"* ]]; then
            echo -e "${GREEN}✓${NC} Linear API key is valid"
        else
            echo -e "${RED}✗${NC} Linear API key test failed"
            ERRORS=$((ERRORS + 1))
        fi
    fi
fi
```

---

### install-dependencies.sh.template

| Variable | Type | Example | Description |
|----------|------|---------|-------------|
| `{{SYSTEM_NAME}}` | string | "linear-task-manager" | System name |
| `{{SYSTEM_PACKAGES_APT}}` | string | "curl jq python3" | Space-separated apt packages |
| `{{SYSTEM_PACKAGES_YUM}}` | string | "curl jq python3" | Space-separated yum packages |
| `{{SYSTEM_PACKAGES_BREW}}` | string | "curl jq python3" | Space-separated brew packages |
| `{{SYSTEM_PACKAGES_LIST}}` | string | "curl, jq, python3" | Comma-separated for manual install hint |
| `{{NPM_PACKAGES_INSTALL}}` | multiline | See below | npm install commands |

**NPM_PACKAGES_INSTALL example:**
```bash
echo ""
echo "=== Installing linear-cli ==="

if command -v linear &> /dev/null; then
    echo -e "${YELLOW}⚠${NC} linear-cli is already installed"
    read -p "Reinstall? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        npm install -g linear-cli
        echo -e "${GREEN}✓${NC} linear-cli reinstalled"
    fi
else
    npm install -g linear-cli
    echo -e "${GREEN}✓${NC} linear-cli installed"
fi
```

---

### test-workflow.sh.template

| Variable | Type | Example | Description |
|----------|------|---------|-------------|
| `{{SYSTEM_NAME}}` | string | "linear-task-manager" | System name |
| `{{REQUIRED_ENV_VARS_ARRAY}}` | string | '"LINEAR_API_KEY" "DATA_INGESTION_BASE_URL"' | Bash array of env vars |
| `{{WORKFLOW_TEST_STEPS}}` | multiline | See below | Test steps for the workflow |

**WORKFLOW_TEST_STEPS example (simplified Linear workflow):**
```bash
echo ""
echo "=== Step 1: Fetch Data ==="
# Call external API or CLI
linear issue list --assignee @me --json > /tmp/data_${RUN_ID}.json
ITEM_COUNT=$(jq '. | length' /tmp/data_${RUN_ID}.json)
echo -e "${GREEN}✓${NC} Fetched $ITEM_COUNT items"

echo ""
echo "=== Step 2: Transform Data ==="
# Transform to target schema
python3 -c 'import json, sys, os; ...' < /tmp/data_${RUN_ID}.json > /tmp/transformed_${RUN_ID}.json
echo -e "${GREEN}✓${NC} Transformed data"

echo ""
echo "=== Step 3: Write to Data Ingestion ==="
curl -s -X POST ${DATA_INGESTION_BASE_URL}/data/write \
  -H "Content-Type: application/json" \
  -d @/tmp/transformed_${RUN_ID}.json
echo -e "${GREEN}✓${NC} Wrote to data-ingestion"

echo ""
echo "=== Cleanup ==="
rm -f /tmp/data_${RUN_ID}.json /tmp/transformed_${RUN_ID}.json
echo -e "${GREEN}✓${NC} Cleaned up"
```

---

## Builder Integration

The builder should:

1. Read skill requirements from skill graph
2. Collect all required binaries and env vars
3. Generate custom checks for external APIs
4. Fill templates with collected data
5. Write scripts to output directory
6. Make scripts executable (chmod +x)

### Example Builder Logic

```python
def generate_helper_scripts(system_name: str, skills: list, requirements: dict):
    """Generate the three helper scripts for an OpenClaw-native agent"""
    
    # Collect requirements from skills
    binaries = set(["curl", "python3"])  # Always required
    env_vars = set(["DATA_INGESTION_BASE_URL", "DATA_INGESTION_ORG_ID", "DATA_INGESTION_AGENT_ID"])
    npm_packages = []
    
    for skill in skills:
        if skill.get("metadata", {}).get("openclaw", {}).get("requires", {}).get("bins"):
            binaries.update(skill["metadata"]["openclaw"]["requires"]["bins"])
        if skill.get("metadata", {}).get("openclaw", {}).get("requires", {}).get("env"):
            env_vars.update(skill["metadata"]["openclaw"]["requires"]["env"])
    
    # Generate BINARY_CHECKS
    binary_checks = []
    for binary in sorted(binaries):
        if binary in ["curl", "jq"]:
            install_hint = f"apt-get install {binary}"
        elif binary == "python3":
            install_hint = "apt-get install python3"
        elif binary == "linear":
            install_hint = "npm install -g linear-cli"
            npm_packages.append("linear-cli")
        else:
            install_hint = f"Install {binary}"
        
        binary_checks.append(f'check_binary "{binary}" "{install_hint}"')
    
    # Generate ENV_VAR_CHECKS
    env_var_checks = [f'check_env "{var}"' for var in sorted(env_vars)]
    
    # Render templates
    render_template("check-environment.sh.template", {
        "SYSTEM_NAME": system_name,
        "BINARY_CHECKS": "\\n".join(binary_checks),
        "ENV_VAR_CHECKS": "\\n".join(env_var_checks),
        "CUSTOM_CHECKS": generate_custom_checks(skills)
    })
    
    # ... similar for install-dependencies.sh and test-workflow.sh
```

---

## Standard Requirements by System Type

### Data Pipeline Systems (common)
**Binaries:** curl, jq, python3  
**Env Vars:** DATA_INGESTION_BASE_URL, DATA_INGESTION_ORG_ID, DATA_INGESTION_AGENT_ID, RUN_ID

### Systems with External APIs
**Example: Linear**
- Binaries: +linear
- Env Vars: +LINEAR_API_KEY
- Custom Check: Test `linear whoami`

**Example: GitHub**
- Binaries: +gh
- Env Vars: +GITHUB_TOKEN, +GITHUB_ORG
- Custom Check: Test `gh auth status`

**Example: Jira**
- Binaries: (none, uses curl)
- Env Vars: +JIRA_URL, +JIRA_USER, +JIRA_API_TOKEN
- Custom Check: Test Jira API connectivity

### Systems with Message Delivery
**Telegram:**
- Env Vars: +TELEGRAM_CHAT_ID
- Custom Check: Verify OpenClaw Telegram config

**Slack:**
- Env Vars: +SLACK_CHANNEL_ID
- Custom Check: Verify OpenClaw Slack config

---

## File Generation Order

1. Generate `check-environment.sh` first (developers run this to validate setup)
2. Generate `install-dependencies.sh` second (if check fails, run this)
3. Generate `test-workflow.sh` third (after environment is ready, test pipeline)

All scripts should be **executable** (chmod +x) and included in README.md Quick Start section.
