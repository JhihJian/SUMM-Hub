# 飞书双向消息传递设计

## 概述

在 SUMM-Hub 中实现飞书（Feishu）双向消息传递，使用户能通过飞书与 AI 进行对话交互。

## 需求

- 使用 WebSocket 模式连接飞书（无需公网 URL）
- 支持群聊和私聊
- 群聊需要 @机器人 触发
- 用户通过前缀指令指定 session_id（如 `#session-xxx`）
- AI 响应以回复原消息的方式发送

## 架构

### 整体流程

```
飞书用户消息
    ↓ WebSocket
feishu-connector (单服务)
    ↓ 解析 + 发布
NATS (summ.ai.input)
    ↓
claude-code-consumer (AI 处理)
    ↓
NATS (summ.ai.output)
    ↓ 订阅
feishu-connector
    ↓ 回复
飞书 (原消息回复)
```

### 组件设计

创建新服务 `feishu-connector`，整合以下职责：

| 组件 | 职责 |
|------|------|
| **WebSocket Client** | 建立飞书 WebSocket 长连接，接收消息事件 |
| **Message Parser** | 解析消息内容，提取 session_id，处理 @触发判断 |
| **NATS Producer** | 将解析后的消息发布到 `summ.ai.input` |
| **NATS Consumer** | 订阅 `summ.ai.output`，接收 AI 响应 |
| **Responder** | 调用飞书 API 回复原消息 |

### 消息格式

**飞书 → NATS (summ.ai.input)**

```json
{
  "id": "uuid-v4",
  "session_id": "从消息提取或使用 chat_id",
  "content": { "text": "清理后的消息内容" },
  "context": {
    "source": "feishu",
    "chat_id": "oc_xxx",
    "message_id": "om_xxx",
    "reply_to": "om_xxx",
    "sender_id": "ou_xxx"
  },
  "timestamp": 1711257600000
}
```

**NATS → 飞书 (summ.ai.output)**

```json
{
  "session_id": "xxx",
  "message_id": "uuid",
  "type": "content",
  "content": "AI 响应内容",
  "context": {
    "reply_to": "om_xxx"
  },
  "timestamp": 1711257610000
}
```

## 详细设计

### 目录结构

```
consumer/feishu-connector/
├── src/
│   ├── index.ts           # 入口，加载配置，启动服务
│   ├── connector.ts       # FeishuConnector 主类
│   ├── websocket.ts       # WebSocket 客户端封装
│   ├── parser.ts          # 消息解析器
│   ├── responder.ts       # 飞书 API 回复
│   └── types.ts           # 类型定义
├── test/
│   ├── parser.test.ts     # 解析器单元测试
│   └── connector.test.ts  # 集成测试
├── package.json
├── tsconfig.json
├── Dockerfile
└── .dockerignore
```

### 核心类

#### FeishuConnector

主协调类，管理 WebSocket 连接和 NATS 订阅。

```typescript
class FeishuConnector {
  private wsClient: Lark.WSClient;
  private nc: NatsConnection;
  private config: FeishuConnectorConfig;

  async start(): Promise<void> {
    await this.connectNats();
    await this.startWebSocket();
    await this.subscribeResponses();
  }

  private async handleMessage(event: FeishuMessageEvent): Promise<void> {
    const parsed = this.parser.parse(event);
    if (!parsed) return; // 不符合条件，跳过

    const input = this.toInputMessage(parsed);
    this.nc.publish('summ.ai.input', JSON.stringify(input));
  }

  private async handleResponse(msg: Msg): Promise<void> {
    const output = JSON.parse(msg.data) as OutputMessage;
    await this.responder.reply(output);
  }
}
```

#### MessageParser

解析飞书消息，提取 session_id 和清理内容。

```typescript
class MessageParser {
  private triggerPrefix: string; // 默认 "#"

  parse(event: FeishuMessageEvent, botOpenId: string): ParsedMessage | null {
    const content = this.extractText(event);
    const isMentioned = this.checkMention(event, botOpenId);

    // 群聊检查 @触发
    if (this.isGroupChat(event) && !isMentioned) {
      return null;
    }

    // 提取 session_id
    const { sessionId, cleanContent } = this.extractSession(content);

    return {
      sessionId: sessionId || event.message.chat_id,
      content: cleanContent,
      chatId: event.message.chat_id,
      messageId: event.message.message_id,
      senderId: event.sender.sender_id.open_id,
      isMentioned,
    };
  }

  // 匹配模式: #session-xxx 或 #session_xxx
  private extractSession(content: string): { sessionId: string | null; cleanContent: string } {
    const pattern = /#session[-_]?(\S+)/i;
    const match = content.match(pattern);
    if (match) {
      return {
        sessionId: match[1],
        cleanContent: content.replace(pattern, '').trim(),
      };
    }
    return { sessionId: null, cleanContent: content };
  }
}
```

#### Responder

调用飞书 API 回复消息。

```typescript
class Responder {
  private client: Lark.Client;

  async reply(output: OutputMessage): Promise<void> {
    const replyTo = output.context?.reply_to;
    if (!replyTo) return;

    await this.client.im.message.reply({
      path: { message_id: replyTo },
      data: {
        content: JSON.stringify({
          zh_cn: { content: [[{ tag: 'md', text: output.content }]] }
        }),
        msg_type: 'post',
      },
    });
  }
}
```

### 配置

```typescript
interface FeishuConnectorConfig {
  // 飞书应用凭证
  appId: string;
  appSecret: string;

  // NATS
  natsUrl: string;

  // 可选配置
  triggerPrefix?: string;     // 默认 "#"
  requireMention?: boolean;   // 默认 true
}
```

**环境变量**

```bash
FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=xxx
NATS_URL=nats://localhost:4222
TRIGGER_PREFIX=#
REQUIRE_MENTION=true
```

### 错误处理

| 场景 | 处理 |
|------|------|
| WebSocket 断开 | 指数退避重连，最大间隔 30s |
| 飞书 API 限流 | 记录日志，丢弃消息（飞书会重试） |
| 消息解析失败 | 记录日志，跳过该消息 |
| NATS 连接失败 | 退出进程，依赖容器/系统重启 |

### 依赖

```json
{
  "dependencies": {
    "@larksuiteoapi/node-sdk": "^1.59.0",
    "nats": "^2.28.0",
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.x",
    "@types/uuid": "^9.0.0",
    "typescript": "^5.x",
    "vitest": "^1.x"
  }
}
```

## NATS Stream 配置

需要启用 `AI_OUTPUT` stream（当前被注释）：

```yaml
# nats/streams/ai.conf
stream: AI_OUTPUT
subjects:
  - summ.ai.output
retention: limits
max_msgs: 100000
max_age: 7d
replicas: 1
storage: file
```

## 测试策略

1. **单元测试**：MessageParser 的各种输入场景
2. **集成测试**：Mock NATS 和飞书 API，验证端到端流程
3. **E2E 测试**：参考现有 feishu-consumer 的 E2E 测试模式

## 部署

```yaml
# docker-compose.yml
feishu-connector:
  build: ./consumer/feishu-connector
  environment:
    - FEISHU_APP_ID=${FEISHU_APP_ID}
    - FEISHU_APP_SECRET=${FEISHU_APP_SECRET}
    - NATS_URL=nats://nats:4222
  depends_on:
    - nats
```

## 参考资料

- clawdbot-feishu: `/data/github/clawdbot-feishu/` - WebSocket 连接、消息处理参考
- 现有 feishu-consumer: `consumer/feishu-consumer/` - 飞书 API 调用参考
- claude-code-consumer: `consumer/claude-code-consumer/` - NATS 消息格式参考
