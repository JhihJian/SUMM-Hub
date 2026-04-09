# ARM64 部署指南

## 在构建机器上

```bash
cd /data/dev/SUMM-Hub/web

# 构建所有镜像（需要代理端口，默认 7897）
./build-arm64-images.sh [proxy_port]

# 生成的文件位于 images-arm64/ 目录：
# - frontend-arm64.tar (25MB)
# - backend-arm64.tar (82MB)
# - claude-consumer-arm64.tar (192MB)
# - nats-arm64.tar (20MB)
```

## 传输到目标服务器

```bash
# 打包所有镜像
tar -czvf summ-hub-images-arm64.tar.gz images-arm64/

# 复制到目标服务器
scp summ-hub-images-arm64.tar.gz user@arm64-server:/path/to/destination/
# 同时复制部署文件
scp docker-compose.arm64.yml load-images.sh user@arm64-server:/path/to/destination/
```

## 在目标 ARM64 服务器上

```bash
# 1. 解压镜像文件
tar -xzvf summ-hub-images-arm64.tar.gz

# 2. 加载镜像
./load-images.sh

# 3. 启动服务（包含内置 NATS）
docker compose -f docker-compose.arm64.yml up -d

# 5. 查看日志
docker compose -f docker-compose.arm64.yml logs -f

# 6. （可选）启动 claude-consumer
docker compose -f docker-compose.arm64.yml --profile consumer up -d
```

## 环境变量

在目标服务器上创建 `.env` 文件：

```env
ANTHROPIC_BASE_URL=https://api.anthropic.com
ANTHROPIC_AUTH_TOKEN=your-token-here
ANTHROPIC_MODEL=claude-sonnet-4-6
```

## 端口说明

| 服务 | 端口 | 说明 |
|------|------|------|
| frontend | 5173 | Web 界面 |
| backend | 3000 | API 服务 |
| nats | 4222 | 消息队列（内置） |
| nats | 8222 | NATS 监控端点 |

## 故障排查

```bash
# 检查服务状态
docker compose -f docker-compose.arm64.yml ps

# 检查镜像架构
docker inspect summ-hub-frontend:arm64 --format='{{.Architecture}}'

# 如果遇到 "exec format error"，说明架构不匹配
# 确保加载的是 ARM64 镜像
```
