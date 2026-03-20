# Step 2 of 5 — Rules

## Custom Agent Rules

<!-- Add one row per custom rule. Max 20 rules. -->

| #    | Rule                  | Category        |
|------|-----------------------|-----------------|
| R1   | {{RULE_1}}            | {{CATEGORY_1}}  |
| R2   | {{RULE_2}}            | {{CATEGORY_2}}  |
| R3   | {{RULE_3}}            | {{CATEGORY_3}}  |
<!-- Add more rows as needed up to R20 -->

## Inherited Org Soul Rules (Cannot Be Removed)

<!-- These come from org-level config. Agent cannot override. -->

| #    | Rule                  | Source          |
|------|-----------------------|-----------------|
| OS1  | {{ORG_RULE_1}}        | Org Admin       |
| OS2  | {{ORG_RULE_2}}        | Org Admin       |
| OS3  | {{ORG_RULE_3}}        | Org Admin       |
<!-- Add more rows as needed -->

## Rule Enforcement Summary

| Metric                  | Value                      |
|-------------------------|----------------------------|
| Total Custom Rules      | {{CUSTOM_RULES_COUNT}}     |
| Total Inherited Rules   | {{ORG_RULES_COUNT}}        |
| **Total Active Rules**  | **{{TOTAL_RULES_COUNT}}**  |
| Max Allowed             | 20                         |
| Remaining Slots         | {{REMAINING_SLOTS}}        |

## Rule Categories Breakdown

<!-- Group rules by category -->

| Category        | Count | Rule IDs              |
|-----------------|-------|-----------------------|
| {{CATEGORY_1}}  | {{N}} | {{RULE_IDS}}          |
| {{CATEGORY_2}}  | {{N}} | {{RULE_IDS}}          |
<!-- Add more rows as needed -->
