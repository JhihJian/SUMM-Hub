# Message Hub 概览

> 详细设计见 [ai-message-processing-layer.md](./ai-message-processing-layer.md)

---

## 一句话

**NATS 管消息，Consumer 管 Session，哈希路由保顺序。**

---

## 架构

```
NATS JetStream（消息）

- 无 Redis 依赖
- Consumer 自行管理 Session 状态
```

---

## Subject

```
summ.<domain>.<action>
```

例：`summ.ai.input` / `summ.ai.output`

---

## 消息

| Payload | Headers |
|---------|---------|
| id, session(可选), content, context | Session-Id, Source |

---

## Consumer 约定

| 场景 | Consumer 行为 |
|------|---------------|
| 无 Session | 处理消息，生成并返回 Session-Id |
| 有 Session | 检查归属，仅处理属于自己的 |
| Session 管理 | 自行存储、更新、清理 |
| 订阅方式 | Queue Group（同组名 = 同业务能力） |
| 配置方式 | 静态配置 `CONSUMER_ID` + `CONSUMER_TOTAL` |

## 客户端约定

| 场景 | 客户端行为 |
|------|-----------|
| 首次消息 | 发送无 Session-Id 的消息，等待响应获取 Session-Id |
| 未收到 Session-Id 时连续发送 | 视为启动多个独立 Session |

**Hub 承诺**：同一 Session 的消息路由到同一 Consumer

---

## 消息路由

| 消息类型 | 路由方式 |
|----------|----------|
| 无 Session | 第一个收到的 Consumer 处理 |
| 有 Session | 哈希路由（NAK 优化） |

---

## 错误

| 类型 | 处理 |
|------|------|
| 临时 | 重试 3 次 |
| 业务 | ACK + 发布到 `summ.ai.error` |
| 系统 | 告警（死信队列待定） |

---

## 关键决策

| 选择 | 原因 |
|------|------|
| NATS | Subject 通配符，运维轻量 |
| 无 Redis | 极简架构，Consumer 自管 Session |
| 哈希分发 | 客户端无需感知 Consumer，解耦 |
| NAK 优化 | 延迟重试，给其他 Consumer 机会 |

---

## 已知权衡（可接受）

| 问题 | 接受原因 |
|------|----------|
| NAK 路由效率（N-1 次 NAK） | AI 对话对 200-400ms 延迟不敏感，Consumer ≤ 3 |
| 静态配置需重启扩缩 | 初期数量稳定，无自动伸缩需求 |
| 一致性哈希配置同步 | 滚动部署 + 配置校验，重启窗口可控 |
| Session 丢失需重新开始 | 目标场景可接受状态丢失 |

**详见**：[ai-message-processing-layer.md#已知权衡](./ai-message-processing-layer.md#已知权衡)
