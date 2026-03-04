#!/bin/bash
# Local CI runner - mirrors GitHub Actions workflow

set -e

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║           SSE Reliability Kit - Local CI                  ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

step() {
    echo -e "${YELLOW}▶ $1${NC}"
}

success() {
    echo -e "${GREEN}✓ $1${NC}"
}

fail() {
    echo -e "${RED}✗ $1${NC}"
    exit 1
}

# Step 1: Install
step "Installing dependencies..."
npm ci || npm install
success "Dependencies installed"

# Step 2: Lint
step "Running lint..."
npm run lint || fail "Lint failed"
success "Lint passed"

# Step 3: Format check
step "Checking format..."
npm run format:check || fail "Format check failed"
success "Format check passed"

# Step 4: Unit tests
step "Running unit tests..."
npm test || fail "Unit tests failed"
success "Unit tests passed"

# Step 5: Harness (optional, can be slow)
if [ "$1" == "--full" ]; then
    step "Running harness scenarios..."
    npm run harness run-all -- --fail-fast || fail "Harness scenarios failed"
    success "Harness scenarios passed"
fi

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║                    ✅ LOCAL CI PASSED                     ║"
echo "╚═══════════════════════════════════════════════════════════╝"

if [ "$1" != "--full" ]; then
    echo ""
    echo "Note: Run with --full to include harness scenarios"
fi
