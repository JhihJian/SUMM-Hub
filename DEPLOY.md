# SUMM-Hub 部署文档

> 最后更新: 2026-03-31

## 架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│                        宿主机 (localhost)                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐   │
│  │   Frontend   │    │   Backend    │    │ Claude Consumer  │   │
│  │  :5173 (Nginx)│◄──│   :3000      │◄───│  (claude-code)   │   │
│  └──────────────┘    └──────────────┘    └──────────────────┘   │
│         │                   │                      │             │
│         │                   │                      │             │
│         └───────────────────┼──────────────────────┘             │
│                             │                                    │
│                    ┌────────▼────────┐                          │
│                    │      NATS       │                          │
│                    │  nats-nats-1    │                          │
│                    │  :6422 (宿主机)  │                          │
│                    │  :4222 (容器内)  │                          │
│                    └─────────────────┘                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## 消息流向

```
用户 → Frontend(:5173) → Backend(:3000) → NATS(:6422)
                                           ↓
                                    AI_INPUT Stream
                                           ↓
                                    Claude Consumer
                                           ↓
                                    AI_OUTPUT Stream
                                           ↓
                                    Backend → Frontend → 用户
```

---

## summctl - Consumer 管理工具

`summctl` 是统一的 Consumer 管理命令行工具，用于启动、停止、查看状态和拓扑。

### 安装

```bash
# 从源码构建
cd /data/dev/SUMM-Hub/summctl
cargo build --release

# 安装到系统路径
sudo cp target/release/summctl /usr/local/bin/

# 验证安装
summctl --version
```

### 配置文件

配置文件位于项目根目录 `consumers.yaml`：

```yaml
consumers:
  feishu-connector:
    description: "飞书双向消息连接器"
    path: ./consumer/feishu-connector
    subjects:
      subscribe: [summ.ai.input]
      publish: [summ.ai.output]
    env:
      NATS_URL: ${NATS_URL:-nats://host.docker.internal:6422}
```

### 常用命令

```bash
# 查看所有 consumer 状态
summctl status

# 启动/停止/重启
summctl start feishu-connector
summctl stop feishu-connector
summctl restart feishu-connector

# 查看详情
summctl info feishu-connector

# 查看日志
summctl logs feishu-connector -f

# 查看 Subject 拓扑
summctl topology
```

### 添加新 Consumer

1. 在 `consumers.yaml` 中添加配置
2. 确保 `path` 指向包含 `docker-compose.yml` 的目录
3. 声明 `subjects.subscribe` 和 `subjects.publish`

### 环境变量

配置文件支持环境变量替换：

- `${VAR}` - 必须设置的环境变量
- `${VAR:-default}` - 带默认值的环境变量

敏感信息（Token、密码）应通过环境变量传入，不要硬编码。

### 部署流程

```bash
# 1. 构建 summctl（如果需要）
cd /data/dev/SUMM-Hub
cargo build --release --manifest-path summctl/Cargo.toml
sudo cp summctl/target/release/summctl /usr/local/bin/

# 2. 配置环境变量
export NATS_URL="nats://localhost:6422"
export ANTHROPIC_BASE_URL="your_base_url"
export ANTHROPIC_AUTH_TOKEN="your_token"

# 3. 查看状态
summctl status

# 4. 启动需要的服务
summctl start claude-code-consumer
```

---

## 容器列表

| 容器名 | Compose 文件 | 项目名 | 端口 | 网络 / 挂载 |
|--------|-------------|--------|------|-------------|
| `nats-nats-1` | `/data/app/nats/docker-compose.yml` | `nats` | 6422:4222, 6822:8222 | `nats_default` |
| `web-frontend-1` | `/data/dev/SUMM-Hub/web/docker-compose.yml` | `web` | 5173:80 | `web_summ-network` |
| `web-backend-1` | `/data/dev/SUMM-Hub/web/docker-compose.yml` | `web` | 3000:3000 | `web_summ-network`, `nats_default` |
| `web-claude-consumer-1` | `/data/dev/SUMM-Hub/web/docker-compose.yml` | `web` | - | `web_summ-network`, `nats_default`<br>`/data/app/Agent/ai-center-agent:/workspace` |

