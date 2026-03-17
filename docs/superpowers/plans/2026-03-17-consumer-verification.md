# Consumer 验证实现计划

## 目标

为 claude-code-consumer 添加 Vitest 单元测试和 Docker Compose 集成测试。

---

## 文件结构

```
consumer/claude-code-consumer/
├── test/
│   ├── hash.test.ts
│   ├── session.test.ts
│   ├── executor.test.ts
│   └── consumer.test.ts
├── test-integration/
│   ├── docker-compose.test.yml
│   └── test-runner.ts
├── vitest.config.ts
└── package.json (更新)
```

---

## 任务分解

### Task 1: 配置 Vitest

**目标**: 设置测试框架

**文件**:
- `vitest.config.ts`
- `package.json`

**步骤**:
- [ ] 添加 vitest 和 @vitest/coverage-v8 依赖
- [ ] 创建 vitest.config.ts
- [ ] 添加 npm test 脚本

**验证**:
```bash
cd consumer/claude-code-consumer && npm test
```

---

### Task 2: hash.test.ts

**目标**: 测试 FNV-1a 哈希和 Session 路由

**文件**: `test/hash.test.ts`

**步骤**:
- [ ] 测试 fnv1aHash 返回一致结果
- [ ] 测试 ownsSession 路由逻辑

**验证**:
```bash
npm test -- test/hash.test.ts
```

---

### Task 3: session.test.ts

**目标**: 测试 Session 管理器

**文件**: `test/session.test.ts`

**步骤**:
- [ ] 测试 create/get/delete/has
- [ ] 测试 TTL 过期清理（用 vi.useFakeTimers）

**验证**:
```bash
npm test -- test/session.test.ts
```

---

### Task 4: executor.test.ts

**目标**: 测试 Claude 子进程管理（Mock）

**文件**: `test/executor.test.ts`

**步骤**:
- [ ] Mock child_process.spawn
- [ ] 测试 start() 生成正确参数
- [ ] 测试 send() 写入 stdin
- [ ] 测试 stream() 解析 stdout

**验证**:
```bash
npm test -- test/executor.test.ts
```

---

### Task 5: consumer.test.ts

**目标**: 测试 NATS 消费者（Mock 连接）

**文件**: `test/consumer.test.ts`

**步骤**:
- [ ] Mock NATS 连接
- [ ] 测试消息解析
- [ ] 测试错误处理

**验证**:
```bash
npm test -- test/consumer.test.ts
```

---

### Task 6: 集成测试环境

**目标**: Docker Compose 测试环境

**文件**: `test-integration/docker-compose.test.yml`

**步骤**:
- [ ] 创建 docker-compose.test.yml（nats + consumer + tester）
- [ ] 创建 tester 服务脚本

**验证**:
```bash
docker compose -f test-integration/docker-compose.test.yml config
```

---

### Task 7: 集成测试运行器

**目标**: 测试脚本执行端到端验证

**文件**: `test-integration/test-runner.ts`

**步骤**:
- [ ] 连接 NATS
- [ ] 发送测试消息
- [ ] 验证响应

**验证**:
```bash
docker compose -f test-integration/docker-compose.test.yml up --abort-on-container-exit
```

---

## 依赖

| 包 | 用途 |
|----|------|
| vitest | 测试框架 |
| @vitest/coverage-v8 | 覆盖率 |

---

## 命令

```bash
npm test              # 单元测试
npm run test:coverage # 单元测试 + 覆盖率
npm run test:integration # 集成测试
```
