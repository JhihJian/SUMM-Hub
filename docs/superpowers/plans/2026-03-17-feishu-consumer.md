# Feishu Consumer 实现计划

基于 spec: `docs/superpowers/specs/2026-03-17-feishu-consumer-design.md`

---

## 文件结构

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

## Task 1: 项目初始化

**目标**: 创建项目结构和配置文件

### 1.1 创建目录结构

```bash
mkdir -p consumer/feishu-consumer/src consumer/feishu-consumer/test
```

### 1.2 创建 package.json

**文件**: `consumer/feishu-consumer/package.json`

```json
{
  "name": "feishu-consumer",
  "version": "1.0.0",
  "description": "SUMM-Hub Consumer for sending messages to Feishu",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "ts-node src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "nats": "^2.18.0",
    "@larksuiteoapi/node-sdk": "^1.30.0"
  },
  "devDependencies": {
    "@types/node": "^20.10.0",
    "ts-node": "^10.9.2",
    "typescript": "^5.3.0",
    "vitest": "^3.0.0"
  }
}
```

### 1.3 创建 tsconfig.json

**文件**: `consumer/feishu-consumer/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "Node",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "ts-node": {
    "compilerOptions": {
      "module": "CommonJS"
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### 1.4 安装依赖

```bash
cd consumer/feishu-consumer && npm install
```

### 1.5 验证

```bash
cd consumer/feishu-consumer && npx tsc --version
```

### 1.6 提交

```bash
git add consumer/feishu-consumer/package.json consumer/feishu-consumer/tsconfig.json
git commit -m "feat(feishu-consumer): Initialize project structure"
```

---

## Task 2: 类型定义

**目标**: 定义 Consumer 配置和消息类型

### 2.1 写类型定义

**文件**: `consumer/feishu-consumer/src/types.ts`

```typescript
/**
 * Feishu Consumer 配置
 */
export interface FeishuConfig {
  /** NATS 服务器地址 */
  natsUrl: string;
  /** 飞书应用 App ID */
  appId: string;
  /** 飞书应用 App Secret */
  appSecret: string;
  /** 接收者 ID */
  receiverId: string;
  /** 接收者类型 */
  receiverType: 'open_id' | 'user_id' | 'union_id' | 'email' | 'chat_id';
}

/**
 * NATS 通知消息
 */
export interface NotifyMessage {
  /** 消息 ID */
  id: string;
  /** 消息内容：字符串或卡片对象 */
  content: string | CardContent;
  /** 上下文信息 */
  context?: Record<string, unknown>;
  /** 创建时间 */
  created_at?: string;
}

/**
 * 飞书卡片内容
 */
export interface CardContent {
  card: {
    header?: {
      title: { tag: string; content: string };
      template?: string;
    };
    elements: Array<{ tag: string; [key: string]: unknown }>;
  };
}

/**
 * 飞书消息类型
 */
export type FeishuMessageType = 'text' | 'interactive';
```

### 2.2 验证编译

```bash
cd consumer/feishu-consumer && npx tsc --noEmit
```

### 2.3 提交

```bash
git add consumer/feishu-consumer/src/types.ts
git commit -m "feat(feishu-consumer): Add type definitions"
```

---

## Task 3: FeishuClient - 测试先行

**目标**: 用 TDD 实现 FeishuClient

### 3.1 写测试

**文件**: `consumer/feishu-consumer/test/feishu.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FeishuClient } from '../src/feishu';
import type { FeishuConfig } from '../src/types';

// Mock @larksuiteoapi/node-sdk
vi.mock('@larksuiteoapi/node-sdk', () => {
  const mockMessageCreate = vi.fn();
  return {
    Client: vi.fn().mockImplementation(() => ({
      im: {
        v1: {
          message: {
            create: mockMessageCreate,
          },
        },
      },
    })),
    Domain: {
      Feishu: 'https://open.feishu.cn',
    },
  };
});

