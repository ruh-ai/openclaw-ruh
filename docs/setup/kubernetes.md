# Kubernetes Deployment

All manifests live in `k8s/`. The cluster uses the `openclaw` namespace.

## Prerequisites

- A Kubernetes cluster (GKE, EKS, AKS, or local)
- `kubectl` configured
- `nginx-ingress-controller` installed in the cluster
- (Optional) `cert-manager` for TLS

## Apply manifests

```bash
# Create namespace first
kubectl apply -f k8s/namespace.yaml

# Database
kubectl apply -f k8s/postgres/

# Backend
kubectl apply -f k8s/backend/

# Frontends
kubectl apply -f k8s/frontend/
kubectl apply -f k8s/agent-builder-ui/

# Ingress
kubectl apply -f k8s/ingress.yaml
```

## Secrets

Before deploying, populate the secrets in `k8s/backend/secret.yaml` and `k8s/postgres/secret.yaml`.

```bash
# Example: create backend secret imperatively
kubectl create secret generic backend-secret \
  --namespace openclaw \
  --from-literal=DATABASE_URL=postgresql://... \
  --from-literal=DAYTONA_API_KEY=... \
  --from-literal=ANTHROPIC_API_KEY=...
```

## Services and Routing

| Service | Type | Port | Ingress Path |
|---|---|---|---|
| postgres | ClusterIP | 5432 | (internal only) |
| backend | ClusterIP | 8000 | `/api/*`, `/health`, `/docs`, `/openapi.json` |
| frontend | ClusterIP | 3001 | `/` (default) |
| agent-builder-ui | ClusterIP | 3000 | `/builder/*` |

## Ingress annotations

The ingress is configured for SSE/streaming compatibility:

```yaml
nginx.ingress.kubernetes.io/proxy-buffering: "off"
nginx.ingress.kubernetes.io/proxy-read-timeout: "180"
nginx.ingress.kubernetes.io/proxy-send-timeout: "180"
nginx.ingress.kubernetes.io/proxy-connect-timeout: "10"
nginx.ingress.kubernetes.io/proxy-body-size: "50m"
```

## Resource allocations

All services use the same resource profile:

| | Request | Limit |
|---|---|---|
| CPU | 250m | 500m |
| Memory | 256Mi | 512Mi |

PostgreSQL uses:

| | Request | Limit |
|---|---|---|
| CPU | 250m | 500m |
| Memory | 256Mi | 512Mi |
| Storage | 10Gi PVC | — |

## Health checks

Both backend and frontend have readiness and liveness probes:
- Backend: `GET /health` (readiness: 15s init, 10s period; liveness: 30s init, 30s period)
- Frontend: `GET /` (same timing)

## Replicas

Backend, frontend, and agent-builder-ui all run 2 replicas. PostgreSQL runs as a StatefulSet with 1 replica.
