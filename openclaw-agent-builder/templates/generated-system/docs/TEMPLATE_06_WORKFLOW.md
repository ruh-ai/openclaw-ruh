# Workflow — End-to-End Process Flow

## Complete Workflow

<!--
  Build the workflow as ASCII box diagrams.
  Each PHASE represents a major stage in the agent's process.
  Inside each phase, list sequential steps with arrows (↓).
  Annotate each step with ← [Auto] or ← [HiTL: action] or ← [Trigger ID].

  INSTRUCTIONS FOR THE AGENT:
  1. Identify all major phases from the user's requirement
  2. Break each phase into sequential steps
  3. Mark each step with execution mode (Auto / HiTL)
  4. Mark trigger-activated steps with the trigger ID (T1-T6 etc.)
  5. Show branching logic with If/Else
-->

```
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│   PHASE 1: {{PHASE_1_NAME}}                                             │
│                                                                          │
│   {{STEP_1_DESCRIPTION}}                                                │
│           ↓                                                              │
│   {{STEP_2_DESCRIPTION}}                     ← [{{MODE}}: {{ACTION}}]   │
│           ↓                                                              │
│   {{STEP_3_DESCRIPTION}}                     ← [{{MODE}}]               │
│           ↓                                                              │
│   If {{CONDITION}} → {{EXCEPTION_ACTION}}                                │
│   If {{CONDITION}} → {{SUCCESS_ACTION}}                                  │
│                                                                          │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   PHASE 2: {{PHASE_2_NAME}}                                             │
│                                                                          │
│   {{STEP_1_DESCRIPTION}}                                                │
│           ↓                                                              │
│   {{STEP_2_DESCRIPTION}}                     ← [{{MODE}}]               │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

<!--
  Add as many PHASE blocks as needed.
  Typical count: 4–8 phases depending on complexity.
-->

## Exception Handling

<!--
  List every known exception the agent might encounter.
  For each exception, define what the agent does and who it escalates to.
-->

| Exception                        | Agent Action                          | Escalation           |
|----------------------------------|---------------------------------------|----------------------|
| {{EXCEPTION_1}}                  | {{AGENT_ACTION_1}}                    | {{ESCALATION_TO_1}}  |
| {{EXCEPTION_2}}                  | {{AGENT_ACTION_2}}                    | {{ESCALATION_TO_2}}  |
| {{EXCEPTION_3}}                  | {{AGENT_ACTION_3}}                    | {{ESCALATION_TO_3}}  |
<!-- Add more rows as needed -->
