# SUMM-Hub

基于 NATS JetStream 的消息中心，解耦消息来源与处理者。

---

## 定位

### 是什么

SUMM-Hub 是一个**消息集散中心**：

- 接收任意来源消息
- 按 Subject 分发给订阅者
- 保证同一 Session 的消息路由到同一 Consumer

### 不是什么

- 不处理消息内容
- 不承载业务逻辑
- 不关心消息语义
- 不管理 Session 状态

---

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│                       SUMM-Hub                               │
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
         ↑                                        ↓
    ┌─────────┐                             ┌──────────┐
    │ Producer │                            │ Consumer │
    │ (消息来源) │                            │ (消息处理) │
    └─────────┘                             └──────────┘
```

| 组件 | 职责 |
|------|------|
| NATS JetStream | 消息的收发、持久化、消费者进度追踪、重试机制 |
| Consumer | 订阅消息、处理业务逻辑、**自行管理 Session 状态** |

**设计原则**：Hub 只负责消息传递，Session 管理由 Consumer 自行负责。

---

## 快速链接

| 文档 | 说明 |
|------|------|
| [快速开始](./getting-started.md) | 5 分钟上手指南 |
| [协议规范](./protocol.md) | Subject 格式、消息格式、路由规则 |
| [Subject 设计](./subject-design.md) | Subject 命名规范 |
| [消息格式](./message-format.md) | Payload 和 Headers 定义 |
| [Consumer 指南](./consumer-guide.md) | 如何实现 Consumer |
| [Producer 指南](./producer-guide.md) | 如何实现 Producer |
| [错误处理](./error-handling.md) | 重试策略和错误消息 |

---

## 示例代码

| 语言 | 类型 | 路径 |
|------|------|------|
| Go | Consumer | [../examples/go/](../examples/go/) |
| TypeScript | Producer | [../examples/typescript/](../examples/typescript/) |

---

## 核心概念

### Subject

消息路由的基础，格式为 `summ.<domain>.<action>`：

```
summ.ai.input    # AI 输入消息
summ.ai.output   # AI 输出消息
summ.ai.error    # AI 错误消息
```

### Session

通过 Header 传递的会话标识，用于将相关消息路由到同一 Consumer：

- 首次消息：无 Session-Id
- 后续消息：携带 `Session-Id: sess_xxx`

### Queue Group

多个 Consumer 组成消费组，NATS 确保同一消息只投递给组内一个 Consumer。

---

## 技术选型

### 为什么选择 NATS JetStream

| 需求 | NATS JetStream | Kafka | RabbitMQ |
|------|----------------|-------|----------|
| 消息持久化 | ✅ | ✅ | ✅ |
| 消费者独立进度 | ✅ | ✅ | ⚠️ 有限 |
| Subject 通配符路由 | ✅ 原生支持 | ⚠️ 需额外设计 | ⚠️ 需 Exchange |
| 运维复杂度 | 低（单二进制） | 高（ZooKeeper） | 中 |

**选择理由**：

1. 原生 Subject 通配符，无需预定义路由规则
2. 消费者独立 ACK，同一消息可被多个消费者处理
3. 轻量运维，无外部依赖
4. At-least-once 语义，消息不丢失

---

*版本: v1.0*
*更新日期: 2026-03-17*
