# Claude Code Consumer 验证方案设计

## 目标

为 `consumer/claude-code-consumer` 建立完整的测试体系，包括单元测试和集成测试，确保功能正确性和稳定性。

---

## 1. 单元测试

### 1.1 测试框架

使用 **Vitest**：
- 快速执行，ESM 原生支持
- TypeScript 开箱即用
- 兼容 Jest API

### 1.2 测试覆盖

| 模块 | 文件 | 测试内容 |
|------|------|----------|
| 哈希 | `test/hash.test.ts` | FNV-1a 算法正确性、Session 路由一致性 |
| Session | `test/session.test.ts` | 创建/获取/删除/存在检查/过期清理 |
| Executor | `test/executor.test.ts` | Mock 子进程，验证参数、stdin 写入、stdout 解析 |
| Consumer | `test/consumer.test.ts` | Mock NATS 连接，验证消息解析、路由分发、错误处理 |

### 1.3 Mock 策略

- **子进程**: 使用 `child_process` mock，模拟 stdout JSON 流
- **NATS**: 使用内存模拟或 nats 的内置测试工具
- **时间**: 使用 `vi.useFakeTimers()` 测试 Session 过期

---

## 2. 集成测试

### 2.1 架构

使用 Docker Compose 搭建隔离测试环境：

```
┌─────────────────────────────────────────────────┐
│              Docker Network                      │
│                                                  │
│  ┌─────────┐    ┌──────────┐    ┌────────────┐  │
│  │  NATS   │◄───│ Consumer │◄───│   Tester   │  │
│  │ :4222   │    │ (real)   │    │ (test run) │  │
│  └─────────┘    └──────────┘    └────────────┘  │
│                      │                          │
│                      ▼                          │
│              ┌──────────────┐                   │
│              │ Claude Code  │                   │
│              │ (子进程)      │                   │
│              └──────────────┘                   │
└─────────────────────────────────────────────────┘
```

### 2.2 组件定义

**docker-compose.test.yml:**

| 服务 | 镜像 | 用途 |
|------|------|------|
| `nats` | `nats:2.10-alpine` | 消息队列 |
| `consumer` | `node:20-alpine` | 运行 claude-code-consumer |
| `tester` | `node:20-alpine` | 执行测试脚本 |

### 2.3 测试场景

| 场景 | 描述 | 验证点 |
|------|------|--------|
| 基础消息 | 发送单条消息，获取响应 | 响应格式正确、session_id 一致 |
| 连续对话 | 同一 session 发送多条消息 | 上下文保持、响应连贯 |
| 错误处理 | 发送无效 JSON | 返回 error 类型消息 |
| Session 路由 | 多 Consumer 实例 | 消息路由到正确实例 |

### 2.4 测试流程

```bash
# 1. 构建并启动环境
docker compose -f docker-compose.test.yml up -d

# 2. 等待服务就绪
# 3. Tester 执行测试脚本
# 4. 收集结果
# 5. 清理环境
docker compose -f docker-compose.test.yml down -v
```

---

## 3. 文件结构

```
consumer/claude-code-consumer/
├── src/                          # 源代码（已有）
├── test/                         # 单元测试
│   ├── hash.test.ts
│   ├── session.test.ts
│   ├── executor.test.ts
│   └── consumer.test.ts
├── test-integration/             # 集成测试
│   ├── docker-compose.test.yml
│   ├── Dockerfile.tester
│   ├── test-runner.ts
│   └── scenarios/
│       ├── basic-message.ts
│       └── continuous-chat.ts
├── vitest.config.ts
├── package.json                  # 添加 test 脚本
└── README.md                     # 更新测试说明
```

---

## 4. 命令

```bash
# 单元测试
npm test

# 单元测试（监视模式）
npm run test:watch

# 集成测试
npm run test:integration

# 全部测试
npm run test:all
```

---

## 5. 依赖

| 包 | 用途 |
|----|------|
| `vitest` | 测试框架 |
| `@vitest/coverage-v8` | 覆盖率报告 |

---

## 6. 成功标准

1. 单元测试覆盖率 > 80%
2. 集成测试所有场景通过
3. CI/CD 可自动运行单元测试
4. 集成测试可本地一键执行
