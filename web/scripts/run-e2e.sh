#!/bin/bash
# E2E Test Runner for Web Consumer/Producer
#
# This script:
# 1. Starts a local NATS server on port 6422 (if not running)
# 2. Starts the E2E stack (backend + frontend + mock-consumer)
# 3. Runs the E2E tests
# 4. Cleans up on exit
#
# Usage: ./scripts/run-e2e.sh [--no-cleanup]
#
# Prerequisites:
#   - Docker
#   - Node.js 20+
#   - nats CLI (for mock consumer)

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WEB_DIR="$(dirname "$SCRIPT_DIR")"
NO_CLEANUP=false

# Parse args
for arg in "$@"; do
  case $arg in
    --no-cleanup)
      NO_CLEANUP=true
      shift
      ;;
  esac
done

NATS_CONTAINER="nats-e2e-$$"
NATS_PORT=6422

echo "=== Web Consumer/Producer E2E Test ==="
echo ""

# Check dependencies
echo "[1/5] Checking dependencies..."
command -v docker >/dev/null 2>&1 || { echo "Error: docker required"; exit 1; }
command -v node >/dev/null 2>&1 || { echo "Error: node required"; exit 1; }

# Cleanup function
cleanup() {
  if [ "$NO_CLEANUP" = true ]; then
    echo "[Cleanup] Skipping cleanup (--no-cleanup)"
    return
  fi

  echo ""
  echo "[Cleanup] Stopping E2E stack..."
  cd "$WEB_DIR" && docker compose -f docker-compose.e2e.yml down 2>/dev/null || true

  echo "[Cleanup] Removing NATS container..."
  docker rm -f $NATS_CONTAINER 2>/dev/null || true
}
trap cleanup EXIT

# 1. Start NATS on port 6422
echo "[2/5] Starting NATS on port $NATS_PORT..."
if docker ps --format '{{.Names}}' | grep -q "^${NATS_CONTAINER}$"; then
  echo "  NATS container already running"
else
  docker run -d --name "$NATS_CONTAINER" \
    -p ${NATS_PORT}:4222 \
    -p 8222:8222 \
    nats:2.10-alpine \
    --http_port=8222 \
    --jetstream \
    --store_dir=/data \
    >/dev/null
  sleep 2
  echo "  NATS started"
fi

# Verify NATS is running
echo "  Verifying NATS connection..."
if ! docker exec $NATS_CONTAINER nats server check 2>/dev/null; then
  echo "  Warning: NATS health check failed, but continuing..."
fi

# 2. Install test dependencies
echo "[3/5] Installing test dependencies..."
cd "$WEB_DIR/test-e2e"
npm install --silent

# 3. Start E2E stack
echo "[4/5] Starting E2E stack (backend + mock-consumer)..."
cd "$WEB_DIR"

# Build and start services in background
docker compose -f docker-compose.e2e.yml up --build -d backend mock-consumer 2>&1 | grep -v "^$" || true

# Wait for backend to be ready
echo "  Waiting for backend to be ready..."
for i in {1..30}; do
  if curl -s http://localhost:3000/health >/dev/null 2>&1; then
    echo "  Backend is ready"
    break
  fi
  if [ $i -eq 30 ]; then
    echo "  Error: Backend did not start in time"
    docker compose -f docker-compose.e2e.yml logs backend
    exit 1
  fi
  sleep 1
done

# Wait for mock consumer to be ready
echo "  Waiting for mock consumer to be ready..."
sleep 3

# Show status
echo ""
echo "=== Services Status ==="
docker compose -f docker-compose.e2e.yml ps
echo ""

# 4. Run tests
echo "[5/5] Running E2E tests..."
cd "$WEB_DIR/test-e2e"
API_URL=http://localhost:3000 npm test

echo ""
echo "=== All E2E tests passed ==="
