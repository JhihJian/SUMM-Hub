# Consumer 实现指南

本指南教你如何实现一个 SUMM-Hub Consumer。

---

## 概述

Consumer 的职责：

1. 订阅 Subject 接收消息
2. 检查 Session 归属
3. 处理消息（业务逻辑）
4. 发送 ACK/NAK 确认
5. 发布响应或错误

---

## 订阅模式

### Queue Group 订阅

使用 Queue Group 确保同一消息只投递给组内一个 Consumer：

```go
sub, err := js.QueueSubscribe(
    "summ.ai.input",      // subject
    "ai-consumer-group",  // queue group name
    handleMessage,
    nats.Durable("ai-consumer"),
    nats.ManualAck(),
    nats.AckWait(30*time.Second),
    nats.MaxDeliver(3),
)
```

### Queue Group Name 规则

| 命名规则 | 示例 |
|----------|------|
| `<domain>-consumer-group` | `ai-consumer-group`、`notify-consumer-group` |

**业务含义**：

- 同一业务能力的 Consumer 使用相同的 queue group name
- NATS 自动在组内 Consumer 间分发消息（负载均衡）
- 一个 Consumer 下线后，消息自动投递给其他 Consumer（故障转移）

---

## Session 归属判断

### 哈希算法

使用 FNV-1a 哈希判断 Session 归属：

```go
import (
    "hash/fnv"
    "os"
    "strconv"
)

type Consumer struct {
    id    int  // 本 Consumer 的 ID（0, 1, 2, ...）
    total int  // Consumer 总数
}

func NewConsumer() *Consumer {
    id, _ := strconv.Atoi(os.Getenv("CONSUMER_ID"))
    total, _ := strconv.Atoi(os.Getenv("CONSUMER_TOTAL"))
    return &Consumer{id: id, total: total}
}

func (c *Consumer) ownsSession(sessionID string) bool {
    h := fnv.New32a()
    h.Write([]byte(sessionID))
    target := int(h.Sum32()) % c.total
    return target == c.id
}
```

### 配置方式

通过环境变量配置：

```bash
export CONSUMER_ID=0      # 本 Consumer 的 ID
export CONSUMER_TOTAL=3   # Consumer 总数
```

---

## 消息处理流程

### 完整处理逻辑

```go
func (c *Consumer) handleMessage(msg *nats.Msg) {
    sessionID := msg.Header.Get("Session-Id")

    // 1. 无 Session → Queue Group 确保只有一个 Consumer 收到
    if sessionID == "" {
        c.processFirstMessage(msg)
        msg.Ack()
        return
    }

    // 2. 有 Session → 检查是否属于自己
    if !c.ownsSession(sessionID) {
        // 不属于本 Consumer，NAK 让其他 Consumer 处理
        msg.Nak(nats.AckWait(100 * time.Millisecond))
        return
    }

    // 3. 属于本 Consumer → 检查 Session 数据是否存在
    if !c.hasSessionData(sessionID) {
        // Session 不存在（Consumer 重启或 Session 迁移）
        c.publishError(msg, "session_not_found", "会话已失效，请重新开始")
        msg.Ack()
        return
    }

    // 4. 处理消息
    c.processMessage(msg)
    msg.Ack()
}
```

### 首次消息处理

```go
func (c *Consumer) processFirstMessage(msg *nats.Msg) {
    // 解析消息
    var payload Message
    json.Unmarshal(msg.Data, &payload)

    // 生成 Session ID
    sessionID := generateSessionID()

    // 存储到本地（内存、持久化等）
    c.sessions[sessionID] = &Session{
        ID:        sessionID,
        Context:   payload.Context,
        CreatedAt: time.Now(),
    }

    // 处理业务逻辑
    result := c.handleBusinessLogic(payload)

    // 发布响应
    response := map[string]interface{}{
        "id":         uuid.New().String(),
        "session":    sessionID,
        "content":    result,
        "created_at": time.Now().Format(time.RFC3339),
    }

    c.js.Publish("summ.ai.output", response, nats.MsgId(response["id"].(string)))
}

func generateSessionID() string {
    // 生成 sess_xxx 格式的 ID
    b := make([]byte, 16)
    rand.Read(b)
    return "sess_" + base64.RawURLEncoding.EncodeToString(b)[:21]
}
```

### 后续消息处理

```go
func (c *Consumer) processMessage(msg *nats.Msg) {
    sessionID := msg.Header.Get("Session-Id")

    // 获取 Session 数据
    session := c.sessions[sessionID]

    // 解析消息
    var payload Message
    json.Unmarshal(msg.Data, &payload)

    // 处理业务逻辑（可访问 Session 上下文）
    result := c.handleBusinessLogicWithContext(payload, session)

    // 发布响应
    response := map[string]interface{}{
        "id":         uuid.New().String(),
        "session":    sessionID,
        "content":    result,
        "created_at": time.Now().Format(time.RFC3339),
    }

    c.js.Publish("summ.ai.output", response, nats.MsgId(response["id"].(string)))
}
```

