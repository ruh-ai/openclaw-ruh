---
name: data-ingestion-openclaw
version: 1.0.0
description: "Interact with the aget-data-ingestion FastAPI service: ingest data from external sources, query entity/result tables, write computed results. MANDATORY for every agent."
user-invocable: true
metadata:
  openclaw:
    always: true
    requires:
      bins: [curl]
      env: [DATA_INGESTION_BASE_URL, DATA_INGESTION_ORG_ID, DATA_INGESTION_AGENT_ID]
    primaryEnv: DATA_INGESTION_BASE_URL
---

# Data Ingestion Service

Base URL: ${DATA_INGESTION_BASE_URL} (default: https://ingestion-service-s45p.onrender.com)

## Key Endpoints
- GET /health — health check
- GET /ingestion/adapters — list data sources
- POST /ingestion/trigger — start async ingestion, returns job_id
- GET /ingestion/jobs/{job_id} — poll job status
- POST /data/query — read entity/result tables with filters
- POST /data/query/aggregate — GROUP BY aggregation
- POST /data/write — write results (use upsert)
- POST /data/write/batch — atomic multi-table writes
- POST /data/delete — delete with required filters
- POST /admin/schema/provision/agent — create agent schema

## Rules
- ALWAYS use upsert for writes
- ALWAYS include run_id in write requests
- NEVER pass credentials in API requests
- schema_type "shared" for entity_* (read-only), "agent" for result_* (read-write)