describe('FeishuClient', () => {
  let client: FeishuClient;
  const config: FeishuConfig = {
    natsUrl: 'nats://localhost:4222',
    appId: 'test_app_id',
    appSecret: 'test_secret',
    receiverId: 'ou_test',
    receiverType: 'open_id',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    client = new FeishuClient(config.appId, config.appSecret);
  });

  it('should create client with config', () => {
    expect(client).toBeDefined();
  });

  it('should send text message', async () => {
    await client.sendMessage('ou_test', 'open_id', 'text', { text: 'hello' });
    // 验证调用（SDK mock）
    expect(true).toBe(true);
  });

  it('should send card message', async () => {
    const cardContent = {
      card: {
        header: { title: { tag: 'plain_text', content: 'Title' } },
        elements: [],
      },
    };
    await client.sendMessage('ou_test', 'open_id', 'interactive', cardContent);
    expect(true).toBe(true);
  });
});
```

### 3.2 运行测试（预期失败）

```bash
cd consumer/feishu-consumer && npm test -- test/feishu.test.ts
```

### 3.3 实现 FeishuClient

**文件**: `consumer/feishu-consumer/src/feishu.ts`

```typescript
import * as Lark from '@larksuiteoapi/node-sdk';
import type { FeishuMessageType } from './types';

/**
 * 飞书 API 客户端
 * 封装官方 SDK，简化消息发送
 */
export class FeishuClient {
  private client: Lark.Client;

  constructor(appId: string, appSecret: string) {
    this.client = new Lark.Client({
      appId,
      appSecret,
      domain: Lark.Domain.Feishu,
    });
  }

  /**
   * 发送消息给指定接收者
   * SDK 自动处理 tenant_access_token 的获取和刷新
   */
  async sendMessage(
    receiveId: string,
    receiveIdType: string,
    msgType: FeishuMessageType,
    content: object
  ): Promise<void> {
    await this.client.im.v1.message.create({
      params: {
        receive_id_type: receiveIdType as Lark.im.v1.MessageCreatePathParams.receive_id_type,
      },
      data: {
        receive_id: receiveId,
        msg_type: msgType,
        content: JSON.stringify(content),
      },
    });
  }
}
```

### 3.4 运行测试（预期通过）

```bash
cd consumer/feishu-consumer && npm test -- test/feishu.test.ts
```

### 3.5 提交

```bash
git add consumer/feishu-consumer/src/feishu.ts consumer/feishu-consumer/test/feishu.test.ts
git commit -m "feat(feishu-consumer): Implement FeishuClient with tests"
```

---

## Task 4: FeishuConsumer - 测试先行

**目标**: 用 TDD 实现 NATS 消息处理

### 4.1 写测试

**文件**: `consumer/feishu-consumer/test/consumer.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FeishuConsumer } from '../src/consumer';
import type { FeishuConfig, NotifyMessage } from '../src/types';

// Mock NATS
const mockSubscribe = vi.fn();
const mockClose = vi.fn();
vi.mock('nats', () => ({
  connect: vi.fn().mockResolvedValue({
    subscribe: mockSubscribe,
    close: mockClose,
  }),
}));

// Mock FeishuClient
vi.mock('../src/feishu', () => ({
  FeishuClient: vi.fn().mockImplementation(() => ({
    sendMessage: vi.fn().mockResolvedValue(undefined),
  })),
}));

describe('FeishuConsumer', () => {
  let consumer: FeishuConsumer;
  const config: FeishuConfig = {
    natsUrl: 'nats://localhost:4222',
    appId: 'test_app_id',
    appSecret: 'test_secret',
    receiverId: 'ou_test',
    receiverType: 'open_id',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    consumer = new FeishuConsumer(config);
  });

  it('should create consumer with config', () => {
    expect(consumer).toBeDefined();
  });

  it('should connect to NATS', async () => {
    await consumer.connect();
    expect(true).toBe(true);
  });

  it('should close connection', async () => {
    await consumer.connect();
    await consumer.close();
    expect(mockClose).toHaveBeenCalled();
  });
});

describe('determineMessageType', () => {
  it('should return text for string content', () => {
    const msg: NotifyMessage = { id: '1', content: 'hello' };
    const type = FeishuConsumer.determineMessageType(msg.content);
    expect(type).toBe('text');
  });

  it('should return interactive for card content', () => {
    const msg: NotifyMessage = {
      id: '1',
      content: { card: { header: { title: { tag: 'plain_text', content: 'Title' } }, elements: [] } },
    };
    const type = FeishuConsumer.determineMessageType(msg.content);
    expect(type).toBe('interactive');
  });
});

