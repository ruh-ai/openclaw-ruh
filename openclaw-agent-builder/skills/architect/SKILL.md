---
name: architect
version: 1.0.0
description: "Analyze developer automation requirements and decompose them into a skill graph, Lobster workflow, and OpenClaw agent config."
user-invocable: true
metadata:
  openclaw:
    always: true
---

# Architect Skill

Receive structured requirements, decompose into capabilities, search ClawHub for existing skills, generate custom skills for gaps, produce Lobster workflows.

## Process
1. Parse requirement payload (automation_type, data_sources, outputs)
2. Check data-ingestion adapters first (GET /ingestion/adapters)
3. Search ClawHub/skills.sh for existing skills
4. Present hybrid options: existing vs custom per capability
5. Generate skill graph DAG with dependencies
6. Generate Lobster workflow from topological sort
7. Present for developer approval
