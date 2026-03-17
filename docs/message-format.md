# 消息格式

本页内容已整合到 [协议规范](./protocol.md#消息格式)。

---

## 快速参考

### Payload 结构

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | ✅ | 消息唯一标识，UUID v4 |
| `session` | string | ❌ | 会话标识（首次消息可为空） |
| `content` | any | ✅ | 业务负载 |
| `context` | object | ❌ | 上下文信息（来源、用户等） |
| `created_at` | string | ✅ | 创建时间，ISO 8601 |

### NATS Headers

| Header | 说明 | 示例值 |
|--------|------|--------|
| `Session-Id` | 会话标识 | `sess_abc123` |
| `Source` | 消息来源 | `slack` `web` `api` |

---

详见 [协议规范](./protocol.md#消息格式)。
