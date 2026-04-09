#!/bin/bash
# Feishu-Connector Verification Script
# Usage: ./verify.sh [level]
#   level 1: Unit tests only
#   level 2: + Docker build
#   level 3: + E2E tests
#   level 4: + Integration tests (requires NATS)

set -e

# Change to script directory
cd "$(dirname "$0")"

LEVEL=${1:-1}
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "${GREEN}✓${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; }
info() { echo -e "${YELLOW}→${NC} $1"; }

echo "=========================================="
echo " Feishu-Connector Verification (Level $LEVEL)"
echo "=========================================="
echo ""

# Level 1: Unit Tests
info "Level 1: Running unit tests..."
if npm test 2>&1 | grep -q "passed"; then
  pass "Unit tests passed"
else
  fail "Unit tests failed"
  exit 1
fi

if [ "$LEVEL" -lt 2 ]; then
  echo ""
  pass "Verification complete (Level 1)"
  exit 0
fi

# Level 2: Docker Build
info "Level 2: Building Docker image..."
if docker build -t feishu-connector:verify . 2>&1 | grep -q "exporting"; then
  pass "Docker build successful"
else
  fail "Docker build failed"
  exit 1
fi

if [ "$LEVEL" -lt 3 ]; then
  echo ""
  pass "Verification complete (Level 2)"
  exit 0
fi

# Level 3: E2E Tests
info "Level 3: Running E2E tests..."
info "Starting Docker Compose stack..."

# Cleanup function
cleanup() {
  echo ""
  info "Cleaning up..."
  docker compose -f docker-compose.e2e.yml down -v 2>/dev/null || true
}
trap cleanup EXIT

if docker compose -f docker-compose.e2e.yml up --abort-on-container-exit 2>&1 | grep -q "E2E tests PASSED"; then
  pass "E2E tests passed"
else
  fail "E2E tests failed"
  docker compose -f docker-compose.e2e.yml logs 2>&1 | tail -50
  exit 1
fi

if [ "$LEVEL" -lt 4 ]; then
  echo ""
  pass "Verification complete (Level 3)"
  exit 0
fi

# Level 4: Integration Tests (requires NATS)
info "Level 4: Running integration tests..."
info "Checking if NATS is available..."

if ! docker compose ps nats 2>/dev/null | grep -q "running"; then
  info "Starting NATS..."
  docker compose up -d nats
  sleep 5
fi

info "Running integration test script..."
if npx ts-node test/send-test-message.ts 2>&1 | grep -q "Messages received"; then
  pass "Integration tests passed"
else
  fail "Integration tests failed"
  exit 1
fi

echo ""
pass "Verification complete (Level 4 - All tests passed!)"
