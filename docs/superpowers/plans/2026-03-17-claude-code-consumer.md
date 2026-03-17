# Claude Code Consumer 实现计划

## 目标

实现一个 TypeScript Consumer，订阅 NATS 消息，调用 Claude Code 执行任务，流式输出结果。

---

## 文件结构

```
examples/typescript-consumer/
├── src/
│   ├── index.ts          # 入口：启动 Consumer
│   ├── consumer.ts       # NATS 订阅、消息路由
│   ├── executor.ts       # Claude 子进程管理
│   ├── session.ts        # Session 映射管理
│   └── utils/
│       ├── hash.ts       # FNV-1a 哈希（Session 路由）
│       └── types.ts      # 类型定义
├── package.json
├── tsconfig.json
└── README.md
```

---

## 任务分解

### Task 1: 项目初始化

**目标**: 创建项目骨架和基础配置

**文件**:
- `examples/typescript-consumer/package.json`
- `examples/typescript-consumer/tsconfig.json`

**步骤**:
- [ ] 创建 `package.json`，添加依赖 `nats`, `typescript`, `@types/node`
- [ ] 创建 `tsconfig.json`，配置 ES2022 + Node
- [ ] 运行 `npm install`

**验证**:
```bash
cd examples/typescript-consumer && npm install && npx tsc --noEmit
```

---

### Task 2: 类型定义

**目标**: 定义核心类型

**文件**: `src/utils/types.ts`

**步骤**:
- [ ] 定义 `InputMessage` 接口（来自 NATS 的消息）
- [ ] 定义 `OutputMessage` 接口（输出到 NATS 的消息）
- [ ] 定义 `Session` 接口
- [ ] 定义 `SDKMessage` 类型（Claude 输出格式）

**验证**:
```bash
npx tsc --noEmit
```

---

### Task 3: FNV-1a 哈希

**目标**: 实现 Session 路由的哈希算法

**文件**: `src/utils/hash.ts`

**步骤**:
- [ ] 实现 `fnv1aHash(str: string): number`
- [ ] 实现 `ownsSession(sessionId: string, consumerId: number, total: number): boolean`

**验证**:
```bash
npx tsc --noEmit
```

---

### Task 4: Claude Executor

**目标**: 封装 Claude 子进程管理

**文件**: `src/executor.ts`

**步骤**:
- [ ] 实现 `ClaudeExecutor` 类
- [ ] `start(cwd, resume?)`: spawn Claude 子进程
- [ ] `send(message)`: 发送消息到 stdin
- [ ] `stream()`: 返回 AsyncIterable<SDKMessage>
- [ ] `kill()`: 终止子进程

**验证**:
```bash
npx tsc --noEmit
```

---

### Task 5: Session Manager

**目标**: 管理 Session 映射和生命周期

**文件**: `src/session.ts`

**步骤**:
- [ ] 实现 `SessionManager` 类
- [ ] `create(sessionId, firstMsg)`: 创建新 Session
- [ ] `get(sessionId)`: 获取已存在 Session
- [ ] `delete(sessionId)`: 删除 Session
- [ ] `cleanup()`: 清理过期 Session

**验证**:
```bash
npx tsc --noEmit
```

---

### Task 6: NATS Consumer

**目标**: 实现 NATS 订阅和消息处理

**文件**: `src/consumer.ts`

**步骤**:
- [ ] 实现 `ClaudeConsumer` 类
- [ ] `connect()`: 连接 NATS
- [ ] `subscribe()`: 订阅 `summ.ai.input`
- [ ] `handleMessage(msg)`: 处理消息逻辑
- [ ] `publishOutput(sessionId, content)`: 发布响应
- [ ] `publishError(sessionId, code, message)`: 发布错误

**验证**:
```bash
npx tsc --noEmit
```

---

### Task 7: 入口文件

**目标**: 启动 Consumer

**文件**: `src/index.ts`

**步骤**:
- [ ] 读取环境变量配置
- [ ] 创建 Consumer 实例
- [ ] 启动订阅循环
- [ ] 处理优雅退出（SIGINT/SIGTERM）

**验证**:
```bash
npx tsc --noEmit
```

---

### Task 8: 集成测试

**目标**: 验证端到端流程

**步骤**:
- [ ] 启动本地 NATS Server
- [ ] 启动 Consumer
- [ ] 发布测试消息到 `summ.ai.input`
- [ ] 验证 `summ.ai.output` 收到响应
- [ ] 验证连续对话正常工作

**验证**:
```bash
# 终端 1: 启动 NATS
nats-server -js

# 终端 2: 启动 Consumer
cd examples/typescript-consumer && npm run dev

# 终端 3: 发布测试消息
nats pub summ.ai.input '{"content": "hello"}'
```

---

## 依赖

| 包 | 用途 |
|----|------|
| `nats` | NATS 客户端 |
| `typescript` | 编译 |
| `@types/node` | Node 类型 |

---

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `NATS_URL` | `nats://localhost:4222` | NATS 地址 |
| `CONSUMER_ID` | `0` | 实例 ID |
| `CONSUMER_TOTAL` | `1` | 总实例数 |
| `SESSION_TTL_MS` | `3600000` | Session 过期时间 (1h) |

---

## 启动命令

```bash
# 开发模式
npm run dev

# 生产模式
npm run build && npm start
```
