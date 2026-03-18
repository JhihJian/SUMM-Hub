# Feishu Consumer E2E 测试设计

## 概述

通过 Docker Compose 编排 NATS + Consumer + 测试脚本，实现真实飞书 API 的完整链路验证。

## 架构

```dot
digraph e2e_flow {
    rankdir=LR;
    node [shape=box];

    e2e_runner [label="e2e-runner"];
    nats [label="NATS"];
    consumer [label="FeishuConsumer"];
    feishu [label="飞书 API"];

    e2e_runner -> nats [label="发布 summ.notify.event"];
    nats -> consumer [label="订阅"];
    consumer -> feishu [label="发送消息"];
    feishu -> consumer [label="返回 message_id"];
    consumer -> nats [label="发布 test.e2e.ack"];
    nats -> e2e_runner [label="订阅确认"];
}
```

## 文件结构

```
consumer/feishu-consumer/
├── src/
│   ├── feishu.ts          # 修改：返回 message_id
│   └── consumer.ts        # 修改：测试模式发布确认
├── test-integration/
│   └── e2e-runner.ts      # 新增：E2E 测试脚本
├── Dockerfile             # 新增：运行镜像
├── Dockerfile.e2e         # 新增：测试镜像
└── package.json           # 修改：添加 test:e2e 脚本
```

## 修改点

### 1. FeishuClient.sendMessage() 返回 message_id

**文件**: `src/feishu.ts`

```typescript
export interface SendMessageResult {
  messageId: string;
}

async sendMessage(
  receiveId: string,
  receiveIdType: string,
  msgType: FeishuMessageType,
  content: object
): Promise<SendMessageResult> {
  const response = await this.client.im.v1.message.create({
    params: {
      receive_id_type: receiveIdType as 'open_id' | 'user_id' | 'union_id' | 'email' | 'chat_id',
    },
    data: {
      receive_id: receiveId,
      msg_type: msgType,
      content: JSON.stringify(content),
    },
  });

  return {
    messageId: response.data?.msg_id || '',
  };
}
```

### 2. Consumer 测试模式发布确认

**文件**: `src/consumer.ts`

```typescript
private async handleMessage(msg: Msg): Promise<void> {
  // ... 现有解析逻辑 ...

  const msgType = FeishuConsumer.determineMessageType(notify.content);
  const content = FeishuConsumer.formatContent(notify.content, msgType);

  try {
    const result = await this.feishu.sendMessage(
      this.config.receiverId,
      this.config.receiverType,
      msgType,
      content
    );
    console.log(`[Feishu] Message sent: ${result.messageId}`);

    // 测试模式：发布确认消息
    if (this.nc && process.env.E2E_MODE) {
      this.nc.publish('test.e2e.ack', new TextEncoder().encode(JSON.stringify({
        messageId: result.messageId,
        originalId: notify.id,
        msgType,
        timestamp: Date.now(),
      })));
    }
  } catch (e) {
    console.error('[Feishu] Failed to send message:', e);
  }
}
```

### 3. E2E 测试脚本

**文件**: `test-integration/e2e-runner.ts`

```typescript
import { connect, NatsConnection } from 'nats';

const NATS_URL = process.env.NATS_URL || 'nats://localhost:4222';
const TIMEOUT_MS = parseInt(process.env.E2E_TIMEOUT_MS || '10000', 10);

interface AckMessage {
  messageId: string;
  originalId: string;
  msgType: string;
  timestamp: number;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function connectWithRetry(url: string, maxRetries: number): Promise<NatsConnection> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await connect({ servers: url, name: 'e2e-runner' });
    } catch (e) {
      if (i === maxRetries - 1) throw e;
      console.log(`[E2E] Connection attempt ${i + 1} failed, retrying...`);
      await sleep(1000);
    }
  }
  throw new Error('Failed to connect');
}

async function runE2E(): Promise<void> {
  console.log('[E2E] Starting E2E test...');
  console.log(`[E2E] NATS URL: ${NATS_URL}`);

  const nc = await connectWithRetry(NATS_URL, 10);
  console.log('[E2E] Connected to NATS');

  try {
    // 订阅确认消息
    const ackSub = nc.subscribe('test.e2e.ack');
    console.log('[E2E] Subscribed to test.e2e.ack');

    // 发布测试消息
    const testMessage = {
      id: `e2e-${Date.now()}`,
      content: `E2E 测试消息 - ${new Date().toISOString()}`,
    };

    nc.publish('summ.notify.event', new TextEncoder().encode(JSON.stringify(testMessage)));
    console.log('[E2E] Published test message:', testMessage.id);

    // 等待确认
    const timeout = setTimeout(() => {
      console.error('[E2E] FAILED - Timeout waiting for ack');
      process.exit(1);
    }, TIMEOUT_MS);

    for await (const msg of ackSub) {
      clearTimeout(timeout);
      const ack = JSON.parse(new TextDecoder().decode(msg.data)) as AckMessage;
      console.log('[E2E] Received ack:', ack);

      if (ack.originalId === testMessage.id && ack.messageId) {
        console.log('[E2E] PASSED - Message sent successfully');
        console.log(`[E2E]   Message ID: ${ack.messageId}`);
        console.log(`[E2E]   Type: ${ack.msgType}`);
        break;
      } else {
        console.error('[E2E] FAILED - Invalid ack');
        process.exit(1);
      }
    }

  } catch (e) {
    console.error('[E2E] Test failed:', e);
    process.exit(1);
  } finally {
    await nc.close();
  }
}

runE2E().catch((e) => {
  console.error('[E2E] Unhandled error:', e);
  process.exit(1);
});
```

