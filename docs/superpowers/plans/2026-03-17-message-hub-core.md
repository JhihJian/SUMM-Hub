# Message Hub 基础设施实施计划

**Spec 参考:** [ai-message-processing-layer.md](../../ai-message-processing-layer.md)
**范围:** 基础设施 + 文档（不含 SDK）

---

## 项目定位

**Hub = NATS JetStream + 协议约定 + 文档**

不是开发一个库，而是：
- 提供开箱即用的 NATS 基础设施
- 定义清晰的协议规范
- 提供接入指南，让使用者知道如何实现 Consumer/Producer

---

## 文件结构

```
summ-hub/
├── docker-compose.yml           # 本地开发环境
├── nats/
│   ├── server.conf              # NATS 服务器配置
│   └── streams/                 # Stream 定义
│       ├── ai.conf              # AI 领域 Stream
│       └── notify.conf          # 通知领域 Stream
├── scripts/
│   ├── setup-streams.sh         # 初始化 Stream 和 Consumer
│   └── health-check.sh          # 健康检查
├── docs/
│   ├── index.md                 # 首页
│   ├── getting-started.md       # 快速开始
│   ├── protocol.md              # 协议规范
│   ├── subject-design.md        # Subject 设计
│   ├── message-format.md        # 消息格式
│   ├── consumer-guide.md        # Consumer 实现指南
│   ├── producer-guide.md        # Producer 实现指南
│   └── error-handling.md        # 错误处理
└── examples/
    ├── go/
    │   └── consumer.go          # Go Consumer 示例
    ├── rust/
    │   └── consumer.rs          # Rust Consumer 示例
    └── typescript/
        └── producer.ts          # TS Producer 示例
```

---

## Task 1: Docker Compose 环境

**描述:** 创建本地开发环境，包含 NATS JetStream。

**文件:**
- `docker-compose.yml`

**内容:**
```yaml
services:
  nats:
    image: nats:2.10-alpine
    ports:
      - "4222:4222"   # 客户端连接
      - "8222:8222"   # HTTP 监控
      - "6222:6222"   # 集群路由
    command: >
      -js
      -sd /data
      -m 8222
    volumes:
      - nats-data:/data
```

**验证:**
```bash
docker compose up -d
curl http://localhost:8222/varz | jq .version
docker compose down
```

---

## Task 2: NATS 服务器配置

**描述:** NATS 服务器基础配置。

**文件:**
- `nats/server.conf`

**内容:**
```
# 基础配置
server_name: summ-hub

# JetStream
jetstream {
    store_dir: /data
    max_memory_store: 1GB
    max_file_store: 10GB
}

# 监控
http_port: 8222

# 日志
log_file: /var/log/nats.log
log_size_limit: 10485760
```

**验证:**
```bash
docker compose up -d
docker compose exec nats nats server info
```

---

## Task 3: Stream 定义 - AI 领域

**描述:** 定义 AI 领域的 Stream 配置。

**文件:**
- `nats/streams/ai.conf`

**Stream 设计:**

| Stream | Subjects | 用途 |
|--------|----------|------|
| `AI_INPUT` | `summ.ai.input` | AI 输入消息 |
| `AI_OUTPUT` | `summ.ai.output` | AI 输出消息 |
| `AI_ERROR` | `summ.ai.error` | AI 错误消息 |

**配置内容:**
```
# AI_INPUT Stream
stream: AI_INPUT
subjects:
  - summ.ai.input
retention: limits
max_msgs: 100000
max_age: 7d
replicas: 1

# 消费者定义（示例）
consumers:
  ai-consumer-group:
    durable_name: ai-consumer
    filter_subject: summ.ai.input
    ack_policy: explicit
    max_deliver: 3
    ack_wait: 30s
```

**验证:**
```bash
./scripts/setup-streams.sh
docker compose exec nats nats stream list
```

---

## Task 4: Stream 初始化脚本

**描述:** 自动化创建 Stream 和 Consumer 的脚本。

**文件:**
- `scripts/setup-streams.sh`

**功能:**
- 创建 `AI_INPUT`、`AI_OUTPUT`、`AI_ERROR` Stream
- 创建默认 Consumer（Queue Group）
- 支持幂等执行

**验证:**
```bash
./scripts/setup-streams.sh
docker compose exec nats nats stream info AI_INPUT
```

