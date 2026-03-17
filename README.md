# SUMM-Hub

基于 NATS JetStream 的消息中心，解耦消息来源与处理者。

## 是什么

SUMM-Hub 是一个**消息集散中心**：

- 接收任意来源消息
- 按 Subject 分发给订阅者
- 保证同一 Session 的消息路由到同一 Consumer

## 不是什么

- 不处理消息内容
- 不承载业务逻辑
- 不关心消息语义
- 不管理 Session 状态

## 快速开始

### 1. 启动本地环境

```bash
docker compose up -d
```

### 2. 初始化 Stream

```bash
./scripts/setup-streams.sh
```

### 3. 验证环境

```bash
./scripts/health-check.sh
```

### 4. 运行示例

**Go Consumer:**
```bash
cd examples/go
CONSUMER_ID=0 CONSUMER_TOTAL=1 go run .
```

**TypeScript Producer:**
```bash
cd examples/typescript
npm install
npm run start
```

## 目录结构

```
SUMM-Hub/
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
│   ├── consumer-guide.md        # Consumer 实现指南
│   └── producer-guide.md        # Producer 实现指南
└── examples/
    ├── go/                      # Go Consumer 示例
    └── typescript/              # TypeScript Producer 示例
```

## 文档

| 文档 | 说明 |
|------|------|
| [快速开始](./docs/getting-started.md) | 5 分钟上手指南 |
| [协议规范](./docs/protocol.md) | Subject 格式、消息格式、路由规则 |
| [Consumer 指南](./docs/consumer-guide.md) | 如何实现 Consumer |
| [Producer 指南](./docs/producer-guide.md) | 如何实现 Producer |

## 核心概念

### Subject

消息路由的基础，格式为 `summ.<domain>.<action>`：

```
summ.ai.input    # AI 输入消息
summ.ai.output   # AI 输出消息
summ.ai.error    # AI 错误消息
```

### Session

通过 Header 传递的会话标识，用于将相关消息路由到同一 Consumer：

- 首次消息：无 Session-Id
- 后续消息：携带 `Session-Id: sess_xxx`

### Queue Group

多个 Consumer 组成消费组，NATS 确保同一消息只投递给组内一个 Consumer。

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│                       SUMM-Hub                               │
├─────────────────────────────────────────────────────────────┤
│                      NATS JetStream                          │
│                                                              │
│   • 消息传递    • 消息持久化                                  │
│   • 消费者进度追踪    • 重试 & 死信队列                       │
└─────────────────────────────────────────────────────────────┘
         ↑                                        ↓
    ┌─────────┐                             ┌──────────┐
    │ Producer │                            │ Consumer │
    └─────────┘                             └──────────┘
```

## 前置条件

- Docker & Docker Compose
- [NATS CLI](https://github.com/nats-io/natscli) (可选，用于调试)
- Go 1.21+ (运行 Go 示例)
- Node.js 18+ (运行 TypeScript 示例)

## 清理

```bash
docker compose down -v
```

## License

MIT
