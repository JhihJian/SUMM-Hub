# Feishu Consumer E2E 测试实现计划

基于 spec: `docs/superpowers/specs/2026-03-18-feishu-consumer-e2e-test-design.md`

---

## 文件结构

```
consumer/feishu-consumer/
├── src/
│   ├── feishu.ts          # 修改：返回 message_id
│   └── consumer.ts        # 修改：测试模式发布确认
├── test/
│   └── feishu.test.ts     # 修改：更新测试验证返回值
├── test-integration/
│   └── e2e-runner.ts      # 新增：E2E 测试脚本
├── Dockerfile             # 新增：运行镜像
├── Dockerfile.e2e         # 新增：测试镜像
├── tsconfig.e2e.json      # 新增：E2E 编译配置
└── package.json           # 修改：添加 test:e2e 脚本

docker-compose.yml         # 修改：添加 feishu-consumer 和 feishu-e2e 服务
```

---

## Task 1: 修改 FeishuClient 返回 message_id

**目标**: 让 sendMessage 返回飞书 API 的 message_id

### 1.1 更新类型定义

**文件**: `consumer/feishu-consumer/src/feishu.ts`

在 `FeishuClient` 类中添加返回类型接口：

```typescript
export interface SendMessageResult {
  messageId: string;
}
```

### 1.2 修改 sendMessage 方法

**文件**: `consumer/feishu-consumer/src/feishu.ts`

