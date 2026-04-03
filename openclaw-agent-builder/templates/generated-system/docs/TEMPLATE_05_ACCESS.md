# Step 5 of 5 — Access

## User Access

| Field              | Value                          |
|--------------------|--------------------------------|
| **Access Type**    | {{ACCESS_TYPE}}                |

### Authorized Teams

| Team               | Access Level | Members (approx) |
|--------------------|-------------|-------------------|
| {{TEAM_1}}         | {{LEVEL}}   | {{COUNT}}         |
| {{TEAM_2}}         | {{LEVEL}}   | {{COUNT}}         |
<!-- Add more rows as needed -->

### Restricted From

| Team / Role          | Reason                          |
|----------------------|---------------------------------|
| {{RESTRICTED_1}}     | {{REASON_1}}                    |
| {{RESTRICTED_2}}     | {{REASON_2}}                    |
<!-- Add more rows as needed -->

---

## HiTL Approvers

| Skill                | Action                         | Approver             | Fallback Approver    |
|----------------------|--------------------------------|----------------------|----------------------|
| `{{SKILL_ID}}`       | {{ACTION}}                     | {{APPROVER}}         | {{FALLBACK}}         |
<!-- Add one row per HiTL skill -->

### Approval Thresholds

<!-- Define amount-based approval routing. Remove section if not applicable. -->

| Amount Range              | Approver Required       |
|---------------------------|-------------------------|
| Below {{THRESHOLD_1}}     | {{APPROVER_1}}          |
| {{THRESHOLD_1}} – {{THRESHOLD_2}} | {{APPROVER_2}} |
| Above {{THRESHOLD_2}}     | {{APPROVER_3}}          |

### Approval SLA

| Priority   | Max Response Time     |
|------------|-----------------------|
| Normal     | {{NORMAL_SLA}}        |
| High       | {{HIGH_SLA}}          |
| Critical   | {{CRITICAL_SLA}}      |

If approver does not respond within SLA → auto-escalate to fallback approver.

---

## Model Configuration

| Field                | Value                          |
|----------------------|--------------------------------|
| **Primary Model**    | {{PRIMARY_MODEL}}              |
| **Fallback Model**   | {{FALLBACK_MODEL}}             |
| **Reason**           | {{MODEL_REASON}}               |

### Model Routing (if Auto mode were selected)

<!-- Map task types to recommended models -->

| Task Type                        | Recommended Model  |
|----------------------------------|--------------------|
| {{TASK_TYPE_1}}                  | {{MODEL_1}}        |
| {{TASK_TYPE_2}}                  | {{MODEL_2}}        |
<!-- Add more rows as needed -->

---

## Token Budget

| Field                  | Value                  |
|------------------------|------------------------|
| **Monthly Budget**     | {{TOKEN_BUDGET}}       |
| **Alert Threshold**    | {{ALERT_THRESHOLD}}    |
| **Auto-Pause on Limit**| {{AUTO_PAUSE}}        |

---

## Security & Permissions

| Permission                         | Allowed    |
|------------------------------------|------------|
| {{PERMISSION_1}}                   | ✅ / ❌    |
| {{PERMISSION_2}}                   | ✅ / ❌    |
| {{PERMISSION_3}}                   | ✅ (HiTL)  |
<!-- Add more rows as needed -->
