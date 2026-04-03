---
name: test-runner
version: 1.0.0
description: "Validate generated multi-agent systems: check SKILL.md syntax, verify openclaw.json config, run Lobster workflows against test data, verify result writes to data-ingestion service."
user-invocable: false
metadata:
  openclaw:
    requires:
      bins: [curl, jq]
      env: [DATA_INGESTION_BASE_URL]
---

# Test Runner Skill

End-to-end validation of generated multi-agent systems.

## Test Phases

### Phase 1: Static Validation
- Check YAML frontmatter exists and is valid
- Check required fields: name, description, version
- Check metadata.openclaw.requires.env includes DATA_INGESTION_* vars
- Check instructions section is non-empty
- Validate openclaw.json structure
- Validate Lobster workflow DAG

### Phase 2: Schema Provisioning
Provision test org/agent schema via data-ingestion service.

### Phase 3: Smoke Test Execution
Run each processing skill with mock/minimal input data.

### Phase 4: Write Verification (CRITICAL)
Query result_metrics for test run. FAIL if zero rows written.

### Phase 5: Cleanup
Delete test data using the data-ingestion delete endpoint.

Output a JSON report with pass/fail status for each phase.
