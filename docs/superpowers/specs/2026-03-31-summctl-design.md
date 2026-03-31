# summctl - Consumer管理工具设计文档

## 概述

summctl 是一个统一的CLI工具，用于管理SUMM-Hub的所有consumer服务。解决当前consumer管理面临的三个核心问题：

1. **部署麻烦** - 每个consumer独立管理，启停分散
2. **监控困难** - 不知道哪些在跑、哪些挂了
3. **配置分散** - 配置文件分散在各个目录

## 目标

- 提供统一的consumer启停管理入口
- 可视化consumer运行状态
- 清晰展示Subject拓扑关系（谁监听什么、发送什么）
- 为未来Web UI扩展预留API能力

## 配置规范

### consumers.yaml

位置：项目根目录 `/data/dev/SUMM-Hub/consumers.yaml`

```yaml
# SUMM-Hub Consumer 配置清单
# 路径: /data/dev/SUMM-Hub/consumers.yaml

# 全局默认配置
defaults:
  nats_url: nats://host.docker.internal:6422
  log_level: info

# Consumer 定义
consumers:
  feishu-connector:
    description: "飞书双向消息连接器"
    path: ./consumer/feishu-connector
    subjects:
      subscribe: [summ.ai.input]
      publish: [summ.ai.output]
    env:
      FEISHU_APP_ID: ${FEISHU_APP_ID}
      FEISHU_APP_SECRET: ${FEISHU_APP_SECRET}
      NATS_URL: ${NATS_URL:-nats://host.docker.internal:6422}

  claude-code-consumer:
    description: "Claude Code AI处理"
    path: ./consumer/claude-code-consumer/deploy
    subjects:
      subscribe: [summ.ai.input]
      publish: [summ.ai.output, summ.ai.error]
    env:
      ANTHROPIC_BASE_URL: ${ANTHROPIC_BASE_URL}
      ANTHROPIC_AUTH_TOKEN: ${ANTHROPIC_AUTH_TOKEN}
      NATS_URL: nats://summ-hub-nats-1:4222

  script-consumer:
    description: "脚本执行消费器"
    path: ./consumer/script-consumer
    subjects:
      subscribe: [summ.notify.info]
      publish: []
    env:
      NATS_URL: ${NATS_URL:-nats://host.docker.internal:6422}
      DINGTALK_TOKEN: ${DINGTALK_TOKEN}
```

### 配置约束

1. `path` 相对于项目根目录，指向docker-compose.yml所在目录
2. `${VAR}` 语法从环境变量读取，敏感信息不入库
3. `${VAR:-default}` 支持默认值
4. `subjects.subscribe` 和 `subjects.publish` 必须明确声明

## CLI 命令

### 核心命令

```bash
# 查看所有consumer状态
summctl status

# 启动/停止/重启
summctl start <name>
summctl stop <name>
summctl restart <name>

# 查看单个consumer详情（含Subject拓扑）
summctl info <name>

# 查看日志
summctl logs <name> [-f]

# 查看Subject拓扑图
summctl topology

# API模式（供Web UI调用）
summctl serve --port 8080
```

### 输出示例

**`summctl status`：**
```
NAME                STATUS      SUBJECTS IN          SUBJECTS OUT
feishu-connector    running     summ.ai.input        summ.ai.output
claude-code         running     summ.ai.input        summ.ai.output, summ.ai.error
script-consumer     stopped     summ.notify.info     -
```

**`summctl topology`：**
```
NATS Subject Topology
=====================

summ.ai.input
  ├─► feishu-connector
  └─► claude-code-consumer

summ.ai.output
  └─► (external subscribers)

summ.notify.info
  └─► script-consumer
```

**`summctl info feishu-connector`：**
```
Name:        feishu-connector
Description: 飞书双向消息连接器
Status:      running (Up 2 hours)
Path:        ./consumer/feishu-connector

Subjects:
  Subscribe: summ.ai.input
  Publish:   summ.ai.output

Environment:
  FEISHU_APP_ID:     cli_xxxx (set)
  FEISHU_APP_SECRET: ******** (set)
  NATS_URL:          nats://host.docker.internal:6422
```

## 架构设计

```
┌─────────────────────────────────────────────────────┐
│                    summctl                          │
├─────────────────────────────────────────────────────┤
│  CLI Layer (clap)      │  API Layer (axum)          │
│  - summctl status      │  - GET /api/consumers      │
│  - summctl start xxx   │  - POST /api/consumers/x   │
│  - summctl topology    │  - GET /api/topology       │
├────────────────────────┴────────────────────────────┤
│                   Core Engine                       │
│  - Config (serde + yaml)                           │
│  - DockerExecutor (tokio::process)                 │
│  - StateInspector (docker ps parse)                │
├─────────────────────────────────────────────────────┤
│                   Filesystem                        │
│  consumers.yaml                                      │
│  consumer/*/docker-compose.yml                      │
└─────────────────────────────────────────────────────┘
```

## 技术栈