---

## ACK/NAK 处理

### ACK（确认）

消息处理成功后发送 ACK：

```go
msg.Ack()
```

ACK 后消息不会再次投递。

### NAK（拒绝）

Session 不属于自己时发送 NAK：

```go
// 添加 100ms 延迟，给其他 Consumer 机会
msg.Nak(nats.AckWait(100 * time.Millisecond))
```

**为什么添加延迟**：

- NAK 后消息立即重新投递
- 添加小延迟减少争抢
- 对于 AI 对话场景，100-400ms 额外延迟可接受

### 最坏情况

N 个 Consumer → 平均 N-1 次 NAK

对于 3 个 Consumer，最坏情况 2 次 NAK（约 200-400ms 额外延迟）。

---

## 重试逻辑

### 临时错误处理

```go
func (c *Consumer) handleMessage(msg *nats.Msg) {
    err := c.processWithRetry(msg)
    if err != nil {
        // 判断错误类型
        if isTemporaryError(err) {
            // 临时错误 → NAK 触发 NATS 重试
            msg.Nak()
            return
        }

        // 业务错误 → ACK + 发布错误消息
        c.publishError(msg, "internal_error", err.Error())
        msg.Ack()
        return
    }

    msg.Ack()
}

func isTemporaryError(err error) bool {
    // 判断是否为临时错误（网络超时、下游服务不可用等）
    var netErr net.Error
    if errors.As(err, &netErr) {
        return netErr.Timeout() || netErr.Temporary()
    }
    return false
}
```

### NATS 重试配置

创建 Consumer 时配置重试：

```bash
nats consumer add AI_INPUT ai-consumer \
    --filter-subject "summ.ai.input" \
    --ack explicit \
    --max-deliver 3 \          # 最多投递 3 次
    --ack-wait 30s \           # 等待 ACK 的超时时间
    --deliver all
```

超过 `max-deliver` 次数后，消息进入死信队列（需额外配置）。

---

## 错误发布

### 发布错误消息

```go
func (c *Consumer) publishError(msg *nats.Msg, code, message string) {
    sessionID := msg.Header.Get("Session-Id")

    errorPayload := map[string]interface{}{
        "id":         uuid.New().String(),
        "session":    sessionID,
        "code":       code,
        "message":    message,
        "created_at": time.Now().Format(time.RFC3339),
    }

    c.js.Publish("summ.ai.error", errorPayload)
}
```

### 常见错误码

| 错误码 | 说明 | 处理方式 |
|--------|------|----------|
| `session_not_found` | Session 不存在或已失效 | 客户端重新开始对话 |
| `invalid_request` | 请求参数无效 | 客户端修正参数后重试 |
| `permission_denied` | 权限不足 | 客户端检查权限 |
| `rate_limited` | 请求频率超限 | 客户端降低频率 |
| `internal_error` | 内部错误 | Consumer 告警 |

---

## 配置项说明

### 环境变量

| 变量 | 说明 | 示例 |
|------|------|------|
| `NATS_URL` | NATS 服务器地址 | `nats://localhost:4222` |
| `CONSUMER_ID` | 本 Consumer 的 ID | `0`、`1`、`2` |
| `CONSUMER_TOTAL` | Consumer 总数 | `3` |
| `QUEUE_GROUP` | Queue Group 名称 | `ai-consumer-group` |

### NATS Consumer 配置

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `ack_policy` | `explicit` | 显式确认 |
| `max_deliver` | `3` | 最大投递次数 |
| `ack_wait` | `30s` | ACK 等待超时 |
| `deliver_policy` | `all` | 从开始投递 |

---

## 完整示例

查看 [../examples/go/](../examples/go/) 获取完整可运行的 Go Consumer 示例。

---

## 最佳实践

1. **幂等处理**：消息可能重复投递，确保处理逻辑幂等
2. **快速 ACK**：处理完成后尽快 ACK，避免超时
3. **合理 NAK**：只在 Session 不属于自己时 NAK
4. **错误发布**：业务错误发布到 `summ.ai.error`，不要无限重试
5. **Session 清理**：定期清理过期 Session，避免内存泄漏

---

## summctl 集成要求

summctl 支持两种方式管理 Consumer：

### 方式一：自动发现（推荐）

Consumer 通过 Docker Labels 自声明，summctl 自动发现运行中的 Consumer。

**docker-compose.yml 配置：**

