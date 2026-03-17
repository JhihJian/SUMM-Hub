# 飞书 Consumer 设计文档

创建一个 SUMM-Hub Consumer，订阅 NATS 消息并转发到飞书私聊。

---

## 概述

| 项目 | 说明 |
|-----|------|
| 名称 | `feishu-consumer` |
| 位置 | `consumer/feishu-consumer/` |
| 订阅 Subject | `summ.notify.event` |
| 技术栈 | TypeScript + NATS.js |
| 消息方向 | 单向（NATS → 飞书） |

---

## 架构

```dot
digraph feishu_consumer {
    rankdir=LR;
    node [shape=box];

    NATS [label="NATS\nsumm.notify.event"];
    Consumer [label="feishu-consumer"];
    Feishu [label="飞书开放平台 API"];
    User [label="固定用户"];

    NATS -> Consumer [label="订阅"];
    Consumer -> Feishu [label="发送消息"];
    Feishu -> User [label="私聊"];
}
```

---

## 项目结构

```
consumer/feishu-consumer/
├── src/
│   ├── index.ts          # 入口，加载配置，启动
│   ├── consumer.ts       # NATS 订阅和消息处理
│   ├── feishu.ts         # 飞书 API 封装
│   └── types.ts          # 类型定义
├── test/
│   ├── consumer.test.ts  # Consumer 单元测试
│   └── feishu.test.ts    # 飞书 API 测试
├── package.json
├── tsconfig.json
└── README.md
```

---

## 配置项

### 环境变量

| 变量名 | 必填 | 说明 | 示例 |
|-------|------|------|------|
| `NATS_URL` | 否 | NATS 服务器地址 | `nats://localhost:4222` |
| `FEISHU_APP_ID` | 是 | 飞书应用 App ID | `cli_xxx` |
| `FEISHU_APP_SECRET` | 是 | 飞书应用 App Secret | `xxx` |
| `FEISHU_RECEIVER_ID` | 是 | 接收者 ID | `ou_xxx` |
| `FEISHU_RECEIVER_TYPE` | 否 | 接收者类型 | `open_id`（默认） |

### 接收者类型

| 类型 | 说明 |
|-----|------|
| `open_id` | 用户 open_id（推荐） |
| `user_id` | 用户 user_id |
| `union_id` | 用户 union_id |
| `email` | 用户邮箱 |
| `chat_id` | 群聊 ID |

---

## 消息格式

### NATS 输入消息

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "content": "消息内容或卡片对象",
  "context": {
    "source": "system"
  },
  "created_at": "2026-03-17T10:00:00Z"
}
```

### 消息类型判断

| content 类型 | 飞书消息类型 | 说明 |
|-------------|-------------|------|
| `string` | `text` | 纯文本消息 |
| `{ card: {...} }` | `interactive` | 卡片消息 |
| 其他 | `text` | JSON 序列化为文本 |

### 文本消息示例

```json
{
  "id": "uuid",
  "content": "部署完成：main 分支已更新"
}
```

飞书收到：
```
部署完成：main 分支已更新
```

### 卡片消息示例

```json
{
  "id": "uuid",
  "content": {
    "card": {
      "header": {
        "title": { "tag": "plain_text", "content": "部署通知" },
        "template": "blue"
      },
      "elements": [
        {
          "tag": "div",
          "text": { "tag": "plain_text", "content": "main 分支已成功部署" }
        }
      ]
    }
  }
}
```

---

## 核心组件

### 1. FeishuClient (feishu.ts)

封装飞书开放平台 API：

```typescript
class FeishuClient {
  private appId: string;
  private appSecret: string;
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor(appId: string, appSecret: string);

  // 获取 tenant_access_token（自动缓存和刷新）
  async getAccessToken(): Promise<string>;

  // 发送消息
  async sendMessage(
    receiveId: string,
    receiveIdType: string,
    msgType: 'text' | 'interactive',
    content: string | object
  ): Promise<void>;
}
```

**Token 管理：**
- 首次调用时获取 token
- 缓存 token 直到过期前 5 分钟
- 过期时自动刷新

### 2. FeishuConsumer (consumer.ts)

```typescript
class FeishuConsumer {
  private nc: NatsConnection | null = null;
  private feishu: FeishuClient;
  private config: ConsumerConfig;

  constructor(config: ConsumerConfig);

  async connect(): Promise<void>;
  async subscribe(): Promise<void>;
  private handleMessage(msg: Msg): Promise<void>;
  async close(): Promise<void>;
}
```

**消息处理流程：**
1. 解析 NATS 消息 JSON
2. 根据 content 类型确定消息类型
3. 调用飞书 API 发送
4. 记录日志

### 3. 入口 (index.ts)

```typescript
function loadConfig(): ConsumerConfig;
async function main(): Promise<void>;
```

---

## 错误处理

### 错误分类

| 错误类型 | 处理方式 |
|---------|---------|
| NATS 连接失败 | 重试 3 次后退出 |
| 飞书 Token 获取失败 | 重试 3 次后退出 |
| 飞书消息发送失败 | 记录日志，继续处理下一条 |
| 消息解析失败 | 记录日志，跳过该消息 |

### 日志格式

```
[Consumer] Starting Feishu Consumer...
[Consumer] Connected to nats://localhost:4222
[Consumer] Subscribed to summ.notify.event
[Feishu] Access token obtained, expires in 7200s
[Feishu] Message sent to ou_xxx: text
```

---

## 测试策略

### 单元测试

| 测试文件 | 测试内容 |
|---------|---------|
| `feishu.test.ts` | Token 获取、消息发送、错误处理 |
| `consumer.test.ts` | 消息解析、类型判断 |

### 集成测试

1. 启动本地 NATS
2. 发送测试消息到 `summ.notify.event`
3. 验证飞书收到消息

### 测试命令

```bash
npm test                 # 单元测试
npm run test:integration # 集成测试（需要 NATS 和飞书配置）
```

---

## 部署

### 本地运行

```bash
cd consumer/feishu-consumer
npm install
npm run build

export NATS_URL=nats://localhost:4222
export FEISHU_APP_ID=cli_xxx
export FEISHU_APP_SECRET=xxx
export FEISHU_RECEIVER_ID=ou_xxx

npm start
```

### Docker 部署

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
CMD ["node", "dist/index.js"]
```

---

## 依赖

| 包名 | 版本 | 用途 |
|-----|------|------|
| `nats` | ^2.18.0 | NATS 客户端 |
| `node-fetch` | ^3.x | HTTP 请求（或使用原生 fetch） |

---

## 飞书应用配置

### 创建应用

1. 访问 [飞书开放平台](https://open.feishu.cn/)
2. 创建企业自建应用
3. 获取 App ID 和 App Secret

### 配置权限

需要开通以下权限：

| 权限 | 说明 |
|-----|------|
| `im:message:send_as_bot` | 以应用身份发消息 |
| `im:message` | 获取和发送消息 |

### 获取接收者 ID

1. 在飞书中打开目标用户的个人资料
2. 点击「更多」→「复制 open_id」

---

*版本: v1.0*
*更新日期: 2026-03-17*
