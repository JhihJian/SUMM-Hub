# Message Hub

基于 NATS JetStream 的消息中心，解耦消息来源与处理者。

---

## 定位

### 是什么

消息集散中心：接收任意来源消息，按 Subject 分发给订阅者，保证同一 Session 的消息路由到同一 Consumer。

### 不是什么

不处理消息内容，不承载业务逻辑，不关心消息语义，不管理 Session 状态。

---

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│                       Message Hub                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│                      NATS JetStream                          │
│                                                              │
│   • 消息传递                                                  │
│   • 消息持久化                                                │
│   • 消费者进度追踪                                            │
│   • 重试 & 死信队列                                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

| 组件 | 职责 |
|------|------|
| NATS JetStream | 消息的收发、持久化、消费者进度追踪、重试机制 |
| Consumer | 订阅消息、处理业务逻辑、**自行管理 Session 状态** |

**设计原则**：Hub 只负责消息传递，Session 管理由 Consumer 自行负责。

---

## Subject 设计

### 设计原则

**简洁优先**：Subject 只表达「领域 + 动作」，Session 通过 Header 传递，避免 Subject 膨胀。

### 结构定义

```
summ.<domain>.<action>
```

| 层级 | 说明 | 取值示例 |
|------|------|----------|
| domain | 业务领域 | `ai` `notify` `task` `log` |
| action | 消息动作 | `input` `output` `event` `error` `ack` |

### Subject 示例

| Subject | 用途 |
|---------|------|
| `summ.ai.input` | AI 输入消息 |
| `summ.ai.output` | AI 输出消息 |
| `summ.ai.error` | AI 错误消息（业务错误、Session 失效等） |
| `summ.notify.event` | 通知事件 |
| `summ.task.error` | 任务错误 |

### 订阅模式

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
| id | string | ✅ | 消息唯一标识，UUID v4 |
| session | string | ❌ | 会话标识（首次消息可为空） |
| content | any | ✅ | 业务负载 |
| context | object | ❌ | 上下文信息（来源、用户等） |
| created_at | string | ✅ | 创建时间，ISO 8601 |

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

**Queue Group Name 的业务含义**：

| 概念 | 说明 |
|------|------|
| 命名规则 | `<domain>-consumer-group`，如 `ai-consumer-group`、`notify-consumer-group` |
| 业务分组 | 同一业务能力的 Consumer 使用相同的 queue group name |
| 负载均衡 | NATS 自动在组内 Consumer 间分发消息 |
| 故障转移 | 一个 Consumer 下线后，消息自动投递给组内其他 Consumer |

**示例**：

| Queue Group | 包含的 Consumer | 业务能力 |
|-------------|-----------------|----------|
| `ai-consumer-group` | ai-0, ai-1, ai-2 | AI 对话处理 |
| `notify-consumer-group` | notify-0, notify-1 | 通知发送 |

### Session 处理约定

Consumer 需要遵守以下约定：

| 场景 | Consumer 行为 |
|------|---------------|
| 首次消息（无 Session） | 处理消息，生成 Session-Id 并返回 |
| 后续消息（有 Session） | 检查归属，仅处理属于自己的 Session |
| Session 存储 | 自行管理（本地内存、持久化等） |
| Session 清理 | 自行决定生命周期和清理策略 |

### 客户端约定

| 场景 | 客户端行为 |
|------|-----------|
| 首次消息 | 发送无 Session-Id 的消息，等待响应获取 Session-Id |
| 后续消息 | 携带 Session-Id 发送 |
| 未收到 Session-Id 时连续发送 | **视为启动多个独立 Session**，每条消息将被不同 Consumer 处理，返回不同 Session-Id |

### Session 标识格式

```
sess_<随机字符串>
```

- 前缀 `sess_` 便于识别和过滤
- 后缀使用 URL-safe 随机字符串，长度 12-21 字符
- 示例：`sess_V1StGXR8_Z5jdHi6B-myT`

### 典型交互流程

```
用户: 帮我分析这段代码        ← 首次消息，无 Session
AI:   好的，这段代码... [返回 session: sess_abc]
用户: 继续解释第二部分        ← 携带 session: sess_abc
AI:   第二部分的功能是...
用户: 帮我优化一下            ← 携带 session: sess_abc
AI:   建议修改为...
```

