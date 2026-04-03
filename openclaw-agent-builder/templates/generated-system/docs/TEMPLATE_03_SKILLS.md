# Step 3 of 5 — Skills

## Plain English Description (Input)

```
{{PLAIN_ENGLISH_DESCRIPTION}}
```

## Added Skills

<!-- Add one row per skill -->

| #    | Skill ID          | Skill Name           | Mode   | Risk Level | Description                |
|------|-------------------|----------------------|--------|------------|----------------------------|
| S1   | `{{SKILL_ID_1}}`  | {{SKILL_NAME_1}}     | {{MODE}}| {{RISK}}  | {{SKILL_DESCRIPTION_1}}    |
| S2   | `{{SKILL_ID_2}}`  | {{SKILL_NAME_2}}     | {{MODE}}| {{RISK}}  | {{SKILL_DESCRIPTION_2}}    |
| S3   | `{{SKILL_ID_3}}`  | {{SKILL_NAME_3}}     | {{MODE}}| {{RISK}}  | {{SKILL_DESCRIPTION_3}}    |
<!-- Add more rows as needed -->

## Execution Mode Summary

| Mode  | Count          | Skill IDs                  |
|-------|----------------|----------------------------|
| HiTL  | {{HITL_COUNT}} | {{HITL_SKILL_IDS}}         |
| Auto  | {{AUTO_COUNT}} | {{AUTO_SKILL_IDS}}         |

## HiTL Skills — Approval Details

<!-- Only list skills that are in HiTL mode -->

| Skill ID          | Action Requiring Approval        | Approver              |
|-------------------|----------------------------------|-----------------------|
| `{{SKILL_ID}}`    | {{ACTION_DESCRIPTION}}           | {{APPROVER_ROLE}}     |
<!-- Add more rows as needed -->

## Skill Dependencies (Execution Order)

<!--
  Show the order in which skills execute.
  Use arrows (↓) to show flow.
  Use (→) for parallel skills.
-->

```
{{SKILL_ID_1}}
    ↓
{{SKILL_ID_2}}
    ↓
{{SKILL_ID_3}} → {{SKILL_ID_4}}
    ↓
{{SKILL_ID_5}}
```

## Skills Not Found in Library — Custom Built

<!-- List skills that had to be built from scratch -->

| Skill ID              | Reason for Custom Build                |
|-----------------------|----------------------------------------|
| `{{SKILL_ID}}`        | {{REASON}}                            |
<!-- Add more rows as needed. If none, write "None — all skills from library" -->

## ClawHub Skills Considered but Not Added

<!-- List skills that were suggested but rejected -->

| Skill Name        | Relevance | Reason Not Added                    |
|-------------------|-----------|-------------------------------------|
| `{{SKILL_NAME}}`  | {{%}}     | {{REASON}}                          |
<!-- Add more rows as needed. If none, write "None — all suggestions accepted" -->
