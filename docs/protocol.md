# 协议规范

SUMM-Hub 的完整协议规范。

---

## Subject 格式

### 结构定义

```
summ.<domain>.<action>
```

| 层级 | 说明 | 取值示例 |
|------|------|----------|
| `summ` | 固定前缀 | - |
| `domain` | 业务领域 | `ai` `notify` `task` `log` |
| `action` | 消息动作 | `input` `output` `event` `error` `ack` |

### 预定义 Subject

| Subject | 用途 | 方向 |
|---------|------|------|
| `summ.ai.input` | AI 输入消息 | Producer → Hub → Consumer |
| `summ.ai.output` | AI 输出消息 | Consumer → Hub → Producer |
| `summ.ai.error` | AI 错误消息 | Consumer → Hub → Producer |
| `summ.notify.event` | 通知事件 | Producer → Hub → Consumer |
| `summ.task.error` | 任务错误 | Consumer → Hub |

### 通配符订阅

| 订阅表达式 | 订阅范围 |
|------------|----------|
| `summ.ai.>` | 所有 AI 相关消息 |
| `summ.>` | 全部消息 |
| `summ.ai.input` | 仅 AI 输入消息 |

---

## 消息格式

### Payload 结构

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | ✅ | 消息唯一标识，UUID v4 |
| `session` | string | ❌ | 会话标识（首次消息可为空） |
| `content` | any | ✅ | 业务负载 |
| `context` | object | ❌ | 上下文信息（来源、用户等） |
| `created_at` | string | ✅ | 创建时间，ISO 8601 |

### 示例

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "session": "sess_V1StGXR8_Z5jdHi6B-myT",
  "content": {
    "text": "帮我分析这段代码",
    "attachments": []
  },
  "context": {
    "source": "slack",
    "user_id": "U12345",
    "channel": "C67890"
  },
  "created_at": "2026-03-17T10:00:00Z"
}
```

### NATS Headers

Session 信息通过 Header 传递，便于路由和过滤：

| Header | 说明 | 示例值 |
|--------|------|--------|
| `Session-Id` | 会话标识 | `sess_abc123` |
| `Source` | 消息来源 | `slack` `web` `api` |

### 设计意图

- **Payload** 包含业务数据和元信息
- **Header** 包含路由信息
- 两者分离便于 NATS 层面的过滤和监控

---

## Session 约定

### Session 标识格式

```
sess_<随机字符串>
```

- 前缀 `sess_` 便于识别和过滤
- 后缀使用 URL-safe 随机字符串，长度 12-21 字符
- 示例：`sess_V1StGXR8_Z5jdHi6B-myT`

### 交互流程

```
用户: 帮我分析这段代码        ← 首次消息，无 Session
AI:   好的，这段代码... [返回 session: sess_abc]
用户: 继续解释第二部分        ← 携带 session: sess_abc
AI:   第二部分的功能是...
用户: 帮我优化一下            ← 携带 session: sess_abc
AI:   建议修改为...
```

### Hub 的承诺

| 承诺 | 说明 |
|------|------|
| 无 Session 消息 | 投递给任意 Consumer |
| 有 Session 消息 | 路由到同一 Consumer（哈希保证） |
| 不存储 Session | Hub 不感知 Session 生命周期 |

---

## 路由规则

### 消息路由策略

Consumer 使用 **Queue Group** 订阅，NATS 只会投递给组内**一个** Consumer，收到消息后根据 Session-Id 哈希判断归属：

```
消息到达 → Queue Group 订阅 → 投递给一个 Consumer
                                    ↓
                            检查 Session 归属
                                    ↓
              ┌─────────────────────┼─────────────────────┐
              ↓                     ↓                     ↓
        无 Session             属于自己              不属于自己
              ↓                     ↓                     ↓
        处理消息                 处理消息               NAK
        生成 Session             ACK                  (重新投递)