### Hub 的承诺

Hub 保证以下行为：

| 承诺 | 说明 |
|------|------|
| 无 Session 消息 | 投递给任意 Consumer |
| 有 Session 消息 | 路由到同一 Consumer（哈希保证） |
| 不存储 Session | Hub 不感知 Session 生命周期 |

---

## 消息路由

### 路由策略

Consumer 使用 **Queue Group** 订阅，NATS 只会投递给组内**一个** Consumer，收到消息后根据 Session-Id 哈希判断归属：

```
┌─────────────────────────────────────────────────────────────┐
│                        NATS                                  │
│                   summ.ai.input                              │
│                                                              │
│   Queue Group 订阅：消息只投递给组内一个 Consumer            │
└─────────────────────────┬───────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
    ┌──────────┐    ┌──────────┐    ┌──────────┐
    │Consumer 0│    │Consumer 1│    │Consumer 2│
    │          │    │          │    │          │
    │ owns:    │    │ owns:    │    │ owns:    │
    │ hash%3=0 │    │ hash%3=1 │    │ hash%3=2 │
    │          │    │          │    │          │
    │ 不属于自己│    │ 不属于自己│    │ 不属于自己│
    │ → NAK    │    │ → NAK    │    │ → NAK    │
    └──────────┘    └──────────┘    └──────────┘
```

### Consumer 路由逻辑

```go
type Consumer struct {
    id      int  // 本 Consumer 的 ID（0, 1, 2, ...）
    total   int  // Consumer 总数
}

func (c *Consumer) handleMessage(msg *nats.Msg) {
    sessionID := msg.Header.Get("Session-Id")

    // 无 Session → Queue Group 确保只有一个 Consumer 收到
    if sessionID == "" {
        c.process(msg)  // 处理并生成 Session
        msg.Ack()
        return
    }

    // 有 Session → 检查是否属于自己
    if !c.ownsSession(sessionID) {
        // 不属于本 Consumer，NAK 让其他 Consumer 处理
        msg.Nak(nats.AckWait(100 * time.Millisecond))
        return
    }

    // 属于本 Consumer → 处理
    c.process(msg)
    msg.Ack()
}

func (c *Consumer) ownsSession(sessionID string) bool {
    h := fnv.New32a()
    h.Write([]byte(sessionID))
    target := int(h.Sum32()) % c.total
    return target == c.id
}
```

### 静态配置

`id` 和 `total` 通过环境变量或配置文件在启动时固定：

```bash
# 环境变量示例
CONSUMER_ID=0
CONSUMER_TOTAL=3
```

```go
func NewConsumer() *Consumer {
    id, _ := strconv.Atoi(os.Getenv("CONSUMER_ID"))
    total, _ := strconv.Atoi(os.Getenv("CONSUMER_TOTAL"))
    return &Consumer{id: id, total: total}
}
```

**适用场景**：Consumer 数量稳定，扩缩容时重启所有实例并更新配置。

### 路由规则

| 消息类型 | 路由方式 | 说明 |
|----------|----------|------|
| 无 Session | 第一个收到的 Consumer 处理 | Consumer 可生成 Session 返回 |
| 有 Session | 哈希路由到指定 Consumer | 保证同一 Session 的消息到同一 Consumer |

### NAK 优化

**问题**：消息可能被 NAK 多次才到达正确的 Consumer。

**最坏情况**：N 个 Consumer → 平均 N-1 次 NAK

**优化策略**：

```go
// NAK 时添加延迟，给其他 Consumer 机会
msg.Nak(nats.AckWait(100 * time.Millisecond))
```

**延迟开销**：对于 AI 对话场景，100-400ms 的额外延迟可接受。

### 动态扩缩容

Consumer 数量变化时，使用**一致性哈希**减少 Session 迁移：

```go
import "github.com/stathat/consistent"

var hashRing *consistent.Consistent

func init() {
    hashRing = consistent.New()
    hashRing.Add("consumer-0")
    hashRing.Add("consumer-1")
    hashRing.Add("consumer-2")
}

func (c *Consumer) ownsSession(sessionID string) bool {
    node, _ := hashRing.Get(sessionID)
    return node == c.myID
}
```

### 扩缩容时的 Session 处理

