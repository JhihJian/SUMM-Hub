# Handoff: summctl Consumer 管理工具

> 日期: 2026-03-31
> 状态: ✅ 已完成
> 提交: `b09ea79`, `8795134`

---

## 概述

实现了一个 Rust CLI 工具 `summctl`，用于统一管理 SUMM-Hub 的所有 Consumer。支持两种发现模式：

1. **静态配置** - 通过 `consumers.yaml` 管理
2. **自动发现** - 通过 Docker Labels 自动发现运行中的 Consumer

---

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│                         summctl                              │
├─────────────────────────────────────────────────────────────┤
│  Commands:                                                  │
│  ├── discover    # Docker Labels 自动发现                   │
│  ├── status      # consumers.yaml 状态查询                  │
│  ├── start/stop/restart  # 容器管理                         │
│  ├── info        # 详细信息                                 │
│  ├── logs        # 日志查看                                 │
│  └── topology    # Subject 拓扑图                           │
├─────────────────────────────────────────────────────────────┤
│  Discovery Modes:                                           │
│  ├── Auto (Labels)    summctl discover                      │
│  └── Config (YAML)    summctl status                        │
└─────────────────────────────────────────────────────────────┘
```

---

## 文件结构

```
summctl/
├── Cargo.toml              # 依赖: clap, serde, tokio, serde_json
├── src/
│   ├── main.rs            # 入口
│   ├── cli.rs             # 命令定义 + 配置发现逻辑
│   ├── discover.rs        # Docker Labels 发现实现
│   ├── config.rs          # consumers.yaml 解析
│   ├── docker.rs          # docker compose 执行器
│   ├── status.rs          # 状态检测
│   ├── topology.rs        # 拓扑生成
│   └── error.rs           # 错误类型
└── target/release/summctl # 编译产物

consumers.yaml              # 静态配置文件（可选）
```

---

## 关键设计决策

### 1. 配置文件发现顺序

```
1. -c 选项显式指定
2. SUMMCTL_CONFIG 环境变量
3. Git 仓库根目录的 consumers.yaml
4. 当前目录的 consumers.yaml
```

### 2. Docker Labels 规范

| Label | 必需 | 说明 |
|-------|------|------|
| `summ.dev/role` | ✅ | 必须为 `consumer` |
| `summ.dev/name` | ❌ | Consumer 名称，默认用容器名 |
| `summ.dev/subscribe` | ✅ | 订阅的 subjects，逗号分隔 |
| `summ.dev/publish` | ✅ | 发布的 subjects，逗号分隔，无则为空 |

### 3. 环境变量替换

支持 `${VAR}` 和 `${VAR:-default}` 语法。

---

## 使用示例

### 静态配置模式

```yaml
# consumers.yaml
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

```bash
summctl status
summctl start feishu-connector
summctl topology
```

### 自动发现模式

```yaml
# docker-compose.yml
services:
  consumer:
    image: my-consumer
    labels:
      summ.dev/role: "consumer"
      summ.dev/name: "my-consumer"
      summ.dev/subscribe: "summ.ai.input"
      summ.dev/publish: "summ.ai.output,summ.ai.error"
```

```bash
summctl discover
```

### Docker Run 模式

```bash
docker run -d \
  --label summ.dev/role=consumer \
  --label summ.dev/name=my-consumer \
  --label summ.dev/subscribe="summ.ai.input" \
  --label summ.dev/publish="summ.ai.output" \
  -e NATS_URL=nats://host.docker.internal:6422 \
  my-consumer:latest

summctl discover
```

---

## 后续工作

### 已完成
- [x] CLI 基础命令: status, start, stop, restart, info, logs, topology
- [x] 配置文件发现 (git root, env var, -c option)
- [x] Docker Labels 自动发现
- [x] Subject 拓扑可视化
- [x] 文档: consumer-guide.md, DEPLOY.md

### 待实现 (P2)
- [ ] `summctl serve` - HTTP API 模式（供 Web UI 调用）
- [ ] NATS 订阅状态验证（实际检查 consumer 是否真的订阅了）
- [ ] 日志聚合
- [ ] 性能指标

---

## 测试验证

```bash
# 构建
cd /data/dev/SUMM-Hub/summctl
cargo build --release

# 安装
sudo cp target/release/summctl /usr/local/bin/

# 验证
summctl --version
summctl discover
summctl -c /data/dev/SUMM-Hub/consumers.yaml status
```

---

## 相关文档

- `docs/consumer-guide.md` - Consumer 开发指南（含 Labels 规范）
- `DEPLOY.md` - 部署文档（含 summctl 使用说明）
- `docs/superpowers/specs/2026-03-31-summctl-design.md` - 设计文档
- `docs/superpowers/plans/2026-03-31-summctl.md` - 实现计划

---

## 提交历史

```
b09ea79 feat(summctl): add discover command for auto-discovering consumers
8795134 docs: update consumer-guide with auto-discovery documentation
9be6cb8 docs: add summctl global config discovery documentation
4f73869 feat(summctl): add global config discovery
d061562 docs: add summctl deployment guide to DEPLOY.md
930ba6f feat: add summctl CLI tool for consumer management
dd48c37 docs: add summctl implementation plan
9cc4ce7 docs: add summctl consumer management tool design spec
```

---

## 联系人

如有问题，联系项目负责人或查阅上述文档。
