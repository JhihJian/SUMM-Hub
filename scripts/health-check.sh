#!/bin/bash
# health-check.sh - 检查 NATS 和 Stream 状态
# 用法: ./scripts/health-check.sh [nats-url]

set -e

NATS_URL="${1:-nats://localhost:4222}"
NATS_CMD="nats --server=$NATS_URL"

echo "=== SUMM-Hub 健康检查 ==="
echo "NATS URL: $NATS_URL"
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

check_pass() {
    echo -e "${GREEN}✓${NC} $1"
}

check_fail() {
    echo -e "${RED}✗${NC} $1"
}

check_warn() {
    echo -e "${YELLOW}!${NC} $1"
}

# ============================================================
# 检查 NATS 服务
# ============================================================
echo "--- NATS 服务 ---"
if $NATS_CMD server info &>/dev/null; then
    check_pass "NATS 服务运行中"

    # 显示版本信息
    VERSION=$($NATS_CMD server info 2>/dev/null | grep -oP 'Version: \K[^\s]+' || echo "unknown")
    echo "  版本: $VERSION"
else
    check_fail "NATS 服务未运行"
    exit 1
fi

# 检查 HTTP 监控端点
echo ""
echo "--- HTTP 监控 ---"
if curl -s -o /dev/null -w "%{http_code}" "http://localhost:8222/varz" | grep -q "200"; then
    check_pass "HTTP 监控端点可用 (http://localhost:8222)"
else
    check_warn "HTTP 监控端点不可用"
fi

# ============================================================
# 检查 Stream 状态
# ============================================================
echo ""
echo "--- Stream 状态 ---"

check_stream() {
    local stream=$1
    if $NATS_CMD stream info "$stream" &>/dev/null; then
        # 获取消息数量
        MSGS=$($NATS_CMD stream info "$stream" 2>/dev/null | grep -oP 'Messages: \K[0-9]+' || echo "?")
        check_pass "$stream (消息数: $MSGS)"
        return 0
    else
        check_fail "$stream (未创建)"
        return 1
    fi
}

STREAMS_OK=true

check_stream "AI_INPUT" || STREAMS_OK=false
check_stream "AI_OUTPUT" || STREAMS_OK=false
check_stream "AI_ERROR" || STREAMS_OK=false
check_stream "NOTIFY_EVENT" || STREAMS_OK=false

# ============================================================
# 检查 Consumer 状态
# ============================================================
echo ""
echo "--- Consumer 状态 ---"

check_consumer() {
    local stream=$1
    local consumer=$2
    if $NATS_CMD consumer info "$stream" "$consumer" &>/dev/null; then
        # 获取待处理消息数
        PENDING=$($NATS_CMD consumer info "$stream" "$consumer" 2>/dev/null | grep -oP 'Pending: \K[0-9]+' || echo "?")
        check_pass "$stream / $consumer (待处理: $PENDING)"
        return 0
    else
        check_warn "$stream / $consumer (未创建)"
        return 1
    fi
}

CONSUMERS_OK=true

check_consumer "AI_INPUT" "ai-consumer" || CONSUMERS_OK=false
check_consumer "NOTIFY_EVENT" "notify-consumer" || CONSUMERS_OK=false

# ============================================================
# JetStream 状态
# ============================================================
echo ""
echo "--- JetStream 状态 ---"
if $NATS_CMD server info &>/dev/null | grep -q "JetStream"; then
    check_pass "JetStream 已启用"

    # 显示存储信息
    JS_INFO=$($NATS_CMD stream list 2>/dev/null | tail -1 || echo "")
    if [ -n "$JS_INFO" ]; then
        echo "  $JS_INFO"
    fi
else
    check_fail "JetStream 未启用"
fi

# ============================================================
# 总结
# ============================================================
echo ""
echo "=== 检查结果 ==="

if [ "$STREAMS_OK" = true ] && [ "$CONSUMERS_OK" = true ]; then
    echo -e "${GREEN}所有检查通过${NC}"
    exit 0
else
    echo -e "${YELLOW}部分检查未通过，请运行 setup-streams.sh 初始化${NC}"
    exit 1
fi
