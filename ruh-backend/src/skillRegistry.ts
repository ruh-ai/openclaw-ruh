export interface SkillRegistryEntry {
  skill_id: string;
  name: string;
  description: string;
  tags: string[];
  skill_md: string;
}

const SKILL_REGISTRY: SkillRegistryEntry[] = [
  {
    skill_id: 'skill-creator',
    name: 'Skill Creator',
    description: 'Creates, validates, and registers new SKILL.md files for custom agent capabilities.',
    tags: ['meta', 'skill-creation', 'registry'],
    skill_md: `---
name: skill-creator
version: 1.0.0
description: "Create and register new skills for this agent."
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
user-invocable: true
---

# Skill Creator

Create new SKILL.md skill files and register them in the agent's skill directory.

## How to Create a Skill

1. Define the skill's purpose and capabilities
2. Write the SKILL.md with proper YAML frontmatter (name, version, description, allowed-tools, user-invocable)
3. Save to ~/.openclaw/workspace/skills/<skill-id>/SKILL.md
4. The skill is immediately available for use

## SKILL.md Format

\\\`\\\`\\\`yaml
---
name: <kebab-case-skill-id>
version: 1.0.0
description: "<what this skill does>"
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - WebFetch
user-invocable: true
---
\\\`\\\`\\\`

## Guidelines

- Skills should be atomic — one skill, one responsibility
- Include a clear description so the agent knows when to invoke it
- List only the tools the skill actually needs in allowed-tools
- Add a Usage section explaining when and how to invoke the skill
- Add an Implementation section with step-by-step instructions
`,
  },
  {
    skill_id: 'slack-reader',
    name: 'Slack Reader',
    description: 'Reads channels, threads, and message context from Slack workspaces.',
    tags: ['slack', 'messaging', 'collaboration'],
    skill_md: `---
name: slack-reader
version: 1.0.0
description: "Read Slack channels and conversation context."
user-invocable: true
---

# Slack Reader

Read Slack channels, threads, and recent message context for the operator's workspace.
`,
  },
  {
    skill_id: 'web-scraper',
    name: 'Web Scraper',
    description: 'Fetches and extracts structured content from public web pages.',
    tags: ['web', 'scraping', 'research'],
    skill_md: `---
name: web-scraper
version: 1.0.0
description: "Fetch and extract structured content from public websites."
user-invocable: true
---

# Web Scraper

Collect structured page content from public websites and return clean summaries or extracted fields.
`,
  },
  {
    skill_id: 'github-pr-fetcher',
    name: 'GitHub PR Fetcher',
    description: 'Reads pull requests, commits, and review state from GitHub.',
    tags: ['github', 'code', 'pull-requests'],
    skill_md: `---
name: github-pr-fetcher
version: 1.0.0
description: "Read GitHub pull requests, commits, and review metadata."
user-invocable: true
---

# GitHub PR Fetcher

Inspect pull requests, their commits, review comments, and merge readiness in GitHub repositories.
`,
  },
  {
    skill_id: 'email-sender',
    name: 'Email Sender',
    description: 'Composes and sends outbound email through a configured provider.',
    tags: ['email', 'outbound', 'communications'],
    skill_md: `---
name: email-sender
version: 1.0.0
description: "Compose and send outbound emails through a configured provider."
user-invocable: true
---

# Email Sender

Draft and send outbound email messages after validating recipients, subject, and body content.
`,
  },
  {
    skill_id: 'http-fetch',
    name: 'HTTP Fetch',
    description: 'Calls external HTTP endpoints and returns parsed response data.',
    tags: ['http', 'api', 'integration'],
    skill_md: `---
name: http-fetch
version: 1.0.0
description: "Call external HTTP endpoints and parse response payloads."
user-invocable: true
---

# HTTP Fetch

Make bounded HTTP requests to external services and return parsed, validated response data.
`,
  },
];

function normalizeSkillId(value: string): string {
  return value.trim().toLowerCase().replace(/_/g, '-');
}

export function listSkills(): SkillRegistryEntry[] {
  return SKILL_REGISTRY;
}

export function findSkill(skillId: string): SkillRegistryEntry | null {
  const normalized = normalizeSkillId(skillId);
  return SKILL_REGISTRY.find((entry) => normalizeSkillId(entry.skill_id) === normalized) ?? null;
}