---

## Task 5: 健康检查脚本

**描述:** 检查 NATS 和 Stream 状态的脚本。

**文件:**
- `scripts/health-check.sh`

**功能:**
- 检查 NATS 服务是否运行
- 检查各 Stream 是否存在
- 检查 Consumer 状态

**验证:**
```bash
./scripts/health-check.sh
```

---

## Task 6: 文档 - 首页

**描述:** 项目首页，概述 Hub 是什么。

**文件:**
- `docs/index.md`

**内容:**
- Hub 定位（不是什么 / 是什么）
- 架构图
- 快速链接

---

## Task 7: 文档 - 快速开始

**描述:** 5 分钟上手指南。

**文件:**
- `docs/getting-started.md`

**内容:**
- 启动本地环境
- 发送第一条消息
- 消费第一条消息
- 验证 Session 路由

---

## Task 8: 文档 - 协议规范

**描述:** 完整的协议规范。

**文件:**
- `docs/protocol.md`

**内容:**
- Subject 格式
- 消息格式（Payload + Headers）
- Session 约定
- 路由规则
- 错误处理

---

## Task 9: 文档 - Consumer 实现指南

**描述:** 教使用者如何实现 Consumer。

**文件:**
- `docs/consumer-guide.md`

**内容:**
- Queue Group 订阅
- Session 归属判断（哈希算法）
- ACK/NAK 处理
- 重试逻辑
- 错误发布
- 配置项说明

**伪代码:**
```go
func handleMessage(msg *nats.Msg) {
    sessionID := msg.Header.Get("Session-Id")

    // 无 Session → 处理并生成
    if sessionID == "" {
        processAndReply(msg)
        msg.Ack()
        return
    }

    // 有 Session → 检查归属
    if !ownsSession(sessionID) {
        msg.Nak(nats.AckWait(100ms))
        return
    }

    // 属于自己 → 处理
    processAndReply(msg)
    msg.Ack()
}
```

---

## Task 10: 文档 - Producer 实现指南

**描述:** 教使用者如何实现 Producer。

**文件:**
- `docs/producer-guide.md`

**内容:**
- 发布消息
- 携带 Headers
- 处理响应
- 错误订阅

---

## Task 11: 示例代码 - Go Consumer

**描述:** 完整可运行的 Go Consumer 示例。

**文件:**
- `examples/go/go.mod`
- `examples/go/main.go`

**功能:**
- Queue Group 订阅 `summ.ai.input`
- Session 哈希路由
- 发布响应到 `summ.ai.output`
- 错误处理

**验证:**
```bash
cd examples/go && go run .
```

---

## Task 12: 示例代码 - TypeScript Producer

**描述:** 完整可运行的 TS Producer 示例。

**文件:**
- `examples/typescript/package.json`
- `examples/typescript/src/producer.ts`

**功能:**
- 发布消息到 `summ.ai.input`
- 订阅 `summ.ai.output` 获取响应
- 处理 Session

**验证:**
```bash
cd examples/typescript && npm run start
```

---

## Task 13: README

**描述:** 项目根目录 README。

**文件:**
- `README.md`

**内容:**
- 项目介绍
- 快速开始
- 目录结构
- 文档链接

---

## Task 14: 最终验证

**描述:** 端到端验证整个环境。

**验证:**
```bash
# 启动环境
docker compose up -d

# 初始化 Stream
./scripts/setup-streams.sh

# 健康检查
./scripts/health-check.sh

# 运行示例（需要两个终端）
cd examples/go && CONSUMER_ID=0 CONSUMER_TOTAL=1 go run .
cd examples/typescript && npm run start

# 清理
docker compose down
```

---

## 总结

| 类别 | 文件 | 交付物 |
|------|------|--------|
| 基础设施 | `docker-compose.yml` | 本地 NATS 环境 |
| 基础设施 | `nats/server.conf` | NATS 配置 |
| 基础设施 | `nats/streams/*.conf` | Stream 定义 |
| 脚本 | `scripts/*.sh` | 初始化 & 健康检查 |
| 文档 | `docs/*.md` | 协议 & 指南 |
| 示例 | `examples/` | Go/TS 示例代码 |

**不包含:** SDK 库

---

*计划版本: 2.0*
*创建时间: 2026-03-17*
