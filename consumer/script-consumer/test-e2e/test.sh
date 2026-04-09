#!/bin/bash
set -e

# script-consumer e2e 测试
# 依赖: docker, nats CLI

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONSUMER_DIR="$(dirname "$SCRIPT_DIR")"
OUTPUT_FILE="/tmp/script-consumer-test-$$"
NATS_CONTAINER="nats-e2e-test-$$"

echo "=== script-consumer e2e 测试 ==="

# 检查依赖
command -v docker >/dev/null 2>&1 || { echo "Error: docker required"; exit 1; }
command -v nats >/dev/null 2>&1 || { echo "Error: nats CLI required (go install github.com/nats-io/natscli/nats@latest)"; exit 1; }

# 清理函数
cleanup() {
    echo "[Cleanup] Stopping consumer..."
    kill $CONSUMER_PID 2>/dev/null || true
    echo "[Cleanup] Removing NATS container..."
    docker rm -f $NATS_CONTAINER 2>/dev/null || true
    rm -f "$OUTPUT_FILE"
}
trap cleanup EXIT

# 1. 启动 NATS
echo "[1/5] Starting NATS container..."
docker run -d --name "$NATS_CONTAINER" -p 4222:4222 nats:latest >/dev/null
sleep 2

# 2. 构建 consumer
echo "[2/5] Building script-consumer..."
cd "$CONSUMER_DIR"
npm run build >/dev/null 2>&1

# 3. 启动 consumer
echo "[3/5] Starting script-consumer..."
NATS_URL=nats://localhost:4222 \
SUBJECT="summ.test.input" \
COMMAND="cat > $OUTPUT_FILE" \
npm start &
CONSUMER_PID=$!
sleep 2

# 4. 发送测试消息
echo "[4/5] Sending test message..."
TEST_MESSAGE='{"test":"hello","timestamp":1234567890}'
nats pub summ.test.input "$TEST_MESSAGE" -s nats://localhost:4222

# 5. 验证结果
echo "[5/5] Verifying result..."
sleep 1

if [ ! -f "$OUTPUT_FILE" ]; then
    echo "FAIL: Output file not created"
    exit 1
fi

RECEIVED=$(cat "$OUTPUT_FILE")
if [ "$RECEIVED" = "$TEST_MESSAGE" ]; then
    echo "PASS: Message received correctly"
    echo "  Sent:     $TEST_MESSAGE"
    echo "  Received: $RECEIVED"
else
    echo "FAIL: Message mismatch"
    echo "  Expected: $TEST_MESSAGE"
    echo "  Got:      $RECEIVED"
    exit 1
fi

echo ""
echo "=== All tests passed ==="