```yaml
services:
  consumer:
    image: your-consumer:latest
    labels:
      # 必需：声明这是 SUMM Consumer
      summ.dev/role: "consumer"
      # 可选：Consumer 名称（默认用容器名）
      summ.dev/name: "your-consumer-name"
      # 必需：订阅的 subjects（逗号分隔）
      summ.dev/subscribe: "summ.ai.input"
      # 必需：发布的 subjects（逗号分隔）
      summ.dev/publish: "summ.ai.output,summ.ai.error"
    environment:
      NATS_URL: nats://host.docker.internal:6422
    restart: unless-stopped
```

**docker run 方式：**

```bash
docker run -d \
  --label summ.dev/role=consumer \
  --label summ.dev/name=my-consumer \
  --label summ.dev/subscribe="summ.ai.input" \
  --label summ.dev/publish="summ.ai.output,summ.ai.error" \
  -e NATS_URL=nats://host.docker.internal:6422 \
  your-consumer:latest
```

**Labels 说明：**

| Label | 必需 | 说明 |
|-------|------|------|
| `summ.dev/role` | ✅ | 必须为 `consumer`，用于标识 |
| `summ.dev/name` | ❌ | Consumer 名称，默认用容器名 |
| `summ.dev/subscribe` | ✅ | 订阅的 subjects，逗号分隔 |
| `summ.dev/publish` | ✅ | 发布的 subjects，逗号分隔，无则为空 |

**验证：**

```bash
# 发现运行中的 Consumer
summctl discover

# 输出示例
NAME                STATUS   CONTAINER    SUBJECTS IN        SUBJECTS OUT
feishu-connector    running  a1b2c3d4e5f  summ.ai.input      summ.ai.output
claude-code         running  f6e7d8c9b0a  summ.ai.input      summ.ai.output,summ.ai.error
```

### 方式二：配置文件（传统）

通过 `consumers.yaml` 静态配置，适合需要管理 compose 文件路径的场景。

**consumers.yaml 配置：**

```yaml
consumers:
  your-consumer-name:
    description: "Consumer 功能描述"
    path: ./consumer/your-consumer-name
    subjects:
      subscribe: [summ.ai.input]
      publish: [summ.ai.output]
    env:
      NATS_URL: ${NATS_URL:-nats://host.docker.internal:6422}
```

**验证：**

```bash
summctl status
```

---

## 详细配置说明

### 1. 目录结构要求

```
consumer/
└── your-consumer-name/        # Consumer 目录名即为 consumer 名称
    ├── docker-compose.yml     # 必须存在
    ├── Dockerfile             # 构建镜像用
    └── src/                   # 源代码
```

### 2. docker-compose.yml 要求

```yaml
services:
  consumer:
    image: your-consumer:latest
    environment:
      NATS_URL: ${NATS_URL:-nats://host.docker.internal:6422}
    restart: unless-stopped
```

**必须项：**
- 服务名必须是 `consumer`（单服务）或有明确的主服务名
- 必须支持 `NATS_URL` 环境变量
- 必须配置 `restart` 策略

### 4. Subject 命名规范

```
summ.<domain>.<action>
```

| 域 | 示例 Subject | 说明 |
|----|-------------|------|
| `ai` | `summ.ai.input` | AI 处理输入 |
| `ai` | `summ.ai.output` | AI 处理输出 |
| `ai` | `summ.ai.error` | AI 处理错误 |
| `notify` | `summ.notify.event` | 通知事件 |
| `notify` | `summ.notify.info` | 通知信息 |

### 5. 环境变量约定

| 变量 | 必需 | 说明 |
|------|------|------|
| `NATS_URL` | ✅ | NATS 服务器地址 |
| `CONSUMER_ID` | ❌ | 多实例部署时使用 |
| `CONSUMER_TOTAL` | ❌ | 多实例部署时使用 |
| 业务相关 | 按需 | API Key、Token 等 |

**敏感信息处理：**
- 使用 `${SECRET_VAR:-}` 格式，默认为空
- 启动前必须设置环境变量
- 不要在配置文件中硬编码

### 6. 新建 Consumer 检查清单

- [ ] 目录结构符合要求
- [ ] docker-compose.yml 存在且配置正确
- [ ] 在 `consumers.yaml` 中注册
- [ ] `subjects.subscribe` 和 `subjects.publish` 声明完整
- [ ] `summctl status` 能正确显示状态
- [ ] `summctl start/stop` 能正常工作
- [ ] `summctl topology` 能正确显示拓扑

### 7. 验证命令

```bash
# 查看是否注册成功
summctl status | grep your-consumer-name

# 查看详情
summctl info your-consumer-name

# 测试启动
summctl start your-consumer-name
summctl logs your-consumer-name

# 查看拓扑
summctl topology
```

---

*版本: v1.2*
*更新日期: 2026-03-31*
