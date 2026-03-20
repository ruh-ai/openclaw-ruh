# Step 4 of 5 — Triggers

## Active Triggers

### {{TRIGGER_ID}} — On User Message (Always On)

| Field       | Value                              |
|-------------|------------------------------------|
| **Type**    | Conversational                     |
| **Status**  | ✅ Always On                       |
| **Channel** | {{CHANNELS}}                       |

**Sample User Queries This Trigger Handles:**

- "{{SAMPLE_QUERY_1}}"
- "{{SAMPLE_QUERY_2}}"
- "{{SAMPLE_QUERY_3}}"
- "{{SAMPLE_QUERY_4}}"
- "{{SAMPLE_QUERY_5}}"

---

<!--
  REPEAT THE BLOCK BELOW FOR EACH SCHEDULED TRIGGER.
  Copy and fill one block per scheduled trigger.
-->

### {{TRIGGER_ID}} — Scheduled: {{SCHEDULE_NAME}}

| Field           | Value                              |
|-----------------|------------------------------------|
| **Type**        | Scheduled                          |
| **Status**      | ✅ Active                          |
| **Frequency**   | {{FREQUENCY}}                      |
| **Time**        | {{TIME_WITH_TIMEZONE}}             |
| **Cron**        | `{{CRON_EXPRESSION}}`              |

**What It Does:**

- {{ACTION_1}}
- {{ACTION_2}}
- {{ACTION_3}}
<!-- Add more as needed -->

---

<!--
  REPEAT THE BLOCK BELOW FOR EACH HEARTBEAT TRIGGER.
-->

### {{TRIGGER_ID}} — Heartbeat: {{HEARTBEAT_NAME}}

| Field              | Value                           |
|--------------------|---------------------------------|
| **Type**           | Heartbeat Monitor               |
| **Status**         | ✅ Active                       |
| **Check Interval** | Every {{INTERVAL}} minutes      |
| **Cron**           | `{{CRON_EXPRESSION}}`           |

**Monitored Sources:**

| Source          | What It Watches For                          |
|-----------------|----------------------------------------------|
| **{{SOURCE_1}}**| {{WATCH_DESCRIPTION_1}}                      |
| **{{SOURCE_2}}**| {{WATCH_DESCRIPTION_2}}                      |
| **{{SOURCE_3}}**| {{WATCH_DESCRIPTION_3}}                      |
<!-- Add more as needed -->

---

<!--
  REPEAT THE BLOCK BELOW FOR EACH WEBHOOK TRIGGER.
-->

### {{TRIGGER_ID}} — Webhook: {{WEBHOOK_NAME}}

| Field              | Value                                              |
|--------------------|----------------------------------------------------|
| **Type**           | Webhook                                            |
| **Status**         | ✅ Active                                          |
| **Webhook URL**    | `{{WEBHOOK_BASE_URL}}/{{AGENT_ID}}/{{ENDPOINT}}`  |
| **Method**         | POST                                               |
| **Source System**  | {{SOURCE_SYSTEM}}                                  |
| **Auth**           | {{AUTH_TYPE}}                                      |

**Payload Expected:**

```json
{
  {{PAYLOAD_FIELDS}}
}
```

**What It Does:**

- {{ACTION_1}}
- {{ACTION_2}}
- {{ACTION_3}}
<!-- Add more as needed -->

---

## Trigger Summary

<!-- Final table listing all triggers -->

| Trigger ID | Type       | Frequency             | Status |
|------------|------------|-----------------------|--------|
| T1         | User Msg   | Always on             | ✅     |
| {{T_ID}}   | {{TYPE}}   | {{FREQUENCY}}         | ✅     |
<!-- Add more rows as needed -->
