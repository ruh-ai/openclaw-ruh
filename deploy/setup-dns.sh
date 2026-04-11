#!/bin/bash
# =============================================================================
# setup-dns.sh — Create Cloud DNS zone and records for codezero2pi.com
#
# This script:
#   1. Enables the Cloud DNS API
#   2. Creates a managed zone for codezero2pi.com
#   3. Adds A records for all 4 subdomains → the GCE VM's external IP
#   4. Prints the Google nameservers you need to set in GoDaddy
#
# Prerequisites:
#   - gcloud CLI installed and authenticated
#   - A GCP project selected (gcloud config set project <PROJECT_ID>)
#   - The GCE VM must have a static external IP
#
# Usage:
#   bash deploy/setup-dns.sh
#   # OR with a specific project:
#   bash deploy/setup-dns.sh --project my-gcp-project
# =============================================================================

set -euo pipefail

DOMAIN="codezero2pi.com"
ZONE_NAME="codezero2pi"
SUBDOMAINS=("builder" "app" "admin" "api")
TTL=300

# Parse optional --project flag
GCP_PROJECT=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --project) GCP_PROJECT="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

if [ -n "$GCP_PROJECT" ]; then
  gcloud config set project "$GCP_PROJECT"
fi

CURRENT_PROJECT=$(gcloud config get-value project 2>/dev/null)
echo "============================================"
echo " Cloud DNS Setup for ${DOMAIN}"
echo " GCP Project: ${CURRENT_PROJECT}"
echo "============================================"
echo ""

# ── 1. Get VM external IP ────────────────────────────────────────────────────
echo "[1/4] Detecting VM external IP..."
VM_IP=$(curl -sf http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip -H "Metadata-Flavor: Google" 2>/dev/null || echo "")

if [ -z "$VM_IP" ]; then
  echo "  Not running on a GCE VM. Trying to find the VM IP from gcloud..."
  # Try to find the first VM with an external IP in the project
  VM_IP=$(gcloud compute instances list --format="value(networkInterfaces[0].accessConfigs[0].natIP)" --limit=1 2>/dev/null || echo "")
fi

if [ -z "$VM_IP" ]; then
  echo "  Could not auto-detect VM IP."
  read -rp "  Enter your GCE VM's external IP: " VM_IP
fi

echo "  Using IP: ${VM_IP}"
echo ""

# ── 2. Enable Cloud DNS API ──────────────────────────────────────────────────
echo "[2/4] Enabling Cloud DNS API..."
gcloud services enable dns.googleapis.com --quiet
echo "  Cloud DNS API enabled"
echo ""

# ── 3. Create managed zone ──────────────────────────────────────────────────
echo "[3/4] Creating managed zone '${ZONE_NAME}' for ${DOMAIN}..."

if gcloud dns managed-zones describe "$ZONE_NAME" &>/dev/null; then
  echo "  Zone '${ZONE_NAME}' already exists — skipping creation"
else
  gcloud dns managed-zones create "$ZONE_NAME" \
    --dns-name="${DOMAIN}." \
    --description="DNS zone for ${DOMAIN} — openclaw-ruh-enterprise" \
    --visibility=public
  echo "  Zone created"
fi
echo ""

# ── 4. Add A records for subdomains ─────────────────────────────────────────
echo "[4/4] Adding A records..."

# Start a transaction to batch all record changes
gcloud dns record-sets transaction start --zone="$ZONE_NAME"

for SUB in "${SUBDOMAINS[@]}"; do
  FQDN="${SUB}.${DOMAIN}."

  # Check if record already exists
  EXISTING=$(gcloud dns record-sets list --zone="$ZONE_NAME" --name="$FQDN" --type=A --format="value(rrdatas[0])" 2>/dev/null || echo "")

  if [ -n "$EXISTING" ]; then
    echo "  ${FQDN} already exists (${EXISTING}) — removing old record first"
    gcloud dns record-sets transaction remove "$EXISTING" \
      --zone="$ZONE_NAME" \
      --name="$FQDN" \
      --type=A \
      --ttl=$TTL
  fi

  echo "  Adding ${FQDN} → ${VM_IP}"
  gcloud dns record-sets transaction add "$VM_IP" \
    --zone="$ZONE_NAME" \
    --name="$FQDN" \
    --type=A \
    --ttl=$TTL
done

# Execute the transaction
gcloud dns record-sets transaction execute --zone="$ZONE_NAME"
echo "  All A records created"
echo ""

# ── Print nameservers ────────────────────────────────────────────────────────
echo "============================================"
echo " DNS records created! Now update GoDaddy."
echo "============================================"
echo ""
echo "Google Cloud DNS nameservers for ${DOMAIN}:"
echo ""
gcloud dns managed-zones describe "$ZONE_NAME" --format="value(nameServers)" | tr ';' '\n' | while read -r ns; do
  echo "  ${ns}"
done
echo ""
echo "┌─────────────────────────────────────────────────────────────┐"
echo "│  Go to GoDaddy → My Products → ${DOMAIN}                   │"
echo "│  → DNS → Nameservers → Change → Custom                     │"
echo "│                                                             │"
echo "│  Replace the GoDaddy nameservers with the Google ones above │"
echo "│                                                             │"
echo "│  Propagation takes 15 min – 48 hours (usually ~1 hour)     │"
echo "└─────────────────────────────────────────────────────────────┘"
echo ""
echo "To verify propagation:"
echo "  dig builder.${DOMAIN} +short"
echo "  dig app.${DOMAIN} +short"
echo "  dig admin.${DOMAIN} +short"
echo "  dig api.${DOMAIN} +short"
echo ""
echo "Once DNS resolves to ${VM_IP}, run:"
echo "  bash deploy/init-ssl.sh your@email.com"
echo ""
