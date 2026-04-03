# {{AVATAR}} {{AGENT_NAME}}

## Agent Overview

| Field            | Value                          |
|------------------|--------------------------------|
| **Agent Name**   | {{AGENT_NAME}}                 |
| **Agent ID**     | `{{AGENT_ID}}`                 |
| **Version**      | {{VERSION}}                    |
| **Avatar**       | {{AVATAR}}                     |
| **Tone**         | {{TONE}}                       |
| **Scope**        | {{SCOPE}}                      |
| **Model**        | {{MODEL}}                      |
| **Token Budget** | {{TOKEN_BUDGET}}               |
| **Status**       | {{STATUS}}                     |
| **Created By**   | {{CREATED_BY}}                 |
| **Created On**   | {{CREATED_DATE}}               |

## Greeting Message

```
{{GREETING_MESSAGE}}
```

## Agent File Structure

```
{{FOLDER_NAME}}/
├── README.md
├── 01_IDENTITY.md
├── 02_RULES.md
├── 03_SKILLS.md
├── 04_TRIGGERS.md
├── 05_ACCESS.md
├── 06_WORKFLOW.md
└── 07_REVIEW.md
```

## Quick Stats

| Metric              | Count            |
|----------------------|-----------------|
| Custom Rules         | {{CUSTOM_RULES_COUNT}}   |
| Inherited Org Rules  | {{ORG_RULES_COUNT}}      |
| Total Skills         | {{TOTAL_SKILLS_COUNT}}   |
| Skills (HiTL)       | {{HITL_SKILLS_COUNT}}    |
| Skills (Auto)        | {{AUTO_SKILLS_COUNT}}    |
| Scheduled Triggers   | {{SCHEDULED_TRIGGERS_COUNT}} |
| Heartbeat Monitors   | {{HEARTBEAT_COUNT}}      |
| Webhook Triggers     | {{WEBHOOK_COUNT}}        |
| Accessible Teams     | {{TEAM_COUNT}}           |