### 4. Dockerfile

**文件**: `Dockerfile`

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY dist ./dist

ENV NATS_URL=nats://localhost:4222
ENV E2E_MODE=false

CMD ["node", "dist/index.js"]
```

### 5. Dockerfile.e2e

**文件**: `Dockerfile.e2e`

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY test-integration ./test-integration

RUN npx tsc

ENV NATS_URL=nats://localhost:4222
ENV E2E_MODE=true
ENV E2E_TIMEOUT_MS=10000

CMD ["node", "dist/test-integration/e2e-runner.js"]
```

### 6. 更新 docker-compose.yml

**文件**: `docker-compose.yml`（追加）

```yaml
  feishu-consumer:
    build: ./consumer/feishu-consumer
    environment:
      - NATS_URL=nats://nats:4222
      - FEISHU_APP_ID=${FEISHU_APP_ID}
      - FEISHU_APP_SECRET=${FEISHU_APP_SECRET}
      - FEISHU_RECEIVER_ID=${FEISHU_RECEIVER_ID}
      - FEISHU_RECEIVER_TYPE=${FEISHU_RECEIVER_TYPE:-open_id}
      - E2E_MODE=${E2E_MODE:-false}
    depends_on:
      nats:
        condition: service_healthy

  feishu-e2e:
    build:
      context: ./consumer/feishu-consumer
      dockerfile: Dockerfile.e2e
    environment:
      - NATS_URL=nats://nats:4222
    depends_on:
      - nats
      - feishu-consumer
    profiles:
      - test
```

### 7. 更新 package.json scripts

```json
{
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "ts-node src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "node dist/test-integration/e2e-runner.js"
  }
}
```

## 使用方式

### 本地运行（需要 NATS）

```bash
# 设置环境变量
export NATS_URL=nats://localhost:4222
export E2E_MODE=true
export FEISHU_APP_ID=cli_xxx
export FEISHU_APP_SECRET=xxx
export FEISHU_RECEIVER_ID=ou_xxx

# 构建并运行
npm run build
npm run test:e2e
```

### Docker Compose 运行

```bash
# 创建 .env 文件（或使用系统环境变量）
cat > .env << EOF
FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=xxx
FEISHU_RECEIVER_ID=ou_xxx
EOF

# 运行 E2E 测试
docker compose --profile test up feishu-e2e
```

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `NATS_URL` | `nats://localhost:4222` | NATS 服务器地址 |
| `FEISHU_APP_ID` | (必填) | 飞书应用 App ID |
| `FEISHU_APP_SECRET` | (必填) | 飞书应用 App Secret |
| `FEISHU_RECEIVER_ID` | (必填) | 测试接收者 ID |
| `FEISHU_RECEIVER_TYPE` | `open_id` | 接收者类型 |
| `E2E_MODE` | `false` | 是否启用测试确认机制 |
| `E2E_TIMEOUT_MS` | `10000` | E2E 测试超时时间（毫秒） |

## 验证标准

测试通过条件：
1. Consumer 成功连接 NATS
2. 测试消息被 Consumer 接收
3. 飞书 API 返回有效 message_id
4. 确认消息在超时时间内返回