---

## 启动命令

### 1. 启动 NATS

```bash
cd /data/app/nats
docker compose up -d
```

### 2. 启动 Web 服务

```bash
cd /data/dev/SUMM-Hub/web

# 基础服务 (frontend + backend)
docker compose up -d

# 包含 Claude Consumer (需要配置环境变量)
ANTHROPIC_BASE_URL="your_base_url" \
ANTHROPIC_AUTH_TOKEN="your_token" \
docker compose --profile consumer up -d
```

### 3. 停止服务

```bash
# 停止 Web 服务
cd /data/dev/SUMM-Hub/web
docker compose --profile consumer down

# 停止 NATS
cd /data/app/nats
docker compose down
```

---

## 网络配置

```
nats_default (外部网络)
    │
    └── nats-nats-1 (4222)
            ▲
            │
web_summ-network          nats_default (external)
    │                           │
    ├── web-frontend-1          │
    ├── web-backend-1 ──────────┘
    └── web-claude-consumer-1 ──┘
```

- `nats-nats-1` 只在 `nats_default` 网络
- `web-backend-1` 和 `web-claude-consumer-1` 同时连接两个网络
- 通过 `nats_default` 外部网络访问 NATS

---

## 环境变量

### NATS 连接

| 变量 | 值 | 说明 |
|------|-----|------|
| `NATS_URL` | `nats://nats-nats-1:4222` | 容器间通信使用内部端口 |

> 注意: 宿主机访问 NATS 用 `localhost:6422`，容器间通信用 `nats-nats-1:4222`

### Claude API (Consumer)

| 变量 | 说明 |
|------|------|
| `ANTHROPIC_BASE_URL` | Claude API 地址 |
| `ANTHROPIC_AUTH_TOKEN` | Claude API Token |
| `CONSUMER_ID` | 消费者 ID (默认 0) |
| `CONSUMER_TOTAL` | 消费者总数 (默认 1) |
| `ENTITY_TYPE` | 实体类型 (默认 `ai`) |
| `WORKSPACE_DIR` | 工作目录 (默认 `/workspace`) |

---

## 访问地址

| 服务 | 地址 |
|------|------|
| Web UI | http://localhost:5173 |
| API | http://localhost:3000 |
| NATS 监控 | http://localhost:6822 |

---

## 常用命令

### summctl（推荐）

```bash
# 查看所有 consumer 状态
summctl status

# 查看日志
summctl logs feishu-connector -f

# 启动/停止/重启
summctl start feishu-connector
summctl stop feishu-connector
summctl restart feishu-connector

# 查看 Subject 拓扑
summctl topology
```

### Docker 命令（备选）

```bash
# Backend 日志
docker logs web-backend-1 -f

# Consumer 日志
docker logs web-claude-consumer-1 -f

# NATS 日志
docker logs nats-nats-1 -f
```

### 检查 NATS Stream 状态

```bash
curl -s "http://localhost:6822/jsz?streams=true" | jq '.account_details[0].stream_detail[] | {name, messages: .state.messages, consumers: .state.consumer_count}'
```

### 重启服务

```bash
# 使用 summctl
summctl restart claude-code-consumer

# 或使用 docker compose
cd /data/dev/SUMM-Hub/web
docker compose restart backend
docker compose restart claude-consumer
```

---

## 变更记录

| 日期 | 变更内容 |
|------|----------|
| 2026-03-31 | 添加 summctl CLI 工具统一管理所有 Consumer |
| 2026-03-31 | 创建 `consumers.yaml` 统一配置文件 |
| 2026-03-27 | 配置 claude-consumer 工作目录为 `/data/app/Agent/ai-center-agent` |
| 2026-03-27 | 初始文档，Web 服务改为连接主项目 NATS (6422) |
