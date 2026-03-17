# 部署指南

## 前置条件

- Docker 和 Docker Compose
- Anthropic API 凭证 (`ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`)

---

## 方式 1: Docker Compose（最简单）

```bash
# 1. 复制部署文件
mkdir -p claude-code-consumer && cd claude-code-consumer
curl -O docker-compose.yml https://raw.githubusercontent.com/summ-hub/SUMM-Hub/main/consumer/claude-code-consumer/deploy/docker-compose.yml

# 2. 设置环境变量
export ANTHROPIC_BASE_URL="your-base-url"
export ANTHROPIC_AUTH_TOKEN="your-token"

# 3. 启动服务
docker compose up -d

# 4. 查看日志
docker compose logs -f consumer
```

### 挂载外部工作目录

编辑 `docker-compose.yml`，修改 volumes 部分：

```yaml
volumes:
  # 使用本地项目作为工作目录
  - /path/to/your/project:/workspace
  # 或挂载多个项目
  - /home/user/projects:/workspace:ro
```

### 自定义实体类型

```bash
# 使用自定义实体类型（如 "code", "chat" 等）
export ENTITY_TYPE="code"
docker compose up -d
```

这会订阅 `summ.code.input` 主题而不是 `summ.ai.input`。

---

## 方式 2: Kubernetes

```bash
# 1. 创建命名空间和密钥
kubectl apply -f k8s-deployment.yaml

# 2. 编辑密钥（填入你的凭证）
kubectl edit secret anthropic-credentials -n summ-hub

# 3. 编辑配置（可选：修改实体类型、工作目录等）
kubectl edit configmap consumer-config -n summ-hub

# 4. 查看 Pod 状态
kubectl get pods -n summ-hub
```

---

## 方式 3: 手动构建镜像

```bash
# 1. 克隆仓库
git clone https://github.com/summ-hub/SUMM-Hub.git
cd SUMM-Hub/consumer/claude-code-consumer

# 2. 构建镜像
docker build -t claude-code-consumer:local .

# 3. 运行（需要先启动 NATS）
docker run -d \
  -e NATS_URL="nats://your-nats:4222" \
  -e CONSUMER_ID="0" \
  -e CONSUMER_TOTAL="1" \
  -e ENTITY_TYPE="ai" \
  -e WORKSPACE_DIR="/workspace" \
  -e ANTHROPIC_BASE_URL="your-base-url" \
  -e ANTHROPIC_AUTH_TOKEN="your-token" \
  -v /path/to/your/project:/workspace \
  claude-code-consumer:local
```

---

## 多实例部署（负载均衡）

要运行多个 Consumer 实例进行负载均衡：

### Docker Compose

```yaml
# docker-compose.yml
services:
  consumer-1:
    image: ghcr.io/summ-hub/claude-code-consumer:latest
    environment:
      CONSUMER_ID: "0"
      CONSUMER_TOTAL: "3"
      ENTITY_TYPE: "ai"
      # ... other env vars
    volumes:
      - ./workspace:/workspace

  consumer-2:
    image: ghcr.io/summ-hub/claude-code-consumer:latest
    environment:
      CONSUMER_ID: "1"
      CONSUMER_TOTAL: "3"
      ENTITY_TYPE: "ai"
      # ... other env vars
    volumes:
      - ./workspace:/workspace

  consumer-3:
    image: ghcr.io/summ-hub/claude-code-consumer:latest
    environment:
      CONSUMER_ID: "2"
      CONSUMER_TOTAL: "3"
      ENTITY_TYPE: "ai"
      # ... other env vars
    volumes:
      - ./workspace:/workspace
```

每个 Consumer 会根据 Session ID 的哈希值处理分配到的会话。

---

## 发送测试消息

使用 NATS CLI:

```bash
# 安装 NATS CLI
go install github.com/nats-io/natscli/nats@latest

# 发送消息到 summ.ai.input（默认实体类型）
nats request summ.ai.input '{"content":"Say hello","session_id":"test-1"}'

# 发送消息到自定义实体类型
nats request summ.code.input '{"content":"Write a function","session_id":"test-2"}'
```

或使用任意 NATS 客户端库。

---

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `NATS_URL` | NATS 服务器地址 | `nats://localhost:4222` |
| `CONSUMER_ID` | 当前实例 ID (0-N) | `0` |
| `CONSUMER_TOTAL` | 总实例数 | `1` |
| `SESSION_TTL_MS` | 会话过期时间 (毫秒) | `3600000` (1小时) |
| `ENTITY_TYPE` | 实体类型（用于构建 NATS 主题） | `ai` |
| `WORKSPACE_DIR` | Claude 运行时工作目录 | `/workspace` |
| `ANTHROPIC_BASE_URL` | Anthropic API 基础 URL | 必填 |
| `ANTHROPIC_AUTH_TOKEN` | Anthropic API 认证令牌 | 必填 |

### ENTITY_TYPE 说明

`ENTITY_TYPE` 用于构建 NATS 主题：
- 输入主题: `summ.{ENTITY_TYPE}.input`
- 输出主题: `summ.{ENTITY_TYPE}.output`

示例：
- `ENTITY_TYPE=ai` → 订阅 `summ.ai.input`
- `ENTITY_TYPE=code` → 订阅 `summ.code.input`
- `ENTITY_TYPE=chat` → 订阅 `summ.chat.input`

### WORKSPACE_DIR 说明

`WORKSPACE_DIR` 指定 Claude Code 的工作目录：
- Claude 会在该目录下执行代码和访问文件
- 可通过 Docker volumes 挂载外部项目
- 多个 Consumer 实例应共享同一个工作目录（或使用共享存储）

---

## 健康检查

```bash
# NATS 监控端点
curl http://localhost:8222/healthz

# Consumer 日志
docker compose logs consumer | grep -E "(Error|Starting|Connected)"

# 检查订阅的主题
docker compose logs consumer | grep "Subscribed to"
```

---

## 常见问题

### Q: 如何让多个 Consumer 共享同一个项目？

使用 Docker volumes 或共享存储（如 NFS、EFS）：

```yaml
volumes:
  - /shared/projects:/workspace
```

### Q: 如何为不同项目创建独立的 Consumer？

使用不同的 `ENTITY_TYPE` 和工作目录：

```yaml
# Consumer for project A
services:
  consumer-a:
    environment:
      ENTITY_TYPE: "project-a"
      WORKSPACE_DIR: "/workspace-a"
    volumes:
      - /projects/a:/workspace-a

  # Consumer for project B
  consumer-b:
    environment:
      ENTITY_TYPE: "project-b"
      WORKSPACE_DIR: "/workspace-b"
    volumes:
      - /projects/b:/workspace-b
```
