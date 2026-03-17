# Claude Code Consumer 设计

## 一句话概括

订阅 NATS 消息 → spawn Claude 子进程 → 流式输出结果

## 架构图

```
NATS (summ.ai.input)
       │
       ▼
┌─────────────────┐
│   Consumer      │ ── ownsSession? ── NAK
│  (TypeScript)   │
└────────┬────────┘
         │
         ▼ spawn
┌─────────────────┐      流式输出      ┌─────────────────┐
│  Claude 子进程   │ ─────────────────► │ NATS (output)   │
│  --output-format│                    │                 │
│  stream-json    │                    └─────────────────┘
└─────────────────┘
```

## 三个核心问题

| 问题 | 方案 |
|------|------|
| **如何调用 Claude？** | `spawn('claude', ['--output-format', 'stream-json'])` |
| **如何连续对话？** | 保持子进程，用 `stdin.write()` 发送后续消息 |
| **Session 怎么映射？** | 首次从 `system.init` 提取 session_id，后续用 `--resume` |

## 一个关键代码片段

```typescript
// spawn Claude，保持子进程
const child = spawn('claude', ['--output-format', 'stream-json', '--resume', sessionId])

// 发送消息
child.stdin.write(JSON.stringify({ type: 'user_message', content: prompt }) + '\n')

// 流式读取
for await (const line of createInterface(child.stdout)) {
  yield JSON.parse(line)  // 逐条返回给 Consumer
}
```

## 目录结构

```
examples/typescript-consumer/
├── src/index.ts      # 入口 + NATS 订阅
├── src/executor.ts   # Claude 子进程管理
└── src/session.ts    # Session 映射表
```

---

需要我展开哪个部分？
