# OpenClaw Agent Builder

A multi-agent factory system that runs on [OpenClaw](https://openclaw.dev). Give it your automation requirements and it designs, builds, tests, and deploys a fully working OpenClaw agent — complete with skills, workflows, cron jobs, and a GitHub repo.

## What This Is

 It is a set of context files (SOUL files, skills, templates, workflows) that OpenClaw reads to act as an autonomous agent builder. You drop this folder into an OpenClaw workspace, and OpenClaw becomes an agent factory.

## How It Works

```
You describe what you want
        ↓
  ┌─────────────┐
  │  Architect   │  ← Analyzes requirements, decomposes into skill graph
  └──────┬──────┘
         ↓
  ┌─────────────┐
  │   Builder    │  ← Generates all files (skills, workflows, configs, docs)
  └──────┬──────┘
         ↓
  ┌─────────────┐
  │   Tester     │  ← Validates file completeness, runs smoke tests
  └──────┬──────┘
         ↓
  ┌─────────────┐
  │  Deployer    │  ← Pushes to GitHub as a standalone repo
  └─────────────┘
```

The **Architect** orchestrates the entire pipeline — it is the only agent that spawns subagents. Builder, Tester, and Deployer each report back to the Architect.

## File Structure

```
openclaw-agent-builder/
│
├── SOUL.md                    # Architect agent persona & full pipeline logic
├── SOUL_BUILDER.md            # Builder agent — generates the output system
├── SOUL_TESTER.md             # Tester agent — validates generated systems
├── SOUL_DEPLOYER.md           # Deployer agent — pushes to GitHub
├── IDENTITY.md                # Agent identity (name, vibe, emoji)
├── BOOTSTRAP.md               # First-run conversation guide
├── USER.md                    # User context (data ingestion URL, adapters, conventions)
├── AGENTS.md                  # Agent registry & communication flow
├── TOOLS.md                   # Environment-specific tool notes
├── HEARTBEAT.md               # Heartbeat config
├── openclaw.json              # OpenClaw agent config (models, gateway, agents list)
│
├── skills/                    # Skills available to the factory agents
│   ├── architect/SKILL.md     # Requirement analysis & skill graph decomposition
│   ├── clawhub-search/SKILL.md  # Search ClawHub for existing skills
│   ├── lobster-gen/SKILL.md   # Generate Lobster workflow YAML
│   ├── data-ingestion-openclaw/SKILL.md  # Data ingestion (always included)
│   ├── file-ops/SKILL.md      # File operations
│   ├── git-ops/SKILL.md       # Git operations
│   ├── github-api/SKILL.md    # GitHub API interactions
│   ├── daytona-sdk/SKILL.md   # Daytona sandbox management
│   └── test-runner/SKILL.md   # Test execution
│
├── workflows/
│   └── build-pipeline.yaml    # Master Lobster workflow (analyze → build → test → deploy)
│
├── templates/                 # Templates used by the Builder to generate output
│   ├── generated-system/      # Full system scaffolding
│   │   ├── openclaw.json.template
│   │   ├── SOUL.md.template
│   │   ├── README.md.template
│   │   ├── daytona.yaml.template
│   │   ├── .gitignore.template
│   │   ├── skills/data-ingestion-openclaw/SKILL.md
│   │   ├── workflows/main-workflow.yaml.template
│   │   └── docs/              # 7 documentation templates (01_IDENTITY → 07_REVIEW)
│   │       ├── TEMPLATE_01_IDENTITY.md
│   │       ├── TEMPLATE_02_RULES.md
│   │       ├── TEMPLATE_03_SKILLS.md
│   │       ├── TEMPLATE_04_TRIGGERS.md
│   │       ├── TEMPLATE_05_ACCESS.md
│   │       ├── TEMPLATE_06_WORKFLOW.md
│   │       ├── TEMPLATE_07_REVIEW.md
│   │       ├── TEMPLATE_README.md
│   │       └── HOW_TO_USE.md
│   └── openclaw-native/       # OpenClaw-native generation templates
│       ├── skill-inline-exec.md.template
│       ├── soul-workflow.md.template
│       ├── cron-job.json.template
│       ├── check-environment.sh.template
│       ├── install-dependencies.sh.template
│       └── test-workflow.sh.template
│
├── output/                    # Generated agent systems (staging area)
│   ├── linear-task-manager/   # Example: generated Linear task manager agent
│   └── ...                    # Each build produces a folder here
│
├── GENERATION_MODE_UPDATE.md  # Docs on the OpenClaw-native generation mode
└── HELPER_SCRIPTS_INTEGRATION.md  # Docs on helper script generation
```

## Replicating This on Your Own OpenClaw Instance

### Prerequisites

- A running [OpenClaw](https://openclaw.dev) instance (typically inside a [Daytona](https://daytona.io) sandbox)
- OpenClaw CLI installed (`openclaw` command available)
- GitHub CLI (`gh`) authenticated (for the Deployer to push repos)
- A data-ingestion service URL (see `USER.md` for the default)

### Step-by-Step Setup

**1. Clone this repo into your OpenClaw workspace**

```bash
git clone <repo-url>
cd openclaw-sandbox-poc/openclaw-agent-builder
```

**2. Copy the workspace files to your OpenClaw instance**

```bash
# Copy the main workspace files
cp SOUL.md IDENTITY.md BOOTSTRAP.md USER.md AGENTS.md TOOLS.md HEARTBEAT.md \
   ~/.openclaw/workspace/

# Copy the agent-specific SOUL files
mkdir -p ~/.openclaw/agents/architect/agent
cp SOUL.md ~/.openclaw/agents/architect/agent/

# Copy skills
cp -r skills/ ~/.openclaw/workspace/skills/

# Copy templates (Builder reads these during generation)
cp -r templates/ ~/.openclaw/workspace/templates/

# Copy workflows
cp -r workflows/ ~/.openclaw/workspace/workflows/
```

**3. Configure `openclaw.json`**

Copy `openclaw.json` to your OpenClaw config directory and update:

```bash
cp openclaw.json ~/.openclaw/openclaw.json
```

Edit to set your own:
- Model preferences under `agents.defaults.model`
- Gateway auth token under `gateway.auth.token`
- Workspace paths if they differ from defaults

**4. Set environment variables**

```bash
# Required for data ingestion (all generated agents use this)
export DATA_INGESTION_BASE_URL="https://your-ingestion-service.com"
export DATA_INGESTION_ORG_ID="your-org"
export DATA_INGESTION_AGENT_ID="agent-factory"

# Required for deployment
export GITHUB_OWNER="your-github-username-or-org"

# Required for Daytona sandbox provisioning
export DAYTONA_API_KEY="your-key"
export DAYTONA_API_URL="https://app.daytona.io/api"
```

**5. Start OpenClaw**

```bash
openclaw start --daemon
```

**6. Talk to your agent**

Open a session and describe the automation you want:

> "I need an agent that pulls Jira sprint data every 6 hours, calculates developer velocity metrics, and sends a daily digest to Telegram."

The Architect will:
1. Analyze your requirements
2. Search ClawHub for existing skills
3. Present a skill graph for your approval
4. Build, test, and deploy the complete agent to GitHub

### What Gets Generated

Every agent the factory builds produces this structure:

```
<system-name>/
├── README.md                    # Deployment guide
├── openclaw.json                # Agent config
├── .env.example                 # Required env vars
├── .gitignore
├── check-environment.sh         # Validates binaries + env vars + API connectivity
├── install-dependencies.sh      # Auto-installs dependencies
├── test-workflow.sh             # Tests data pipeline manually
├── cron/<job-name>.json         # OpenClaw cron job definitions
├── workflows/main.yaml          # Lobster workflow
├── workspace/
│   ├── SOUL.md                  # Agent persona + workflow orchestration
│   ├── IDENTITY.md
│   └── 01-07 documentation files
└── skills/
    ├── data-ingestion-openclaw/SKILL.md
    └── <custom-skill>/SKILL.md  # Inline exec commands (no separate .py files)
```

## Key Concepts

- **SOUL files** — Define agent personality, rules, and orchestration logic. The agent reads these to know who it is and what to do.
- **Skills** — Modular capabilities in `SKILL.md` format. Each skill contains inline bash/python commands that the agent executes via `exec()`.
- **Lobster workflows** — Deterministic YAML pipelines that wire skills together in dependency order.
- **Data ingestion** — Every generated agent writes results through a central data-ingestion service using upsert operations with `run_id` for audit trails.
- **OpenClaw-native** — Generated agents are NOT standalone Python scripts. They are OpenClaw agents with inline exec skills, cron triggers, and `message()` tool for notifications.

## Customizing

- **Add new skills**: Create a `SKILL.md` in `skills/<skill-name>/` following the OpenClaw frontmatter format
- **Modify generation templates**: Edit files in `templates/` to change what the Builder produces
- **Change agent behavior**: Edit the SOUL files (`SOUL.md`, `SOUL_BUILDER.md`, `SOUL_TESTER.md`, `SOUL_DEPLOYER.md`)
- **Add data sources**: Update `USER.md` with new adapter info and the Architect will account for them
