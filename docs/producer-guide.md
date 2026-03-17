# Producer 实现指南

本指南教你如何实现一个 SUMM-Hub Producer。

---

## 概述

Producer 的职责：

1. 发布消息到指定 Subject
2. 携带必要的 Headers
3. 订阅响应 Subject 获取结果
4. 处理错误消息

---

## 发布消息

### 基本发布

```go
import (
    "github.com/nats-io/nats.go"
)

func publishMessage(nc *nats.Conn, content string) error {
    payload := map[string]interface{}{
        "id":         uuid.New().String(),
        "content":    content,
        "created_at": time.Now().Format(time.RFC3339),
    }

    data, _ := json.Marshal(payload)

    return nc.Publish("summ.ai.input", data)
}
```

### 使用 JetStream

推荐使用 JetStream 确保消息持久化：

```go
func publishMessage(js nats.JetStreamContext, content string) (*nats.PubAck, error) {
    payload := map[string]interface{}{
        "id":         uuid.New().String(),
        "content":    content,
        "created_at": time.Now().Format(time.RFC3339),
    }

    data, _ := json.Marshal(payload)

    // 使用 MsgId 确保幂等
    return js.Publish("summ.ai.input", data, nats.MsgId(payload["id"].(string)))
}
```

---

## 携带 Headers

### 设置 Headers

```go
msg := nats.NewMsg("summ.ai.input")
msg.Data = payloadBytes
msg.Header.Set("Source", "slack")
msg.Header.Set("Session-Id", "sess_abc123")

nc.PublishMsg(msg)
```

### 首次消息（无 Session）

```go
func sendFirstMessage(js nats.JetStreamContext, content string) error {
    payload := map[string]interface{}{
        "id":         uuid.New().String(),
        "content":    content,
        "context": map[string]interface{}{
            "source":  "web",
            "user_id": "U12345",
        },
        "created_at": time.Now().Format(time.RFC3339),
    }

    data, _ := json.Marshal(payload)

    msg := nats.NewMsg("summ.ai.input")
    msg.Data = data
    msg.Header.Set("Source", "web")
    // 注意：首次消息不设置 Session-Id

    _, err := js.PublishMsg(msg)
    return err
}
```

### 后续消息（有 Session）

```go
func sendFollowUpMessage(js nats.JetStreamContext, sessionID, content string) error {
    payload := map[string]interface{}{
        "id":         uuid.New().String(),
        "session":    sessionID,
        "content":    content,
        "created_at": time.Now().Format(time.RFC3339),
    }

    data, _ := json.Marshal(payload)

    msg := nats.NewMsg("summ.ai.input")
    msg.Data = data
    msg.Header.Set("Session-Id", sessionID)
    msg.Header.Set("Source", "web")

    _, err := js.PublishMsg(msg)
    return err
}
```

---

## 处理响应

### 订阅响应 Subject

```go
func subscribeToResponses(nc *nats.Conn, sessionID string) (*nats.Subscription, error) {
    return nc.Subscribe("summ.ai.output", func(msg *nats.Msg) {
        var response struct {
            ID      string      `json:"id"`
            Session string      `json:"session"`
            Content interface{} `json:"content"`
        }

        json.Unmarshal(msg.Data, &response)

        // 检查是否是当前 Session 的响应
        if response.Session == sessionID {
            fmt.Printf("收到响应: %+v\n", response.Content)
        }
    })
}
```

### 使用 Queue Group 订阅

如果多个 Producer 实例，使用 Queue Group 确保每个响应只被一个处理：

```go
nc.QueueSubscribe("summ.ai.output", "producer-group", func(msg *nats.Msg) {
    // 处理响应
})
```

### 请求-响应模式

对于需要同步等待的场景：

```go
func sendAndWait(js nats.JetStreamContext, content string, timeout time.Duration) (*Response, error) {
    // 生成唯一回复 Subject
    replySubject := fmt.Sprintf("summ.ai.reply.%s", uuid.New().String())

    // 订阅回复
    sub, _ := js.Subscribe(replySubject, nil, nats.DeliverAll())
    defer sub.Unsubscribe()

    // 发布消息，设置回复 Subject
    payload := map[string]interface{}{
        "id":         uuid.New().String(),
        "content":    content,
        "created_at": time.Now().Format(time.RFC3339),
    }

    data, _ := json.Marshal(payload)
    msg := nats.NewMsg("summ.ai.input")
    msg.Data = data
    msg.Reply = replySubject

    _, err := js.PublishMsg(msg)
    if err != nil {
        return nil, err
    }

    // 等待响应
    responseMsg, err := sub.NextMsg(timeout)
    if err != nil {
        return nil, err
    }

    var response Response
    json.Unmarshal(responseMsg.Data, &response)
    return &response, nil
}
```