扩缩容会导致部分 Session 的哈希映射变化，Consumer 收到不属于自己的 Session 时需要处理：

```go
func (c *Consumer) handleMessage(msg *nats.Msg) {
    sessionID := msg.Header.Get("Session-Id")

    if sessionID == "" {
        c.process(msg)
        msg.Ack()
        return
    }

    // 映射变化：Session 不属于本 Consumer
    if !c.ownsSession(sessionID) {
        msg.Nak(nats.AckWait(100 * time.Millisecond))
        return
    }

    // 映射正确但无数据（Consumer 重启或 Session 迁移）
    if !c.hasSessionData(sessionID) {
        c.publishError(msg, "session_not_found", "会话已失效，请重新开始")
        msg.Ack()
        return
    }

    c.process(msg)
    msg.Ack()
}
```

**客户端约定**：收到 `session_not_found` 时清除本地 Session，以无 Session 方式重新发送。

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

### 死信队列（DLQ）

当消息重试次数超过阈值后，进入死信队列。DLQ 的具体处理方式待定（见"待定事项"）。

### 错误消息发布

业务错误和 Session 失效时，Consumer 发布错误消息到 `summ.ai.error`：

| 字段 | 类型 | 说明 |
|------|------|------|
| code | string | 错误码，如 `session_not_found`、`invalid_request` |
| message | string | 人类可读的错误描述 |
| session | string | 相关 Session ID（如有） |

### 处理流程

```
┌─────────────────────────────────────────────────────────────┐
│                      错误处理流程                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   消息到达                                                   │
│       │                                                      │
│       ▼                                                      │
│   检查 Session 归属                                          │
│       │                                                      │
│       ├─── 不属于自己 ──→ NAK ──→ 重新投递                   │
│       │                                                      │
│       └─── 属于自己 ──→ 尝试处理                             │
│                           │                                  │
│                           ├─── 成功 ──→ ACK ──→ 结束         │
│                           │                                  │
│                           └─── 失败 ──→ 判断错误类型          │
│                                           │                  │
│                                           ├─── 临时错误      │
│                                           │      │           │
│                                           │      ├─── 重试 < 3次 ──→ NAK
│                                           │      │                │
│                                           │      │                └──→重新投递
│                                           │      │           │
│                                           │      └─── 重试 ≥ 3次 ─┐
│                                           │                     │
│                                           ├─── 业务错误 ──→ ACK + 发布到 error Subject
│                                           │                     │
│                                           └─── 系统错误 ──→ ACK + 告警 ←┘
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 典型场景

### 场景 1：AI 对话

```
用户提问 → summ.ai.input → AI Consumer 处理 → summ.ai.output → 回复用户
```

消息链路：

1. 用户发送消息到 `summ.ai.input`（首次无 Session）
2. AI Consumer 收到消息，处理并生成 Session
3. 发布响应到 `summ.ai.output`，携带 `session: sess_xxx`
4. 用户后续消息携带 `session: sess_xxx`
5. Hub 保证路由到同一 Consumer

### 场景 2：多消费者分发

同一消息可被多个消费者订阅，分别执行不同职责：

```
                    ┌─────────────────┐
                    │ summ.ai.input   │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
        ┌──────────┐  ┌──────────┐  ┌──────────┐
        │ AI 处理  │  │ 通知告警 │  │ 日志记录 │
        │ Consumer │  │ Consumer │  │ Consumer │
        └──────────┘  └──────────┘  └──────────┘
```

每个 Consumer 独立 ACK，互不影响。

### 场景 3：链式处理

消息经多个消费者依次处理，每一步产出新消息：

```
summ.ai.input
      │
      ▼
┌──────────────┐
│ 预处理       │ → summ.ai.preprocessed
└──────────────┘         │
                         ▼
                  ┌──────────────┐
                  │ AI 处理      │ → summ.ai.output
                  └──────────────┘         │
                                           ▼
                                    ┌──────────────┐
                                    │ 后处理       │ → summ.ai.done
                                    └──────────────┘
