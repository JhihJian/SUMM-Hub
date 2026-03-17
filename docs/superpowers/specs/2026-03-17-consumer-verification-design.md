# Claude Code Consumer 验证方案

## 一句话概括

用 Vitest 单元测试 + Docker Compose 集成测试，验证 Consumer 的消息处理流程。

## 流程图

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  单元测试    │     │  集成测试    │     │   CI/CD     │
│  (Vitest)   │     │ (Docker)    │     │  (自动化)   │
├─────────────┤     ├─────────────┤     ├─────────────┤
│ hash.test   │     │ NATS        │     │ npm test    │
│ session.test│     │ Consumer    │     │             │
│ executor.test│    │ Tester      │     │             │
│ consumer.test│    │ Claude Code │     │             │
└─────────────┘     └─────────────┘     └─────────────┘
      ▲                   │                   │
      └───────────────────┴───────────────────┘
               快速反馈 ← 完整验证 → 自动化
```

## 三个问题

| 问题 | 方案 |
|------|------|
| **如何测试子进程？** | Mock `child_process`，模拟 stdout JSON 流 |
| **如何测试 NATS？** | 集成测试用真实 NATS，单元测试 mock 连接 |
| **如何运行集成测试？** | `docker compose -f docker-compose.test.yml up` |

## 核心代码

```typescript
// test/session.test.ts - 单元测试示例
describe('SessionManager', () => {
  it('should create and get session', () => {
    const sm = new SessionManager();
    sm.create('sess-1', '/tmp');
    expect(sm.get('sess-1')?.id).toBe('sess-1');
  });

  it('should cleanup expired sessions', () => {
    const sm = new SessionManager(100); // 100ms TTL
    sm.create('sess-1', '/tmp');
    vi.useFakeTimers();
    vi.advanceTimersByTime(200);
    sm.cleanup();
    expect(sm.has('sess-1')).toBe(false);
  });
});
```
