# User Context

## Data Ingestion Service
- Deployed at: https://ingestion-service-s45p.onrender.com
- Render free tier — cold starts ~30-60s after inactivity
- Multi-tenant PostgreSQL with schema isolation

## Available Adapters
- Jira (basic auth via env vars)
- More adapters planned (GitHub, etc.)

## Conventions
- All agents write results through data-ingestion service
- Use upsert for idempotent writes
- Include run_id in all write operations
- Generated systems deployed to isolated Daytona sandboxes
