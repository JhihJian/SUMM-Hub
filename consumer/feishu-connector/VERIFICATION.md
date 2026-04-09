# Feishu-Connector 验证方案

## 验证层级

```
┌─────────────────────────────────────────────────────────────┐
│  Level 4: 生产环境验证 (Real Feishu Environment)             │
│  - 真实飞书机器人                                            │
│  - 真实用户消息                                              │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│  Level 3: E2E 集成测试 (Docker Compose)                      │
│  - 完整服务栈: NATS + feishu-connector + mock-ai             │
│  - 验证消息流: input → NATS → output → reply                 │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│  Level 2: 组件集成测试 (Local + NATS)                        │
│  - 本地运行 connector，连接真实 NATS                         │
│  - 使用脚本发送测试消息                                       │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│  Level 1: 单元测试 (已完成 ✓)                                │
│  - Parser: 13 tests                                         │
│  - Connector: 9 tests                                       │
│  - Total: 22 tests passing                                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Level 1: 单元测试 ✅

```bash
cd consumer/feishu-connector
npm test
```

**验证内容:**
- Parser: 消息解析、@mention 检测、session 提取
- Connector: 配置验证、消息编码/解码

---

## Level 2: 组件集成测试

### 2.1 启动 NATS

```bash
# 在 SUMM-Hub 根目录
docker compose up -d nats

# 验证 NATS 运行
docker compose ps nats
curl http://localhost:8222/healthz
```

### 2.2 启动 feishu-connector

```bash
cd consumer/feishu-connector

# 设置环境变量
export FEISHU_APP_ID="your_test_app_id"
export FEISHU_APP_SECRET="your_test_app_secret"
export NATS_URL="nats://localhost:4222"
export TRIGGER_PREFIX="#"

# 运行 (开发模式)
npm run dev
```

### 2.3 发送测试消息

创建测试脚本 `test/send-test-message.ts`:

```typescript
import { connect } from "nats";

async function main() {
  const nc = await connect({ servers: "nats://localhost:4222" });

  const testMessage = {
    id: "test-" + Date.now(),
    session_id: "test-session-123",
    content: { text: "Hello from test" },
    context: {
      source: "feishu",
      chat_id: "oc_test_chat",
      message_id: "om_test_msg",
      chat_type: "p2p",
      sender_open_id: "ou_test_user",
      reply_to: "om_test_msg",
    },
    timestamp: Date.now(),
  };

  nc.publish("summ.ai.input", new TextEncoder().encode(JSON.stringify(testMessage)));
  console.log("Sent test message:", testMessage.id);

  // 订阅响应
  const sub = nc.subscribe("summ.ai.output");
  for await (const msg of sub) {
    const output = JSON.parse(new TextDecoder().decode(msg.data));
    console.log("Received output:", output);
    if (output.type === "done") break;
  }

  await nc.close();
}

main();
```

运行测试:
```bash
npx ts-node test/send-test-message.ts
```

---

## Level 3: E2E 集成测试 (Docker Compose)

### 3.1 运行 E2E 测试

```bash
cd consumer/feishu-connector

# 启动完整栈
docker compose -f docker-compose.e2e.yml up --abort-on-container-exit

# 查看日志
docker compose -f docker-compose.e2e.yml logs -f feishu-connector
```

### 3.2 验证点

- [ ] NATS JetStream 正常启动
- [ ] feishu-connector 连接 NATS 成功
- [ ] mock-ai 订阅 summ.ai.input 成功
- [ ] e2e-runner 发送测试消息成功
- [ ] 收到 mock-ai 响应

---

## Level 4: 生产环境验证

### 4.1 前置条件

1. **飞书应用配置**
   - 创建飞书自建应用
   - 获取 App ID 和 App Secret
   - 配置事件订阅: `im.message.receive_v1`
   - 启用机器人能力

2. **权限配置**
   ```
   im:message:receive_as_bot  - 接收消息
   im:message:send_as_bot    - 发送消息
   im:chat:readonly           - 读取群聊信息
   ```

3. **发布应用**
   - 提交版本审核
   - 发布到企业内部可用

### 4.2 部署配置

```bash
# docker-compose.yml 或 k8s 配置
environment:
  - FEISHU_APP_ID=${FEISHU_APP_ID}
  - FEISHU_APP_SECRET=${FEISHU_APP_SECRET}
  - NATS_URL=nats://nats:4222
  - TRIGGER_PREFIX=#
```

### 4.3 验证场景

| 场景 | 触发方式 | 预期结果 |
|------|----------|----------|
| 私聊 | 发送消息给机器人 | AI 回复 |
| 群聊 @bot | 在群中 @机器人 + 消息 | AI 回复 |
| 群聊无 @ | 在群中发送消息（不 @） | 无响应 |
| Session 持续 | 发送 `#session-test 连续消息` | 保持同一会话 |
| 错误处理 | 发送无效内容 | 错误提示 |

### 4.4 监控检查

```bash
# 检查服务状态
docker compose ps feishu-connector

# 查看日志
docker compose logs -f feishu-connector --tail=100

# 检查 NATS 消息流
nats stream info AI_INPUT
nats stream info AI_OUTPUT
```

---

## 快速验证清单

```bash
# 1. 单元测试
cd consumer/feishu-connector && npm test

# 2. Docker 构建
docker build -t feishu-connector:test .

# 3. E2E 测试
docker compose -f docker-compose.e2e.yml up --abort-on-container-exit

# 4. 本地集成测试 (需要 NATS)
# Terminal 1: 启动 NATS
docker compose up -d nats

# Terminal 2: 启动 connector
cd consumer/feishu-connector
FEISHU_APP_ID=test FEISHU_APP_SECRET=test npm run dev

# Terminal 3: 发送测试消息
npx ts-node test/send-test-message.ts
```

---

## 验证结果记录

| Level | 状态 | 备注 |
|-------|------|------|
| Level 1: 单元测试 | ✅ 22/22 | 已完成 |
| Level 2: 组件集成 | ⏳ | 需要 NATS 环境 |
| Level 3: E2E 测试 | ⏳ | 需要 Docker |
| Level 4: 生产验证 | ⏳ | 需要飞书应用 |