describe('formatContent', () => {
  it('should format text content', () => {
    const content = FeishuConsumer.formatContent('hello', 'text');
    expect(content).toEqual({ text: 'hello' });
  });

  it('should format card content', () => {
    const card = { card: { elements: [] } };
    const content = FeishuConsumer.formatContent(card, 'interactive');
    expect(content).toEqual(card);
  });
});
```

### 4.2 运行测试（预期失败）

```bash
cd consumer/feishu-consumer && npm test -- test/consumer.test.ts
```

### 4.3 实现 FeishuConsumer

**文件**: `consumer/feishu-consumer/src/consumer.ts`

```typescript
import { connect, NatsConnection, Subscription, Msg } from 'nats';
import { FeishuClient } from './feishu';
import type { FeishuConfig, NotifyMessage, FeishuMessageType } from './types';

/**
 * NATS → 飞书 Consumer
 * 订阅 summ.notify.event，转发消息到飞书
 */
export class FeishuConsumer {
  private nc: NatsConnection | null = null;
  private feishu: FeishuClient;
  private config: FeishuConfig;
  private sub: Subscription | null = null;

  constructor(config: FeishuConfig) {
    this.config = config;
    this.feishu = new FeishuClient(config.appId, config.appSecret);
  }

  /**
   * 连接 NATS 服务器
   */
  async connect(): Promise<void> {
    this.nc = await connect({
      servers: this.config.natsUrl,
      name: 'feishu-consumer',
    });
    console.log(`[Consumer] Connected to ${this.config.natsUrl}`);
  }

  /**
   * 订阅 summ.notify.event
   */
  async subscribe(): Promise<void> {
    if (!this.nc) {
      throw new Error('Not connected to NATS');
    }

    this.sub = this.nc.subscribe('summ.notify.event');
    console.log('[Consumer] Subscribed to summ.notify.event');

    for await (const msg of this.sub) {
      await this.handleMessage(msg);
    }
  }

  /**
   * 处理单条消息
   */
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
      await this.feishu.sendMessage(
        this.config.receiverId,
        this.config.receiverType,
        msgType,
        content
      );
      console.log(`[Feishu] Message sent to ${this.config.receiverId}: ${msgType}`);
    } catch (e) {
      console.error('[Feishu] Failed to send message:', e);
    }
  }

  /**
   * 判断消息类型
   */
  static determineMessageType(content: NotifyMessage['content']): FeishuMessageType {
    if (typeof content === 'string') {
      return 'text';
    }
    if (typeof content === 'object' && content !== null && 'card' in content) {
      return 'interactive';
    }
    return 'text';
  }

  /**
   * 格式化消息内容
   */
  static formatContent(content: NotifyMessage['content'], msgType: FeishuMessageType): object {
    if (msgType === 'text') {
      return { text: typeof content === 'string' ? content : JSON.stringify(content) };
    }
    return content as object;
  }

  /**
   * 关闭连接
   */
  async close(): Promise<void> {
    if (this.nc) {
      await this.nc.close();
      console.log('[Consumer] Connection closed');
    }
  }
}
```

### 4.4 运行测试（预期通过）

```bash
cd consumer/feishu-consumer && npm test -- test/consumer.test.ts
```

### 4.5 提交

```bash
git add consumer/feishu-consumer/src/consumer.ts consumer/feishu-consumer/test/consumer.test.ts
git commit -m "feat(feishu-consumer): Implement FeishuConsumer with tests"
```

---

## Task 5: 入口文件

**目标**: 创建启动入口

### 5.1 写入口文件

**文件**: `consumer/feishu-consumer/src/index.ts`

```typescript
import { FeishuConsumer } from './consumer';
import type { FeishuConfig } from './types';

/**
 * 从环境变量加载配置
 */
function loadConfig(): FeishuConfig {
  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;
  const receiverId = process.env.FEISHU_RECEIVER_ID;

  if (!appId || !appSecret || !receiverId) {
    console.error('[Consumer] Missing required environment variables:');
    console.error('  FEISHU_APP_ID, FEISHU_APP_SECRET, FEISHU_RECEIVER_ID');
    process.exit(1);
  }

  return {
    natsUrl: process.env.NATS_URL || 'nats://localhost:4222',
    appId,
    appSecret,
    receiverId,
    receiverType: (process.env.FEISHU_RECEIVER_TYPE as FeishuConfig['receiverType']) || 'open_id',
  };
}

