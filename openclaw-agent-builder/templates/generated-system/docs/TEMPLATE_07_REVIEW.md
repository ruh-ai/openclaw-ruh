# Review — Final Summary Before Deployment

## Agent Card

| Field              | Value                          |
|--------------------|--------------------------------|
| **Name**           | {{AVATAR}} {{AGENT_NAME}}      |
| **ID**             | `{{AGENT_ID}}`                 |
| **Version**        | {{VERSION}}                    |
| **Scope**          | {{SCOPE}}                      |
| **Tone**           | {{TONE}}                       |
| **Model**          | {{MODEL}}                      |
| **Token Budget**   | {{TOKEN_BUDGET}}               |

---

## Rules Summary

| Type               | Count                    |
|--------------------|--------------------------|
| Custom Rules       | {{CUSTOM_RULES_COUNT}}   |
| Inherited Org Rules| {{ORG_RULES_COUNT}}      |
| **Total**          | **{{TOTAL_RULES_COUNT}}**|

---

## Skills Summary

<!-- List every skill with its mode -->

| Skill                     | Mode         |
|---------------------------|--------------|
| {{SKILL_NAME_1}}          | 🔴 HiTL / 🟢 Auto |
| {{SKILL_NAME_2}}          | 🔴 HiTL / 🟢 Auto |
<!-- Add more rows as needed -->

| Mode     | Count              |
|----------|--------------------|
| 🔴 HiTL | {{HITL_COUNT}}     |
| 🟢 Auto | {{AUTO_COUNT}}     |
| **Total**| **{{TOTAL_COUNT}}**|

---

## Triggers Summary

| Trigger                    | Type       | Schedule              |
|----------------------------|------------|-----------------------|
| {{TRIGGER_NAME_1}}         | {{TYPE}}   | {{SCHEDULE}}          |
| {{TRIGGER_NAME_2}}         | {{TYPE}}   | {{SCHEDULE}}          |
<!-- Add more rows as needed -->

---

## Access Summary

| Field                  | Value                          |
|------------------------|--------------------------------|
| **Teams**              | {{TEAM_LIST}}                  |
| **Approver (default)** | {{DEFAULT_APPROVER}}           |
| **Approver (elevated)**| {{ELEVATED_APPROVER}}          |
| **Approval SLA**       | {{SLA_SUMMARY}}                |

---

## ⚠️ Deployment Warnings

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  ⚠️  {{HITL_COUNT}} skills require Human-in-the-Loop        │
│                                                             │
│     • {{HITL_SKILL_1}}  → {{APPROVER_1}}                   │
│     • {{HITL_SKILL_2}}  → {{APPROVER_2}}                   │
│                                                             │
│  ⚠️  {{WEBHOOK_COUNT}} webhook endpoints will be generated  │
│                                                             │
│     • {{WEBHOOK_ENDPOINT_1}} ({{SOURCE_1}})                 │
│     • {{WEBHOOK_ENDPOINT_2}} ({{SOURCE_2}})                 │
│                                                             │
│  ⚠️  Heartbeat monitor will check {{SOURCE_COUNT}} sources  │
│                                                             │
│     • {{MONITORED_SOURCE_1}}                                │
│     • {{MONITORED_SOURCE_2}}                                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Deployment Actions

| Action                                  | Status    |
|-----------------------------------------|-----------|
| [← Edit] Go back and modify any step   | Available |
| [🚀 Create Agent] Deploy and activate   | Ready     |

---

## Post-Deployment Checklist

<!-- List every integration and validation step needed after deployment -->

- [ ] {{CHECKLIST_ITEM_1}}
- [ ] {{CHECKLIST_ITEM_2}}
- [ ] {{CHECKLIST_ITEM_3}}
- [ ] {{CHECKLIST_ITEM_4}}
- [ ] {{CHECKLIST_ITEM_5}}
<!-- Add more as needed -->