```

每一步通过发布新消息触发下一步，Session-Id 全程传递。

---

## 已知权衡

以下问题在设计时已评估，当前场景下可接受：

### NAK 路由效率

| 问题 | 接受原因 |
|------|----------|
| 最坏情况 N-1 次 NAK，每次 100ms 延迟 | AI 对话场景对 200-400ms 额外延迟不敏感；Consumer 数量固定（≤ 3），延迟可控 |

### 静态配置

| 问题 | 接受原因 |
|------|----------|
| 扩缩容需重启所有实例并更新配置 | 初期 Consumer 数量稳定，无自动伸缩需求；运维成本可接受 |
| 配置错误可能导致路由混乱 | 通过部署脚本和配置校验规避 |

### 一致性哈希配置同步

| 问题 | 接受原因 |
|------|----------|
| 扩缩容时所有 Consumer 必须同时更新哈希环配置 | 采用滚动部署 + 配置校验；Consumer 数量少，重启窗口可控 |

### Consumer 故障导致 Session 丢失

| 问题 | 接受原因 |
|------|----------|
| Consumer 重启后 Session 丢失，用户需重新开始 | 目标场景为短对话或可接受状态丢失；无需引入外部存储 |

**适用场景判断**：如果未来需要更高可靠性或动态扩缩容，应重新评估上述权衡。

---

## 技术选型

### 为什么选择 NATS JetStream

| 需求 | NATS JetStream | Kafka | RabbitMQ | Redis Streams |
|------|----------------|-------|----------|---------------|
| 消息持久化 | ✅ | ✅ | ✅ | ✅ |
| 消费者独立进度 | ✅ | ✅ | ⚠️ 有限 | ✅ |
| Subject 通配符路由 | ✅ 原生支持 | ⚠️ 需额外设计 | ⚠️ 需 Exchange | ❌ 无原生支持 |
| 运维复杂度 | 低（单二进制） | 高（ZooKeeper） | 中 | 中 |

**选择理由**：

1. 原生 Subject 通配符，无需预定义路由规则
2. 消费者独立 ACK，同一消息可被多个消费者处理
3. 轻量运维，无外部依赖
4. At-least-once 语义，消息不丢失

### 为什么不用 Redis 存储 Session

| 考量 | 决策 |
|------|------|
| 架构复杂度 | 引入 Redis 增加依赖和运维成本 |
| 职责边界 | Hub 只负责消息传递，Session 由 Consumer 管理 |
| 场景适配 | 对于短对话、可接受状态丢失的场景，无需 Redis |

**适用本设计的场景**：

- 对话历史可接受丢失（Consumer 重启后重新开始）
- 单 Consumer 实例或 Session 粘性路由
- 追求极简架构，减少依赖

---

## 待定事项

| 事项 | 状态 | 说明 |
|------|------|------|
| 认证/授权 | 待定 | Consumer 如何认证？Subject 级别权限控制？ |
| 监控指标 | 待定 | 消息积压、Consumer 健康状态如何监控？ |
| 多机房部署 | 待定 | 是否需要跨机房消息同步？ |
| 死信队列处理 | 待定 | DLQ 消息如何处理？人工介入还是自动重试？ |

---

*文档版本: v5.4*
*更新日期: 2026-03-17*

### 变更记录

| 版本 | 日期 | 变更 |
|------|------|------|
| v5.4 | 2026-03-17 | 评审修订：移除 Trace-Id 和消息去重；增加客户端约定（多 Session）；明确 Queue Group 语义；增加 `summ.ai.error` Subject；一致性哈希同步纳入已知权衡；死信队列移至待定 |
| v5.3 | 2026-03-17 | 新增：已知权衡章节，明确 NAK 路由效率、静态配置、Session 丢失为可接受的权衡 |
| v5.2 | 2026-03-17 | 新增：Queue Group 订阅配置及业务含义；明确静态配置方式；补充扩缩容时的 Session 处理逻辑 |
| v5.1 | 2026-03-17 | 修正章节命名：Session 约定 → Consumer 约定 |
| v5.0 | 2026-03-17 | 移除 Redis 依赖；简化 Session 设计为约定；新增消息路由章节（哈希分发 + NAK 优化）；Consumer 自行管理 Session |
| v4.0 | 2026-03-17 | 重构 Subject 设计，Session 通过 Header 传递；新增 Session 设计章节；新增 Redis 状态存储；移除代码，纯设计描述 |
| v3.2 | 2026-03-17 | 初始版本 |