| 组件 | 选择 | 理由 |
|------|------|------|
| 语言 | Rust | 单二进制、内存安全、性能好 |
| CLI框架 | clap | 成熟、derive宏简化定义 |
| HTTP框架 | axum | 可选，API模式用 |
| 序列化 | serde + serde_yaml | YAML解析标准 |
| 异步运行时 | tokio | 标准选择 |

### 依赖

```toml
[package]
name = "summctl"
version = "0.1.0"
edition = "2021"

[dependencies]
clap = { version = "4", features = ["derive"] }
serde = { version = "1", features = ["derive"] }
serde_yaml = "0.9"
tokio = { version = "1", features = ["full"] }
thiserror = "1"
tracing = "0.1"
tracing-subscriber = "0.3"
regex = "1"

# 可选：API模式
axum = { version = "0.7", optional = true }
tower-http = { version = "0.5", optional = true }

[features]
default = []
api = ["axum", "tower-http"]
```

## 核心数据结构

```rust
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

/// consumers.yaml 根结构
#[derive(Debug, Deserialize)]
pub struct Config {
    pub defaults: Option<Defaults>,
    pub consumers: HashMap<String, ConsumerConfig>,
}

#[derive(Debug, Deserialize)]
pub struct Defaults {
    pub nats_url: Option<String>,
    pub log_level: Option<String>,
}

/// 单个Consumer配置
#[derive(Debug, Deserialize, Serialize)]
pub struct ConsumerConfig {
    pub description: String,
    pub path: PathBuf,
    pub subjects: Subjects,
    #[serde(default)]
    pub env: HashMap<String, String>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct Subjects {
    pub subscribe: Vec<String>,
    pub publish: Vec<String>,
}

/// Consumer运行时状态
#[derive(Debug, Serialize)]
pub struct ConsumerStatus {
    pub name: String,
    pub config: ConsumerConfig,
    pub status: ContainerStatus,
    pub uptime: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "lowercase")]
pub enum ContainerStatus {
    Running,
    Stopped,
    Error,
    Unknown,
}

/// Subject拓扑
#[derive(Debug, Serialize)]
pub struct Topology {
    pub subjects: HashMap<String, Vec<SubjectEdge>>,
}

#[derive(Debug, Serialize)]
pub struct SubjectEdge {
    pub consumer: String,
    pub direction: Direction,
}

#[derive(Debug, Serialize)]
pub enum Direction {
    Subscribe,
    Publish,
}
```

## 错误处理

```rust
use thiserror::Error;

#[derive(Debug, Error)]
pub enum SummctlError {
    #[error("Consumer not found: {0}")]
    NotFound(String),

    #[error("Docker compose failed: {0}")]
    DockerError(String),

    #[error("Failed to parse config: {0}")]
    ConfigError(#[from] serde_yaml::Error),

    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),

    #[error("Environment variable not found: {0}")]
    EnvVarMissing(String),
}
```

## 实现范围

### MVP (v0.1.0)

| 功能 | 命令 | 优先级 |
|------|------|--------|
| 查看状态 | `summctl status` | P0 |
| 启动consumer | `summctl start <name>` | P0 |
| 停止consumer | `summctl stop <name>` | P0 |
| 重启consumer | `summctl restart <name>` | P0 |
| 查看详情 | `summctl info <name>` | P0 |
| 查看日志 | `summctl logs <name>` | P1 |
| 查看拓扑 | `summctl topology` | P1 |

### 后续版本

| 功能 | 版本 |
|------|------|
| API模式 `summctl serve` | v0.2.0 |
| Web UI | v0.3.0 |
| 日志聚合 | v0.4.0 |
| 性能指标 | v0.5.0 |

## 项目结构

```
/data/dev/SUMM-Hub/
├── consumers.yaml              # 统一配置入口（新建）
├── summctl/                    # CLI工具（新建）
│   ├── Cargo.toml
│   ├── src/
│   │   ├── main.rs            # 入口，CLI/API模式切换
│   │   ├── cli.rs             # clap命令定义
│   │   ├── config.rs          # consumers.yaml解析
│   │   ├── docker.rs          # docker compose执行
│   │   ├── status.rs          # 状态检测
│   │   ├── topology.rs        # 拓扑生成
│   │   └── error.rs           # 错误类型
│   └── tests/
│       └── integration.rs
├── consumer/
│   ├── feishu-connector/
│   │   └── docker-compose.yml  # 保持不变
│   ├── claude-code-consumer/
│   │   └── deploy/docker-compose.yml
│   └── script-consumer/
│       └── docker-compose.yml
└── docs/
    └── summctl.md              # 使用文档
```

## API 设计（预留）

当启用 `api` feature 时：

```
GET  /api/consumers              # 列出所有consumer及状态
GET  /api/consumers/:name        # 获取单个consumer详情
POST /api/consumers/:name/start  # 启动
POST /api/consumers/:name/stop   # 停止
POST /api/consumers/:name/restart # 重启
GET  /api/consumers/:name/logs   # 日志流（SSE）
GET  /api/topology               # Subject拓扑
```

响应格式：
```json
{
  "name": "feishu-connector",
  "status": "running",
  "uptime": "2h",
  "subjects": {
    "subscribe": ["summ.ai.input"],
    "publish": ["summ.ai.output"]
  }
}
```
