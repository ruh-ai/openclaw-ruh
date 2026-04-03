---
name: daytona-sdk
version: 1.0.0
description: "Provision isolated Daytona sandboxes for generated multi-agent systems. Create sandboxes, install OpenClaw, deploy workspace files, configure environment variables, and start the gateway."
user-invocable: false
metadata:
  openclaw:
    requires:
      bins: [curl]
      env: [DAYTONA_API_KEY, DAYTONA_BASE_URL]
    primaryEnv: DAYTONA_API_KEY
---

# Daytona SDK Skill

Provision and manage isolated Daytona sandboxes for deploying generated multi-agent systems.

## Operations

- Create sandbox with daytona-medium snapshot (2GB+ memory)
- Execute commands in sandbox (install OpenClaw, deploy files)
- Upload files as tar archives to sandbox workspace
- Set environment variables (data-ingestion config, credentials)
- Start OpenClaw gateway
- Get sandbox status and preview URL

## Deployment Workflow

1. Create sandbox with daytona-medium snapshot
2. Install OpenClaw in the sandbox
3. Upload generated system files to workspace
4. Set environment variables
5. Start OpenClaw gateway
6. Verify health
7. Return sandbox URL and SSH connection string

## Rules

- Always use daytona-medium snapshot (2GB+ memory required)
- Never store credentials in filesystem — use env vars
- Each generated system gets a unique sandbox — no sharing
- Verify OpenClaw gateway is running before reporting success