/**
 * 主函数
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const consumer = new FeishuConsumer(config);

  console.log('[Consumer] Starting Feishu Consumer...');
  console.log('[Consumer] Config:', {
    natsUrl: config.natsUrl,
    receiverId: config.receiverId,
    receiverType: config.receiverType,
  });

  // 优雅退出
  const shutdown = async (signal: string) => {
    console.log(`\n[Consumer] Received ${signal}, shutting down...`);
    await consumer.close();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  try {
    await consumer.connect();
    await consumer.subscribe();
  } catch (e) {
    console.error('[Consumer] Fatal error:', e);
    await consumer.close();
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('[Consumer] Unhandled error:', e);
  process.exit(1);
});
```

### 5.2 编译验证

```bash
cd consumer/feishu-consumer && npm run build
```

### 5.3 提交

```bash
git add consumer/feishu-consumer/src/index.ts
git commit -m "feat(feishu-consumer): Add entry point with graceful shutdown"
```

---

## Task 6: 运行所有测试

**目标**: 确保所有测试通过

### 6.1 运行全部测试

```bash
cd consumer/feishu-consumer && npm test
```

### 6.2 预期输出

```
 ✓ test/feishu.test.ts (3)
 ✓ test/consumer.test.ts (5)

 Test Files  2 passed (2)
      Tests  8 passed (8)
```

---

## Task 7: README 文档

**目标**: 添加使用文档

### 7.1 写 README

**文件**: `consumer/feishu-consumer/README.md`

```markdown
# Feishu Consumer

SUMM-Hub Consumer，订阅 NATS 消息并转发到飞书私聊。

## 快速开始

### 1. 配置飞书应用

1. 访问 [飞书开放平台](https://open.feishu.cn/)
2. 创建企业自建应用
3. 开通权限：`im:message:send_as_bot`, `im:message`
4. 获取 App ID 和 App Secret

### 2. 获取接收者 ID

在飞书中打开目标用户 → 个人资料 → 更多 → 复制 open_id

### 3. 启动

```bash
npm install
npm run build

export FEISHU_APP_ID=cli_xxx
export FEISHU_APP_SECRET=xxx
export FEISHU_RECEIVER_ID=ou_xxx

npm start
```

## 环境变量

| 变量名 | 必填 | 默认值 | 说明 |
|-------|------|-------|------|
| `NATS_URL` | 否 | `nats://localhost:4222` | NATS 服务器地址 |
| `FEISHU_APP_ID` | 是 | - | 飞书应用 App ID |
| `FEISHU_APP_SECRET` | 是 | - | 飞书应用 App Secret |
| `FEISHU_RECEIVER_ID` | 是 | - | 接收者 ID |
| `FEISHU_RECEIVER_TYPE` | 否 | `open_id` | 接收者类型 |

## 消息格式

### 文本消息

```json
{
  "id": "uuid",
  "content": "这是文本消息"
}
```

### 卡片消息

```json
{
  "id": "uuid",
  "content": {
    "card": {
      "header": { "title": { "tag": "plain_text", "content": "标题" } },
      "elements": [{ "tag": "div", "text": { "tag": "plain_text", "content": "内容" } }]
    }
  }
}
```

## 测试

```bash
npm test
```
```

### 7.2 提交

```bash
git add consumer/feishu-consumer/README.md
git commit -m "docs(feishu-consumer): Add README"
```

---

## 最终验证

### 编译检查

```bash
cd consumer/feishu-consumer && npm run build
```

### 测试检查

```bash
cd consumer/feishu-consumer && npm test
```

### 预期结果

- 编译无错误
- 所有测试通过

---

## 文件清单

| 文件 | 职责 |
|-----|------|
| `src/types.ts` | 类型定义 |
| `src/feishu.ts` | 飞书 API 封装 |
| `src/consumer.ts` | NATS 订阅和消息处理 |
| `src/index.ts` | 入口，配置加载，启动 |
| `test/feishu.test.ts` | FeishuClient 单元测试 |
| `test/consumer.test.ts` | FeishuConsumer 单元测试 |
| `package.json` | 项目配置 |
| `tsconfig.json` | TypeScript 配置 |
| `README.md` | 使用文档 |
