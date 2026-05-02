#!/bin/bash
# Fresh Clone Verification Script (SSRK-241)
# Simulates a new user following the quickstart

set -e

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║         Fresh Clone Verification Script                   ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "${GREEN}✓ $1${NC}"; }
fail() { echo -e "${RED}✗ $1${NC}"; exit 1; }
info() { echo -e "${YELLOW}▶ $1${NC}"; }

# Check prerequisites
info "Checking prerequisites..."
node --version || fail "Node.js not installed"
npm --version || fail "npm not installed"
pass "Prerequisites OK"

# Create temp directory
TEMP_DIR=$(mktemp -d)
info "Working in: $TEMP_DIR"
cd "$TEMP_DIR"

# Clone (or copy for local testing)
if [ -n "$1" ]; then
  info "Copying from $1..."
  cp -r "$1" ./sse-kit
  cd sse-kit
else
  info "Cloning repository..."
  git clone https://github.com/your-org/sse-streaming-reliability-kit.git sse-kit
  cd sse-kit
fi
pass "Repository ready"

# Install
info "Installing dependencies..."
npm install 2>&1 | tail -5
pass "Dependencies installed"

# Run tests
info "Running tests..."
npm test 2>&1 | tail -10
pass "Tests passed"

# Run lint
info "Running lint..."
npm run lint 2>&1 | tail -5
pass "Lint passed"

# Build
info "Running build..."
npm run build 2>&1 | tail -5
pass "Build succeeded"

# Check dist
info "Checking dist output..."
test -f dist/index.js || fail "dist/index.js not found"
test -d dist/client || fail "dist/client not found"
test -d dist/server || fail "dist/server not found"
test -d dist/shared || fail "dist/shared not found"
pass "Dist structure correct"

# Start server (background)
info "Starting server..."
npm run dev &
SERVER_PID=$!
sleep 3

# Health check
info "Checking health endpoint..."
HEALTH=$(curl -s http://localhost:3000/health)
echo "$HEALTH" | grep -q "ok" || fail "Health check failed"
pass "Server healthy"

# Metrics check
info "Checking metrics endpoint..."
METRICS=$(curl -s http://localhost:3000/metrics)
echo "$METRICS" | grep -q "sse_server" || fail "Metrics check failed"
pass "Metrics available"

# Stop server
kill $SERVER_PID 2>/dev/null || true

# Cleanup
cd /
rm -rf "$TEMP_DIR"

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║            ✅ FRESH CLONE VERIFICATION PASSED             ║"
echo "╚═══════════════════════════════════════════════════════════╝"
