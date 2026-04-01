# Agent Template System — How It Works

## Purpose

These templates act as structural references for an AI agent when generating
agent configuration files. The agent reads the template, replaces placeholders
with actual data from the user's requirements, and produces a consistent,
high-quality output every time.

## How to Use

1. User provides a requirement (plain English or structured input)
2. Agent reads the relevant template file
3. Agent maps user's requirement data to the placeholder fields
4. Agent generates the final `.md` file with real data filled in
5. Output follows the exact same structure, formatting, and section order as the template

## Placeholder Format

All placeholders use double curly braces: `{{PLACEHOLDER_NAME}}`

Examples:
- `{{AGENT_NAME}}` → "Construction Finance Agent"
- `{{AVATAR}}` → "🏗️"
- `{{SKILL_NAME}}` → "invoice-ocr"

## Template Files

```
agent-templates/
├── HOW_TO_USE.md                      ← You are here
├── TEMPLATE_01_IDENTITY.md            ← Identity config template
├── TEMPLATE_02_RULES.md               ← Rules config template
├── TEMPLATE_03_SKILLS.md              ← Skills config template
├── TEMPLATE_04_TRIGGERS.md            ← Triggers config template
├── TEMPLATE_05_ACCESS.md              ← Access config template
├── TEMPLATE_06_WORKFLOW.md            ← Workflow config template
├── TEMPLATE_07_REVIEW.md              ← Review summary template
└── TEMPLATE_README.md                 ← README overview template
```

## Rules for the Agent

- Never skip a section — if data is not available, write "TBD" or "Not configured"
- Never change the table column structure
- Never add extra explanation text — only fill data
- Keep the same heading levels (##, ###) as the template
- Keep the same table column order as the template
- If a section has repeating rows (like skills or rules), add as many rows as needed
- Always preserve the ← [Auto] / ← [HiTL] annotations in workflow diagrams
