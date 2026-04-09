# Feishu-Connector

飞书双向消息连接器，实现飞书用户与 AI 通过 SUMM-Hub NATS 消息总线进行交互。

## 功能特性

- **WebSocket 连接**: 无需公网 URL，通过 WebSocket 接收飞书消息
- **群聊支持**: 通过 @机器人 触发 AI 对话
- **会话管理**: 使用 `#session-xxx` 前缀指定会话 ID
- **消息回复**: AI 响应回复到原始消息

## 快速开始

### 1. 配置环境变量

```bash
# 复制示例配置
cp .env.example .env

# 编辑配置
vim .env
```

**必需配置:**
```bash
FEISHU_APP_ID=cli_xxxxxxxxxxxx
FEISHU_APP_SECRET=xxxxxxxxxxxxxxxx
```

### 2. 使用 Docker Compose 启动

**前置条件:** NATS 服务已部署并可访问

```bash
# 启动服务
docker compose up -d

# 查看日志
docker compose logs -f feishu-connector
```

如果需要连接到外部 Docker 网络:

```yaml
# docker-compose.yml 末尾添加
networks:
  default:
    external:
      name: summ-hub_network
```

### 3. 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

## 配置说明

### 环境变量

| 变量 | 必需 | 默认值 | 说明 |
|------|------|--------|------|
| `FEISHU_APP_ID` | ✅ | - | 飞书应用 App ID |
| `FEISHU_APP_SECRET` | ✅ | - | 飞书应用 App Secret |
| `NATS_URL` | ❌ | `nats://localhost:4222` | NATS 服务器地址 |
| `INPUT_SUBJECT` | ❌ | `summ.ai.input` | AI 输入消息 Subject |
| `OUTPUT_SUBJECT` | ❌ | `summ.ai.output` | AI 输出消息 Subject |
| `TRIGGER_PREFIX` | ❌ | `#` | Session ID 前缀 |
| `BOT_OPEN_ID` | ❌ | 自动获取 | Bot 的 open_id |
| `LOG_LEVEL` | ❌ | `info` | 日志级别 |

### 消息 Subject 配置

默认使用 SUMM-Hub 标准协议:

```
summ.ai.input  → 发送给 AI 的消息
summ.ai.output ← AI 的响应消息
```

可以自定义 Subject 以支持不同的消息路由:

```bash
# 使用不同的 domain
INPUT_SUBJECT=summ.custom.input
OUTPUT_SUBJECT=summ.custom.output

# 使用不同的层级
INPUT_SUBJECT=bot.feishu.input
OUTPUT_SUBJECT=bot.feishu.output
```

## 使用方式

### 私聊

直接发送消息给机器人即可:

```
你好，请帮我写一段代码
```

### 群聊

在群聊中需要 @机器人:

```
@机器人 帮我分析这个问题
```

### 指定会话

使用 `#session-xxx` 前缀保持会话连续性:

```
#session-project-alpha 请帮我设计一个 API
#session-project-alpha 继续完善错误处理
```

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│                        Feishu Cloud                         │
└─────────────────────────────────────────────────────────────┘
                              │ WebSocket
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    feishu-connector                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │  WebSocket  │  │   Parser    │  │  Responder  │         │
│  │   Client    │  │             │  │             │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└─────────────────────────────────────────────────────────────┘
                              │ NATS
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    SUMM-Hub (NATS)                          │
│         summ.ai.input ←→ summ.ai.output                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                 claude-code-consumer                        │
│                    (AI 处理器)                              │
└─────────────────────────────────────────────────────────────┘
```

## 验证

### Level 1: 单元测试

```bash
./verify.sh 1
```

### Level 2: + Docker 构建

```bash
./verify.sh 2
```

### Level 3: + E2E 测试

```bash
./verify.sh 3
```

### Level 4: + 集成测试 (需要 NATS)

```bash
# 启动 NATS
docker compose up -d nats

# 发送测试消息
npx ts-node test/send-test-message.ts
```

## 开发

### 构建

```bash
npm run build
```

### 测试

```bash
npm test
```

### 类型检查

```bash
npm run typecheck
```

## 许可证

MIT