---

## 错误订阅

### 订阅错误 Subject

```go
func subscribeToErrors(nc *nats.Conn) (*nats.Subscription, error) {
    return nc.Subscribe("summ.ai.error", func(msg *nats.Msg) {
        var errMsg struct {
            ID      string `json:"id"`
            Session string `json:"session"`
            Code    string `json:"code"`
            Message string `json:"message"`
        }

        json.Unmarshal(msg.Data, &errMsg)

        fmt.Printf("错误 [%s]: %s (Session: %s)\n",
            errMsg.Code, errMsg.Message, errMsg.Session)

        // 根据错误码处理
        switch errMsg.Code {
        case "session_not_found":
            // 清除本地 Session，重新开始
            clearLocalSession(errMsg.Session)
        case "rate_limited":
            // 降低请求频率
            time.Sleep(time.Second)
        }
    })
}
```

### 错误码处理

| 错误码 | Producer 处理 |
|--------|---------------|
| `session_not_found` | 清除本地 Session，以无 Session 方式重新发送 |
| `invalid_request` | 检查并修正请求参数 |
| `permission_denied` | 检查权限配置 |
| `rate_limited` | 降低请求频率，稍后重试 |
| `internal_error` | 记录日志，稍后重试 |

---

## 完整流程示例

### TypeScript 实现

```typescript
import { connect, StringCodec, headers } from 'nats';

class Producer {
  private nc;
  private js;
  private sc = StringCodec();

  async connect(url: string) {
    this.nc = await connect({ servers: url });
    this.js = this.nc.jetstream();
  }

  async sendMessage(content: string, sessionId?: string) {
    const payload = {
      id: crypto.randomUUID(),
      session: sessionId,
      content,
      created_at: new Date().toISOString(),
    };

    const hdrs = headers();
    hdrs.set('Source', 'web');
    if (sessionId) {
      hdrs.set('Session-Id', sessionId);
    }

    await this.js.publish('summ.ai.input', this.sc.encode(JSON.stringify(payload)), {
      headers: hdrs,
      msgId: payload.id,
    });

    return payload.id;
  }

  async subscribeToResponses(handler: (response: any) => void) {
    const sub = this.nc.subscribe('summ.ai.output');
    (async () => {
      for await (const msg of sub) {
        const response = JSON.parse(this.sc.decode(msg.data));
        handler(response);
      }
    })();
    return sub;
  }

  async subscribeToErrors(handler: (error: any) => void) {
    const sub = this.nc.subscribe('summ.ai.error');
    (async () => {
      for await (const msg of sub) {
        const error = JSON.parse(this.sc.decode(msg.data));
        handler(error);
      }
    })();
    return sub;
  }

  async close() {
    await this.nc.close();
  }
}
```

---

## 配置项说明

### 连接配置

| 参数 | 说明 | 示例 |
|------|------|------|
| `NATS_URL` | NATS 服务器地址 | `nats://localhost:4222` |
| `NATS_USER` | 用户名（可选） | `producer` |
| `NATS_PASS` | 密码（可选） | `password` |

### 发布配置

| 参数 | 说明 | 推荐值 |
|------|------|--------|
| `timeout` | 发布超时 | `5s` |
| `retry_attempts` | 重试次数 | `3` |

---

## 最佳实践

1. **消息幂等**：使用 `MsgId` 确保重复发布不会产生重复消息
2. **异步处理**：使用订阅模式处理响应，避免阻塞
3. **错误处理**：始终订阅错误 Subject，及时处理错误
4. **Session 管理**：本地存储 Session-Id，收到 `session_not_found` 时清除
5. **超时设置**：设置合理的超时，避免无限等待

---

## 完整示例

查看 [../examples/typescript/](../examples/typescript/) 获取完整可运行的 TypeScript Producer 示例。

---

*版本: v1.0*
*更新日期: 2026-03-17*
