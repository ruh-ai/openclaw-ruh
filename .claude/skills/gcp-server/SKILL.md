---
name: gcp-server
version: 1.0.0
description: |
  Manage the production GCP infrastructure for openclaw-ruh-enterprise.
  SSH into VMs, check resource usage (CPU, RAM, disk), view Docker containers,
  read logs, restart services, clean up disk, and run server maintenance.
  Use when asked to "check the server", "server health", "disk usage",
  "restart backend", "clean docker", "server logs", "SSH into prod",
  or any production infrastructure task.
allowed-tools:
  - Bash
  - Read
  - Grep
  - Glob
  - WebFetch
  - AskUserQuestion
---

# /gcp-server — Production Server Management

Manage the GCP production infrastructure for openclaw-ruh-enterprise. All commands
run via `gcloud compute ssh` — no manual SSH config needed.

---

## GCP Access Details

| Field | Value |
|---|---|
| **GCP Project** | `ruhai-469019` |
| **Zone** | `us-central1-a` |
| **Domain** | `codezero2pi.com` |

### Instances

| Instance | Type | IP | Disk | Role |
|---|---|---|---|---|
| `ruh-demo` | e2-standard-4 (4 vCPU, 16 GB RAM) | `34.31.176.40` | 100 GB | Production — all services |
| `instance-20260303-223502` | e2-medium (2 vCPU, 4 GB RAM) | `34.60.196.242` | 10 GB | Secondary/staging |

### Services on `ruh-demo`

| Subdomain | Service | Container |
|---|---|---|
| `api.codezero2pi.com` | ruh-backend | `ruh-backend-1` |
| `builder.codezero2pi.com` | agent-builder-ui | `ruh-agent-builder-ui-1` |
| `app.codezero2pi.com` | ruh-frontend | `ruh-frontend-1` |
| `admin.codezero2pi.com` | admin-ui | `ruh-admin-ui-1` |
| — | PostgreSQL | `ruh-postgres-1` |
| — | Nginx (SSL proxy) | `ruh-nginx-1` |
| — | Certbot (auto-renew) | `ruh-certbot-1` |
| — | Agent sandboxes | `openclaw-<uuid>` |

---

## SSH Pattern

**Always use this pattern to run commands on the server:**

```bash
gcloud compute ssh ruh-demo \
  --project=ruhai-469019 \
  --zone=us-central1-a \
  --command="<command>"
```

For commands requiring Docker access, prefix with `sudo`:

```bash
gcloud compute ssh ruh-demo \
  --project=ruhai-469019 \
  --zone=us-central1-a \
  --command="sudo docker ps"
```

For interactive sessions (rarely needed — prefer `--command`):

```bash
gcloud compute ssh ruh-demo --project=ruhai-469019 --zone=us-central1-a
```

---

## Common Operations

### Health Check (quick)

```bash
gcloud compute ssh ruh-demo --project=ruhai-469019 --zone=us-central1-a \
  --command="echo '=== UPTIME ===' && uptime && echo '=== MEMORY ===' && free -h && echo '=== DISK ===' && df -h / && echo '=== CONTAINERS ===' && sudo docker ps --format 'table {{.Names}}\t{{.Status}}'"
```

### Full Resource Report

```bash
gcloud compute ssh ruh-demo --project=ruhai-469019 --zone=us-central1-a \
  --command="free -h && echo '---' && df -h / && echo '---' && sudo docker system df && echo '---' && sudo docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Size}}' && echo '---' && ps aux --sort=-%mem | head -15"
```

### Service Logs

```bash
# Backend logs (last 100 lines)
gcloud compute ssh ruh-demo --project=ruhai-469019 --zone=us-central1-a \
  --command="cd /opt/ruh && sudo docker compose -f deploy/docker-compose.prod.yml logs --tail=100 backend"

# Any service: replace 'backend' with: agent-builder-ui, frontend, admin-ui, nginx, postgres
# Sandbox logs:
gcloud compute ssh ruh-demo --project=ruhai-469019 --zone=us-central1-a \
  --command="sudo docker logs --tail=100 openclaw-<uuid>"
```

### Restart a Service

```bash
# Single service
gcloud compute ssh ruh-demo --project=ruhai-469019 --zone=us-central1-a \
  --command="cd /opt/ruh && sudo docker compose -f deploy/docker-compose.prod.yml restart backend"

# Full stack
gcloud compute ssh ruh-demo --project=ruhai-469019 --zone=us-central1-a \
  --command="cd /opt/ruh && sudo docker compose -f deploy/docker-compose.prod.yml up -d"
```

### Docker Cleanup

```bash
# Prune build cache (safe — reclaims stale build layers)
gcloud compute ssh ruh-demo --project=ruhai-469019 --zone=us-central1-a \
  --command="sudo docker builder prune -f"

# Remove unused images (only images not used by any container)
gcloud compute ssh ruh-demo --project=ruhai-469019 --zone=us-central1-a \
  --command="sudo docker image prune -f"

# Full system prune (removes all unused images, networks, build cache — ASK USER FIRST)
gcloud compute ssh ruh-demo --project=ruhai-469019 --zone=us-central1-a \
  --command="sudo docker system prune -af"
```

### Database Access

```bash
gcloud compute ssh ruh-demo --project=ruhai-469019 --zone=us-central1-a \
  --command="sudo docker exec ruh-postgres-1 psql -U openclaw -d openclaw -c '<SQL>'"
```

### Sandbox Management

```bash
# List sandbox containers
gcloud compute ssh ruh-demo --project=ruhai-469019 --zone=us-central1-a \
  --command="sudo docker ps --filter 'name=openclaw-' --format 'table {{.Names}}\t{{.Status}}\t{{.Size}}'"

# Check gateway status inside a sandbox
gcloud compute ssh ruh-demo --project=ruhai-469019 --zone=us-central1-a \
  --command="sudo docker exec openclaw-<uuid> openclaw gateway status"
```

### Deploy

```bash
gcloud compute ssh ruh-demo --project=ruhai-469019 --zone=us-central1-a \
  --command="cd /opt/ruh && bash deploy/deploy.sh"
```

---

## Thresholds & Alerts

When checking server health, flag these conditions:

| Metric | Warning | Critical |
|---|---|---|
| **Disk usage** | > 70% | > 85% |
| **RAM usage** | > 75% | > 90% |
| **Load average** | > 4.0 (= vCPU count) | > 8.0 |
| **Container status** | Any "unhealthy" | Any "Exited" or missing |
| **Docker build cache** | > 20 GB | > 40 GB |

---

## Safety Rules

- **Never run `docker system prune`** without asking the user first — it removes all unused images.
- **Never restart postgres** without confirming — it interrupts all active connections.
- **Never run `deploy.sh`** without user confirmation — it resets to origin/dev and rebuilds everything.
- **Read-only commands** (health, logs, ps, df, free) are always safe to run.
- **Prefer targeted restarts** (single service) over full stack restarts.