```typescript
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

### 1.3 更新单元测试

**文件**: `consumer/feishu-consumer/test/feishu.test.ts`

更新 mock 返回值：

```typescript
// 在 mock 中添加返回值
vi.mock('@larksuiteoapi/node-sdk', () => {
  const mockMessageCreate = vi.fn().mockResolvedValue({
    data: { msg_id: 'test_message_id_123' },
  });
  // ... 其余 mock
});
```

添加测试验证返回值：

```typescript
it('should return messageId from response', async () => {
  const result = await client.sendMessage('ou_test', 'open_id', 'text', { text: 'hello' });
  expect(result.messageId).toBe('test_message_id_123');
});
```

### 1.4 验证

```bash
cd consumer/feishu-consumer && npm test -- test/feishu.test.ts
```

### 1.5 提交

```bash
git add consumer/feishu-consumer/src/feishu.ts consumer/feishu-consumer/test/feishu.test.ts
git commit -m "feat(feishu-consumer): Return messageId from sendMessage"
```

---

## Task 2: 修改 Consumer 支持测试模式

**目标**: 在 E2E_MODE 下发布确认消息到 test.e2e.ack

### 2.1 修改 handleMessage 方法

**文件**: `consumer/feishu-consumer/src/consumer.ts`

更新 `handleMessage` 方法：

```typescript
private async handleMessage(msg: Msg): Promise<void> {
  let notify: NotifyMessage;

  try {
    notify = JSON.parse(new TextDecoder().decode(msg.data)) as NotifyMessage;
  } catch (e) {
    console.error('[Consumer] Failed to parse message:', e);
    return;
  }

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
    if (process.env.E2E_MODE) {
      this.nc!.publish('test.e2e.ack', new TextEncoder().encode(JSON.stringify({
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

### 2.2 更新单元测试

**文件**: `consumer/feishu-consumer/test/consumer.test.ts`

更新 FeishuClient mock 返回值：

```typescript
vi.mock('../src/feishu', () => ({
  FeishuClient: vi.fn().mockImplementation(() => ({
    sendMessage: vi.fn().mockResolvedValue({ messageId: 'test_msg_id' }),
  })),
}));
```

### 2.3 验证

```bash
cd consumer/feishu-consumer && npm test -- test/consumer.test.ts
```

### 2.4 提交

```bash
git add consumer/feishu-consumer/src/consumer.ts consumer/feishu-consumer/test/consumer.test.ts
git commit -m "feat(feishu-consumer): Add E2E_MODE ack publishing"
```

---

## Task 3: 创建 tsconfig.e2e.json 和 test-integration 目录

**目标**: 配置 TypeScript 支持编译 test-integration

### 3.1 创建目录

```bash
mkdir -p consumer/feishu-consumer/test-integration
```

### 3.2 创建 tsconfig.e2e.json

**文件**: `consumer/feishu-consumer/tsconfig.e2e.json`

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "rootDir": ".",
    "outDir": "./dist"
  },
  "include": ["src/**/*", "test-integration/**/*"],
  "exclude": ["node_modules"]
}
```

### 3.3 验证编译

```bash
cd consumer/feishu-consumer && npx tsc -p tsconfig.e2e.json --noEmit
```

### 3.4 提交

```bash
git add consumer/feishu-consumer/tsconfig.e2e.json consumer/feishu-consumer/test-integration/.gitkeep
git commit -m "feat(feishu-consumer): Add tsconfig.e2e.json for E2E test compilation"
```

---

## Task 4: 创建 e2e-runner.ts

**目标**: 创建 E2E 测试脚本

### 4.1 创建测试脚本

**文件**: `consumer/feishu-consumer/test-integration/e2e-runner.ts`

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

### 4.2 验证编译

```bash
cd consumer/feishu-consumer && npx tsc -p tsconfig.e2e.json --noEmit
```

### 4.3 提交

```bash
git add consumer/feishu-consumer/test-integration/e2e-runner.ts
git commit -m "feat(feishu-consumer): Add E2E test runner"
```

---

## Task 5: 创建 Dockerfile 和 Dockerfile.e2e

**目标**: 创建 Docker 镜像配置

### 5.1 创建 Dockerfile

**文件**: `consumer/feishu-consumer/Dockerfile`

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

### 5.2 创建 Dockerfile.e2e

**文件**: `consumer/feishu-consumer/Dockerfile.e2e`

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json tsconfig.e2e.json ./
COPY src ./src
COPY test-integration ./test-integration

RUN npx tsc -p tsconfig.e2e.json

ENV NATS_URL=nats://localhost:4222
ENV E2E_MODE=true
ENV E2E_TIMEOUT_MS=10000

CMD ["node", "dist/test-integration/e2e-runner.js"]
```

### 5.3 提交

```bash
git add consumer/feishu-consumer/Dockerfile consumer/feishu-consumer/Dockerfile.e2e
git commit -m "feat(feishu-consumer): Add Dockerfile and Dockerfile.e2e"
```

---

## Task 6: 更新 package.json scripts

**目标**: 添加 test:e2e 脚本

### 6.1 更新 package.json

**文件**: `consumer/feishu-consumer/package.json`

在 scripts 中添加：

```json
{
  "scripts": {
    "build": "tsc",
    "build:e2e": "tsc -p tsconfig.e2e.json",
    "start": "node dist/index.js",
    "dev": "ts-node src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "node dist/test-integration/e2e-runner.js"
  }
}
```

### 6.2 验证

```bash
cd consumer/feishu-consumer && npm run build:e2e
```

### 6.3 提交

```bash
git add consumer/feishu-consumer/package.json
git commit -m "feat(feishu-consumer): Add test:e2e and build:e2e scripts"
```

---

## Task 7: 更新 docker-compose.yml

**目标**: 添加 feishu-consumer 和 feishu-e2e 服务

### 7.1 更新 docker-compose.yml

**文件**: `docker-compose.yml`（追加以下内容）

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
      nats:
        condition: service_healthy
      feishu-consumer:
        condition: service_started
    profiles:
      - test
```

### 7.2 验证配置

```bash
docker compose config --quiet
```

### 7.3 提交

```bash
git add docker-compose.yml
git commit -m "feat: Add feishu-consumer and feishu-e2e to docker-compose"
```

---

## Task 8: 运行所有单元测试

**目标**: 确保所有现有测试通过

### 8.1 运行测试

```bash
cd consumer/feishu-consumer && npm test
```

### 8.2 预期输出

```
 ✓ test/feishu.test.ts (5 tests)
 ✓ test/consumer.test.ts (7 tests)

 Test Files  2 passed (2)
      Tests  12 passed (12)
```

---

## Task 9: 本地 E2E 测试验证

**目标**: 验证本地 E2E 测试可以运行（需要真实凭证）

### 9.1 前置条件

```bash
# 启动 NATS
docker compose up -d nats

# 初始化 streams
./scripts/setup-streams.sh

# 设置环境变量
export NATS_URL=nats://localhost:4222
export E2E_MODE=true
export FEISHU_APP_ID=<your_app_id>
export FEISHU_APP_SECRET=<your_secret>
export FEISHU_RECEIVER_ID=<test_receiver_id>
```

### 9.2 构建 E2E

```bash
cd consumer/feishu-consumer && npm run build:e2e
```

### 9.3 运行 E2E 测试（手动）

需要两个终端：

**终端 1 - 启动 Consumer：**
```bash
cd consumer/feishu-consumer
E2E_MODE=true npm run dev
```

**终端 2 - 运行测试：**
```bash
cd consumer/feishu-consumer
npm run test:e2e
```

### 9.4 预期输出

```
[E2E] Starting E2E test...
[E2E] NATS URL: nats://localhost:4222
[E2E] Connected to NATS
[E2E] Subscribed to test.e2e.ack
[E2E] Published test message: e2e-...
[E2E] Received ack: { messageId: '...', originalId: 'e2e-...', msgType: 'text', timestamp: ... }
[E2E] PASSED - Message sent successfully
[E2E]   Message ID: ...
[E2E]   Type: text
```

---

## Task 10: Docker Compose E2E 测试验证

**目标**: 验证 Docker Compose 环境下 E2E 测试

### 10.1 设置环境变量

```bash
export FEISHU_APP_ID=<your_app_id>
export FEISHU_APP_SECRET=<your_secret>
export FEISHU_RECEIVER_ID=<test_receiver_id>
export E2E_MODE=true
```

### 10.2 构建并运行

```bash
# 构建镜像
docker compose build feishu-consumer feishu-e2e

# 运行 E2E 测试
docker compose --profile test up feishu-e2e
```

### 10.3 预期输出

```
[E2E] Starting E2E test...
[E2E] NATS URL: nats://nats:4222
[E2E] Connected to NATS
...
[E2E] PASSED - Message sent successfully
```

### 10.4 清理

```bash
docker compose --profile test down
```

---

## 最终验证清单

- [ ] 所有单元测试通过：`cd consumer/feishu-consumer && npm test`
- [ ] E2E 编译通过：`cd consumer/feishu-consumer && npm run build:e2e`
- [ ] Docker 镜像构建成功：`docker compose build feishu-consumer feishu-e2e`
- [ ] 本地 E2E 测试通过（需要凭证）
- [ ] Docker Compose E2E 测试通过（需要凭证）

---

## 文件清单

| 文件 | 操作 | 职责 |
|-----|------|------|
| `src/feishu.ts` | 修改 | 返回 message_id |
| `src/consumer.ts` | 修改 | E2E_MODE 发布确认 |
| `test/feishu.test.ts` | 修改 | 验证返回值 |
| `test/consumer.test.ts` | 修改 | 更新 mock |
| `test-integration/e2e-runner.ts` | 新增 | E2E 测试脚本 |
| `tsconfig.e2e.json` | 新增 | E2E 编译配置 |
| `Dockerfile` | 新增 | 运行镜像 |
| `Dockerfile.e2e` | 新增 | 测试镜像 |
| `package.json` | 修改 | 添加 scripts |
| `docker-compose.yml` | 修改 | 添加服务 |
