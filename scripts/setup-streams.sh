#!/bin/bash
# setup-streams.sh - 初始化 NATS Stream 和 Consumer
# 用法: ./scripts/setup-streams.sh [nats-url]
#
# 幂等执行：多次运行不会重复创建

set -e

NATS_URL="${1:-nats://localhost:4222}"
NATS_CMD="nats --server=$NATS_URL"

echo "=== SUMM-Hub Stream 初始化 ==="
echo "NATS URL: $NATS_URL"
echo ""

# 等待 NATS 就绪 (通过 HTTP 健康检查)
echo "等待 NATS 服务启动..."
for i in {1..30}; do
    if curl -s http://localhost:8222/varz > /dev/null 2>&1; then
        echo "NATS 服务已就绪"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "错误: NATS 服务未在 30 秒内启动"
        exit 1
    fi
    sleep 1
done

# ============================================================
# AI_INPUT Stream
# ============================================================
echo ""
echo "--- 创建 AI_INPUT Stream ---"
if $NATS_CMD stream info AI_INPUT &>/dev/null; then
    echo "AI_INPUT Stream 已存在，跳过创建"
else
    $NATS_CMD stream add AI_INPUT \
        --subjects "summ.ai.input" \
        --retention limits \
        --max-msgs 100000 \
        --max-age 7d \
        --replicas 1 \
        --storage file \
        --defaults
    echo "AI_INPUT Stream 创建成功"
fi

# AI_INPUT Consumer
if $NATS_CMD consumer info AI_INPUT ai-consumer &>/dev/null; then
    echo "ai-consumer Consumer 已存在，跳过创建"
else
    $NATS_CMD consumer add AI_INPUT ai-consumer \
        --filter "summ.ai.input" \
        --ack explicit \
        --max-deliver 3 \
        --wait 30s \
        --deliver all \
        --replay instant \
        --pull \
        --defaults
    echo "ai-consumer Consumer 创建成功"
fi

# ============================================================
# AI_OUTPUT Stream
# ============================================================
echo ""
echo "--- 创建 AI_OUTPUT Stream ---"
if $NATS_CMD stream info AI_OUTPUT &>/dev/null; then
    echo "AI_OUTPUT Stream 已存在，跳过创建"
else
    $NATS_CMD stream add AI_OUTPUT \
        --subjects "summ.ai.output" \
        --retention limits \
        --max-msgs 100000 \
        --max-age 7d \
        --replicas 1 \
        --storage file \
        --defaults
    echo "AI_OUTPUT Stream 创建成功"
fi

# ============================================================
# AI_ERROR Stream
# ============================================================
echo ""
echo "--- 创建 AI_ERROR Stream ---"
if $NATS_CMD stream info AI_ERROR &>/dev/null; then
    echo "AI_ERROR Stream 已存在，跳过创建"
else
    $NATS_CMD stream add AI_ERROR \
        --subjects "summ.ai.error" \
        --retention limits \
        --max-msgs 10000 \
        --max-age 30d \
        --replicas 1 \
        --storage file \
        --defaults
    echo "AI_ERROR Stream 创建成功"
fi

# ============================================================
# NOTIFY_EVENT Stream
# ============================================================
echo ""
echo "--- 创建 NOTIFY_EVENT Stream ---"
if $NATS_CMD stream info NOTIFY_EVENT &>/dev/null; then
    echo "NOTIFY_EVENT Stream 已存在，跳过创建"
else
    $NATS_CMD stream add NOTIFY_EVENT \
        --subjects "summ.notify.event" \
        --retention limits \
        --max-msgs 50000 \
        --max-age 3d \
        --replicas 1 \
        --storage file \
        --defaults
    echo "NOTIFY_EVENT Stream 创建成功"
fi

# NOTIFY_EVENT Consumer
if $NATS_CMD consumer info NOTIFY_EVENT notify-consumer &>/dev/null; then
    echo "notify-consumer Consumer 已存在，跳过创建"
else
    $NATS_CMD consumer add NOTIFY_EVENT notify-consumer \
        --filter "summ.notify.event" \
        --ack explicit \
        --max-deliver 5 \
        --wait 60s \
        --deliver all \
        --replay instant \
        --pull \
        --defaults
    echo "notify-consumer Consumer 创建成功"
fi

echo ""
echo "=== Stream 初始化完成 ==="
echo ""
echo "已创建的 Stream:"
$NATS_CMD stream list