```

### 路由规则表

| 消息类型 | 路由方式 | 说明 |
|----------|----------|------|
| 无 Session | 第一个收到的 Consumer 处理 | Consumer 可生成 Session 返回 |
| 有 Session | 哈希路由到指定 Consumer | 保证同一 Session 的消息到同一 Consumer |

### Session 归属判断

```go
func (c *Consumer) ownsSession(sessionID string) bool {
    h := fnv.New32a()
    h.Write([]byte(sessionID))
    target := int(h.Sum32()) % c.total
    return target == c.id
}
```

### 静态配置

`id` 和 `total` 通过环境变量在启动时固定：

```bash
CONSUMER_ID=0      # 本 Consumer 的 ID（0, 1, 2, ...）
CONSUMER_TOTAL=3   # Consumer 总数
```

---

## 错误处理

### 错误分类

| 错误类型 | 示例 | 处理策略 |
|----------|------|----------|
| 临时错误 | 网络超时、下游服务暂不可用 | 重试（指数退避） |
| 业务错误 | 参数无效、权限不足、Session 失效 | ACK + 发布错误消息到 `summ.ai.error` |
| 系统错误 | 代码 bug、数据损坏 | ACK + 告警 |

### 重试策略

| 参数 | 值 | 说明 |
|------|-----|------|
| 最大重试次数 | 3 | 超过后进入死信队列 |
| 重试间隔 | 指数退避 | 1s → 2s → 4s |
| 单次重试超时 | 30 秒 | NAK 后重新投递的等待时间 |

### 错误消息发布

业务错误和 Session 失效时，Consumer 发布错误消息到 `summ.ai.error`：

```json
{
  "id": "err-550e8400",
  "session": "sess_abc123",
  "code": "session_not_found",
  "message": "会话已失效，请重新开始",
  "created_at": "2026-03-17T10:00:00Z"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `code` | string | 错误码，如 `session_not_found`、`invalid_request` |
| `message` | string | 人类可读的错误描述 |
| `session` | string | 相关 Session ID（如有） |

### 错误码定义

| 错误码 | 说明 |
|--------|------|
| `session_not_found` | Session 不存在或已失效 |
| `invalid_request` | 请求参数无效 |
| `permission_denied` | 权限不足 |
| `rate_limited` | 请求频率超限 |
| `internal_error` | 内部错误 |

---

## 消息流转

```
┌──────────┐    ┌───────────┐    ┌──────────┐
│ Producer │    │   NATS    │    │ Consumer │
└────┬─────┘    └─────┬─────┘    └────┬─────┘
     │                │               │
     │ 1. publish     │               │
     │    + Headers   │               │
     │───────────────>│               │
     │                │               │
     │                │ 2. deliver    │
     │                │──────────────>│
     │                │               │
     │                │               │ 3. 检查 Session 归属
     │                │               │    - 属于自己 → 处理
     │                │               │    - 不属于 → NAK
     │                │               │
     │                │ 4. ack/nak    │
     │                │<──────────────│
     │                │               │
     │                │ 5. publish    │
     │                │    response   │
     │                │──────────────>│  (下游Consumer)
     │                │               │
     │ 6. response    │               │
     │    (含 Session)│               │
     │<───────────────│               │
     │                │               │
```

| 步骤 | 动作 | 说明 |
|------|------|------|
| 1 | 发布消息 | Producer 发布消息到 Subject |
| 2 | 投递消息 | NATS 投递给 Consumer |
| 3 | 检查归属 | Consumer 检查 Session-Id 是否属于自己的哈希范围 |
| 4 | 确认/拒绝 | 属于自己 → ACK；不属于 → NAK |
| 5 | 发布响应 | Consumer 将结果发布为新消息 |
| 6 | 返回响应 | 响应中包含 Session-Id（如果是首次消息） |

---

## Consumer 约定

### 订阅配置

Consumer 使用 NATS **Queue Group** 订阅，确保同一消息只投递给组内一个 Consumer：

```go
sub, _ := js.QueueSubscribe(
    "summ.ai.input",      // subject
    "ai-consumer-group",  // queue group name
    handleMessage,
    nats.Durable("ai-consumer"),
    nats.ManualAck(),
)
```

### Queue Group Name 规则

| 概念 | 说明 |
|------|------|
| 命名规则 | `<domain>-consumer-group`，如 `ai-consumer-group` |
| 业务分组 | 同一业务能力的 Consumer 使用相同的 queue group name |
| 负载均衡 | NATS 自动在组内 Consumer 间分发消息 |
| 故障转移 | 一个 Consumer 下线后，消息自动投递给组内其他 Consumer |

### Session 处理约定

| 场景 | Consumer 行为 |
|------|---------------|
| 首次消息（无 Session） | 处理消息，生成 Session-Id 并返回 |
| 后续消息（有 Session） | 检查归属，仅处理属于自己的 Session |
| Session 存储 | 自行管理（本地内存、持久化等） |
| Session 清理 | 自行决定生命周期和清理策略 |

---

## 客户端约定

| 场景 | 客户端行为 |
|------|-----------|
| 首次消息 | 发送无 Session-Id 的消息，等待响应获取 Session-Id |
| 后续消息 | 携带 Session-Id 发送 |
| 未收到 Session-Id 时连续发送 | **视为启动多个独立 Session**，每条消息将被不同 Consumer 处理 |
| 收到 `session_not_found` | 清除本地 Session，以无 Session 方式重新发送 |

---

*版本: v1.0*
*更新日期: 2026-03-17*
