# 消息能力清单

本文档列出了 SUMM-Hub 支持的所有消息类型及其格式，供生产者参考。

---

## AI 消息

### summ.ai.input

发送 AI 请求消息。

**方向**: Producer → Hub → Consumer

**消息结构**:

- `id` (string, 必填) - 消息唯一标识，UUID v4
- `session` (string, 可选) - 会话标识，首次消息可为空
- `content` (any, 必填) - 业务负载
- `context` (object, 可选) - 上下文信息
- `created_at` (string, 必填) - 创建时间，ISO 8601

**示例**:

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

**NATS Headers**:

- `Session-Id` - 会话标识（可选）
- `Source` - 消息来源（如 `slack`, `web`, `api`）

**响应**:
- 成功: `summ.ai.output`
- 失败: `summ.ai.error`

---

### summ.ai.output

AI 响应消息。

**方向**: Consumer → Hub → Producer

**消息结构**:

- `id` (string, 必填) - 消息唯一标识
- `session` (string, 必填) - 会话标识
- `content` (any, 必填) - 响应内容
- `created_at` (string, 必填) - 创建时间

**示例**:

```json
{
  "id": "660e8400-e29b-41d4-a716-446655440001",
  "session": "sess_V1StGXR8_Z5jdHi6B-myT",
  "content": {
    "text": "这段代码的功能是..."
  },
  "created_at": "2026-03-17T10:00:05Z"
}
```

---

### summ.ai.error

AI 错误消息。

**方向**: Consumer → Hub → Producer

**消息结构**:

- `id` (string, 必填) - 消息唯一标识
- `session` (string, 可选) - 相关会话标识
- `code` (string, 必填) - 错误码
- `message` (string, 必填) - 错误描述
- `created_at` (string, 必填) - 创建时间

**错误码**:

- `session_not_found` - Session 不存在或已失效
- `invalid_request` - 请求参数无效
- `permission_denied` - 权限不足
- `rate_limited` - 请求频率超限
- `internal_error` - 内部错误

**示例**:

```json
{
  "id": "err-550e8400",
  "session": "sess_abc123",
  "code": "session_not_found",
  "message": "会话已失效，请重新开始",
  "created_at": "2026-03-17T10:00:00Z"
}
```

---

## 通知消息

### summ.notify.event

发送通知事件。

**方向**: Producer → Hub → Consumer

**消息结构**:

- `id` (string, 必填) - 消息唯一标识
- `type` (string, 必填) - 事件类型
- `payload` (object, 必填) - 事件数据
- `created_at` (string, 必填) - 创建时间

**示例**:

```json
{
  "id": "770e8400-e29b-41d4-a716-446655440002",
  "type": "user_notification",
  "payload": {
    "user_id": "U12345",
    "message": "您的任务已完成"
  },
  "created_at": "2026-03-17T10:00:00Z"
}
```

---

## 任务消息

### summ.task.error

任务错误消息。

**方向**: Consumer → Hub

**消息结构**:

- `id` (string, 必填) - 消息唯一标识
- `task_id` (string, 必填) - 任务标识
- `code` (string, 必填) - 错误码
- `message` (string, 必填) - 错误描述
- `created_at` (string, 必填) - 创建时间

**示例**:

```json
{
  "id": "err-task-001",
  "task_id": "task_abc123",
  "code": "execution_timeout",
  "message": "任务执行超时",
  "created_at": "2026-03-17T10:00:00Z"
}
```

---

## Subject 通配符订阅

- `summ.ai.>` - 订阅所有 AI 相关消息
- `summ.>` - 订阅全部消息
- `summ.ai.input` - 仅订阅 AI 输入消息

---

## Session 使用说明

### Session 标识格式

```
sess_<随机字符串>
```

- 前缀 `sess_` 便于识别
- 后缀使用 URL-safe 随机字符串，长度 12-21 字符

### 交互流程

```
用户: 帮我分析这段代码        ← 首次消息，无 Session
AI:   好的，这段代码... [返回 session: sess_abc]
用户: 继续解释第二部分        ← 携带 session: sess_abc
AI:   第二部分的功能是...
```

---

*版本: v1.0*
*更新日期: 2026-03-17*
