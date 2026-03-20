#!/bin/bash
# install-dependencies.sh
# Installs required dependencies for linear-task-manager (OpenClaw-Native)

set -e

echo "📦 Installing Linear Task Manager Dependencies..."
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check if running with sudo (for system packages)
if [ "$EUID" -eq 0 ]; then 
    SUDO=""
else
    SUDO="sudo"
fi

echo "=== System Package Dependencies ==="

# Detect OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
else
    OS=$(uname -s)
fi

echo "Detected OS: $OS"
echo ""

# Install system packages based on OS
case $OS in
    ubuntu|debian)
        echo "Installing via apt-get..."
        $SUDO apt-get update
        $SUDO apt-get install -y curl jq python3
        echo -e "${GREEN}✓${NC} System packages installed"
        ;;
    
    centos|rhel|fedora)
        echo "Installing via yum..."
        $SUDO yum install -y curl jq python3
        echo -e "${GREEN}✓${NC} System packages installed"
        ;;
    
    darwin|Darwin)
        echo "Installing via brew (macOS)..."
        if ! command -v brew &> /dev/null; then
            echo -e "${RED}✗${NC} Homebrew not found. Install from https://brew.sh"
            exit 1
        fi
        brew install curl jq python3
        echo -e "${GREEN}✓${NC} System packages installed"
        ;;
    
    *)
        echo -e "${YELLOW}⚠${NC} Unknown OS: $OS"
        echo "Please install manually: curl, jq, python3"
        ;;
esac

echo ""
echo "=== Node.js & npm ==="

if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}⚠${NC} Node.js not found"
    echo "Please install Node.js from https://nodejs.org"
    echo "Or use a version manager like nvm: https://github.com/nvm-sh/nvm"
    exit 1
else
    NODE_VERSION=$(node --version)
    echo -e "${GREEN}✓${NC} Node.js is installed (version: $NODE_VERSION)"
fi

if ! command -v npm &> /dev/null; then
    echo -e "${RED}✗${NC} npm not found (should come with Node.js)"
    exit 1
else
    NPM_VERSION=$(npm --version)
    echo -e "${GREEN}✓${NC} npm is installed (version: $NPM_VERSION)"
fi

echo ""
echo "=== Installing linear-cli ==="

if command -v linear &> /dev/null; then
    LINEAR_VERSION=$(linear --version 2>&1 | head -1)
    echo -e "${YELLOW}⚠${NC} linear-cli is already installed (version: $LINEAR_VERSION)"
    read -p "Reinstall? (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Skipping linear-cli installation"
    else
        npm install -g linear-cli
        echo -e "${GREEN}✓${NC} linear-cli reinstalled"
    fi
else
    npm install -g linear-cli
    echo -e "${GREEN}✓${NC} linear-cli installed"
fi

# Verify installation
if command -v linear &> /dev/null; then
    LINEAR_VERSION=$(linear --version 2>&1 | head -1)
    echo ""
    echo -e "${GREEN}✅ linear-cli is ready${NC}"
    echo "   Version: $LINEAR_VERSION"
else
    echo -e "${RED}❌ linear-cli installation failed${NC}"
    exit 1
fi

echo ""
echo "=== Installation Complete ==="
echo ""
echo "Next steps:"
echo "1. Set environment variables in OpenClaw's .env file"
echo "2. Run: ./check-environment.sh"
echo "3. Copy files to OpenClaw instance"
echo "4. Restart OpenClaw: openclaw gateway restart"
echo ""
echo "See README.md for full deployment guide."
