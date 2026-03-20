#!/bin/bash
# check-environment.sh
# Validates that all required dependencies are installed for linear-task-manager

set -e

echo "🔍 Checking Linear Task Manager Environment..."
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ERRORS=0

# Check required binaries
echo "=== Checking Required Binaries ==="

check_binary() {
    local cmd=$1
    local install_hint=$2
    if command -v "$cmd" &> /dev/null; then
        echo -e "${GREEN}✓${NC} $cmd is installed"
    else
        echo -e "${RED}✗${NC} $cmd is NOT installed"
        echo "  Install: $install_hint"
        ERRORS=$((ERRORS + 1))
    fi
}

check_binary "curl" "apt-get install curl (or yum install curl)"
check_binary "jq" "apt-get install jq (or brew install jq)"
check_binary "python3" "apt-get install python3"
check_binary "node" "Install from https://nodejs.org"
check_binary "npm" "Install from https://nodejs.org"
check_binary "linear" "npm install -g linear-cli"

echo ""
echo "=== Checking Environment Variables ==="

check_env() {
    local var=$1
    if [ -z "${!var}" ]; then
        echo -e "${RED}✗${NC} $var is NOT set"
        ERRORS=$((ERRORS + 1))
    else
        # Mask sensitive values
        if [[ $var == *"KEY"* ]] || [[ $var == *"TOKEN"* ]]; then
            echo -e "${GREEN}✓${NC} $var is set (value: ${!var:0:8}...)"
        else
            echo -e "${GREEN}✓${NC} $var is set (value: ${!var})"
        fi
    fi
}

check_env "LINEAR_API_KEY"
check_env "DATA_INGESTION_BASE_URL"
check_env "DATA_INGESTION_ORG_ID"
check_env "DATA_INGESTION_AGENT_ID"
check_env "TELEGRAM_CHAT_ID"

echo ""
echo "=== Checking OpenClaw Installation ==="

if command -v openclaw &> /dev/null; then
    echo -e "${GREEN}✓${NC} openclaw CLI is installed"
    OPENCLAW_VERSION=$(openclaw --version 2>&1 | head -1 || echo "unknown")
    echo "  Version: $OPENCLAW_VERSION"
else
    echo -e "${YELLOW}⚠${NC} openclaw CLI not found in PATH"
    echo "  This is expected if running inside OpenClaw instance"
fi

echo ""
echo "=== Checking Data Ingestion Service ==="

if [ -n "$DATA_INGESTION_BASE_URL" ]; then
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$DATA_INGESTION_BASE_URL/health" 2>/dev/null || echo "000")
    if [ "$HTTP_CODE" = "200" ]; then
        echo -e "${GREEN}✓${NC} Data Ingestion Service is reachable"
    else
        echo -e "${RED}✗${NC} Data Ingestion Service is NOT reachable (HTTP $HTTP_CODE)"
        echo "  URL: $DATA_INGESTION_BASE_URL"
        ERRORS=$((ERRORS + 1))
    fi
else
    echo -e "${YELLOW}⚠${NC} DATA_INGESTION_BASE_URL not set, skipping health check"
fi

echo ""
echo "=== Checking Linear API Access ==="

if [ -n "$LINEAR_API_KEY" ]; then
    # Test linear CLI
    if command -v linear &> /dev/null; then
        LINEAR_TEST=$(linear whoami 2>&1 || echo "failed")
        if [[ "$LINEAR_TEST" != *"failed"* ]] && [[ "$LINEAR_TEST" != *"error"* ]]; then
            echo -e "${GREEN}✓${NC} Linear API key is valid"
            echo "  User: $(echo "$LINEAR_TEST" | head -1)"
        else
            echo -e "${RED}✗${NC} Linear API key test failed"
            echo "  Error: $LINEAR_TEST"
            ERRORS=$((ERRORS + 1))
        fi
    else
        echo -e "${YELLOW}⚠${NC} linear CLI not installed, skipping API test"
    fi
else
    echo -e "${YELLOW}⚠${NC} LINEAR_API_KEY not set, skipping API test"
fi

echo ""
echo "=== Summary ==="

if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}✅ All checks passed!${NC}"
    echo ""
    echo "Your environment is ready for linear-task-manager."
    exit 0
else
    echo -e "${RED}❌ $ERRORS check(s) failed${NC}"
    echo ""
    echo "Please fix the issues above before deploying."
    exit 1
fi
