# 快速开始

5 分钟上手 SUMM-Hub。

---

## 前置条件

- Docker & Docker Compose
- [NATS CLI](https://github.com/nats-io/natscli) (可选，用于调试)

---

## 1. 启动本地环境

```bash
# 克隆项目（或进入项目目录）
cd SUMM-Hub

# 启动 NATS
docker compose up -d

# 查看日志
docker compose logs -f nats
```

等待看到 `Server is ready` 日志。

---

## 2. 初始化 Stream

```bash
# 运行初始化脚本
./scripts/setup-streams.sh
```

输出示例：

```
=== SUMM-Hub Stream 初始化 ===
NATS URL: nats://localhost:4222

--- 创建 AI_INPUT Stream ---
AI_INPUT Stream 创建成功
ai-consumer Consumer 创建成功

...

=== Stream 初始化完成 ===
```

---

## 3. 验证环境

```bash
# 运行健康检查
./scripts/health-check.sh
```

输出示例：

```
=== SUMM-Hub 健康检查 ===
--- NATS 服务 ---
✓ NATS 服务运行中
  版本: 2.10.x

--- Stream 状态 ---
✓ AI_INPUT (消息数: 0)
✓ AI_OUTPUT (消息数: 0)
✓ AI_ERROR (消息数: 0)
✓ NOTIFY_EVENT (消息数: 0)

=== 所有检查通过 ===
```

---

## 4. 发送第一条消息

使用 NATS CLI 发送测试消息：

```bash
# 发布消息到 AI_INPUT
nats publish summ.ai.input \
  --header "Source:cli" \
  '{"id":"test-001","content":"Hello, SUMM-Hub!","created_at":"2026-03-17T10:00:00Z"}'
```

验证消息已存储：

```bash
# 查看 Stream 状态
nats stream info AI_INPUT
```

---

## 5. 消费第一条消息

使用 NATS CLI 消费消息：

```bash
# 订阅并消费一条消息
nats consumer next AI_INPUT ai-consumer
```

输出示例：

```
--- message #1 ---
Subject: summ.ai.input
Headers:
  Source: cli

{"id":"test-001","content":"Hello, SUMM-Hub!","created_at":"2026-03-17T10:00:00Z"}

Acknowledged message
```

---

## 6. 验证 Session 路由

Session 路由是 SUMM-Hub 的核心特性。下面演示基本流程：

### 发送首次消息（无 Session）

```bash
nats publish summ.ai.input \
  --header "Source:test" \
  '{"id":"first-001","content":"帮我分析这段代码","created_at":"2026-03-17T10:00:00Z"}'
```

### 模拟 Consumer 响应

```bash
# Consumer 处理后会发布响应到 summ.ai.output
# 响应中包含生成的 Session-Id
nats publish summ.ai.output \
  --header "Session-Id:sess_abc123" \
  --header "Source:ai-consumer" \
  '{"id":"resp-001","session":"sess_abc123","content":"好的，这段代码...","created_at":"2026-03-17T10:00:05Z"}'
```

### 发送后续消息（有 Session）

```bash
# 携带 Session-Id，路由到同一 Consumer
nats publish summ.ai.input \
  --header "Session-Id:sess_abc123" \
  --header "Source:test" \
  '{"id":"second-001","session":"sess_abc123","content":"继续解释第二部分","created_at":"2026-03-17T10:01:00Z"}'
```

---

## 7. 运行示例代码

### Go Consumer

```bash
cd examples/go
go mod download
CONSUMER_ID=0 CONSUMER_TOTAL=1 go run .
```

### TypeScript Producer

```bash
cd examples/typescript
npm install
npm run start
```

---

## 8. 清理环境

```bash
# 停止并清理
docker compose down -v
```

---

## 下一步

- [协议规范](./protocol.md) - 了解完整的协议定义
- [Consumer 指南](./consumer-guide.md) - 实现 Consumer
- [Producer 指南](./producer-guide.md) - 实现 Producer

---

*版本: v1.0*
*更新日期: 2026-03-17*
