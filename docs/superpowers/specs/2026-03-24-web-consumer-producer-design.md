# Web Consumer/Producer 设计文档

**日期**: 2026-03-24
**状态**: Draft
**作者**: Claude

---

## 概述

为 SUMM-Hub 添加 Web 聊天界面，让终端用户通过浏览器与 AI Consumer（如 claude-code-consumer）交互。

## 目标

- 提供用户友好的聊天界面
- 实时接收 Consumer 的响应
- 管理多个会话
- 保持 MVP 范围，后续可扩展

## 非目标

- 完整复制 hapi 的所有功能（附件上传、权限审批、diff 渲染等）
- 用户认证（MVP 阶段）
- 多租户支持

---

## 整体架构

```
┌─────────────┐      SSE       ┌─────────────┐     NATS      ┌──────────────────────┐
│   Frontend  │ ◄────────────► │   Backend   │ ◄────────────►│  SUMM-Hub (NATS)     │
│  (Vite)     │   HTTP/REST    │   (Hono)    │               │                      │
│             │                │             │               │  summ.ai.input       │
│  - 聊天UI   │                │  - REST API │               │  summ.ai.output      │
│  - Session  │                │  - SSE推送  │               │                      │
│  - API客户端│                │  - 会话存储 │               └──────────┬───────────┘
└─────────────┘                └─────────────┘                          │
                                        │                               │
                                        │        ┌──────────────────────┘
                                        │        │
                                        │        ▼
                                        │   ┌──────────────────────┐
                                        └──►│  claude-code-consumer│
                                            │  (或其他 Consumer)    │
                                            └──────────────────────┘
```

### Backend 角色

1. **Producer**: 前端发消息 → Backend → NATS `summ.ai.input`
2. **订阅者**: 订阅 `summ.ai.output`，通过 SSE 推送给前端
3. **会话存储**: 维护 session 列表（内存或简单持久化）

### Frontend 角色

1. 聊天界面：输入框 + 消息流
2. Session 列表：显示历史会话
3. SSE 客户端：实时接收消息

---

## 目录结构

```
SUMM-Hub/
├── web/
│   ├── backend/
│   │   ├── src/
│   │   │   ├── index.ts              # 入口，启动 Hono 服务
│   │   │   ├── routes/
│   │   │   │   ├── sessions.ts       # Session 管理 API
│   │   │   │   ├── messages.ts       # 消息发送 API
│   │   │   │   └── events.ts         # SSE 实时推送
│   │   │   ├── services/
│   │   │   │   ├── nats.ts           # NATS 连接与发布
│   │   │   │   └── sessionStore.ts   # Session 存储（内存 Map）
│   │   │   └── types.ts              # 类型定义
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── frontend/
│   │   ├── src/
│   │   │   ├── main.tsx
│   │   │   ├── App.tsx               # 路由 + 布局
│   │   │   ├── api/
│   │   │   │   └── client.ts         # HTTP + SSE 客户端
│   │   │   ├── hooks/
│   │   │   │   ├── useSSE.ts         # SSE 连接管理
│   │   │   │   └── useSession.ts     # Session 状态
│   │   │   ├── components/
│   │   │   │   ├── SessionList.tsx   # 左侧会话列表
│   │   │   │   ├── ChatView.tsx      # 右侧聊天区域
│   │   │   │   ├── MessageList.tsx   # 消息流
│   │   │   │   ├── MessageItem.tsx   # 单条消息
│   │   │   │   └── ChatInput.tsx     # 输入框 + 发送按钮
│   │   │   ├── types.ts
│   │   │   └── index.css             # Tailwind
│   │   ├── package.json
│   │   └── vite.config.ts
│   │
│   └── docker-compose.yml            # 本地开发
```

---

## API 设计

### REST API

| 方法 | 路径 | 说明 | 请求体 | 响应 |
|------|------|------|--------|------|
| GET | `/api/sessions` | 获取 session 列表 | - | `{ sessions: Session[] }` |
| POST | `/api/sessions` | 创建新 session | - | `{ session: Session }` |
| GET | `/api/sessions/:id/messages` | 获取历史消息 | - | `{ messages: Message[] }` |
| POST | `/api/sessions/:id/messages` | 发送消息 | `{ text: string }` | `{ ok: true }` |
| GET | `/api/events` | SSE 连接 | - | SSE stream |

### SSE 事件格式

```typescript
type SSEEvent =
  | { type: 'message'; data: Message }
  | { type: 'session-created'; data: Session }
  | { type: 'heartbeat'; data: { timestamp: number } }
```

### 消息流

```
前端 POST /api/sessions/:id/messages
        │
        ▼
Backend 发布到 NATS "summ.ai.input"
        │
        ▼
Consumer 处理，发布到 "summ.ai.output"
        │
        ▼
Backend 订阅 "summ.ai.output"（按 session 过滤）
        │
        ▼
SSE 推送给前端
```

---

## 数据类型

```typescript
// Session
interface Session {
  id: string           // sess_xxx
  createdAt: number    // timestamp
  updatedAt: number    // timestamp
}

// 消息
interface Message {
  id: string
  sessionId: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

// 发送消息请求
interface SendMessageRequest {
  text: string
}

// API 响应
interface SessionsResponse {
  sessions: Session[]
}

interface MessagesResponse {
  messages: Message[]
}
```

---

## 前端页面布局

```
┌─────────────────────────────────────────────────┐
│  SUMM Chat                              [+ New] │
├──────────────┬──────────────────────────────────┤
│              │                                  │
│  Sessions    │     ChatView                     │
│              │                                  │
│  ┌────────┐  │  ┌────────────────────────────┐  │
│  │ sess_1 │  │  │ AI: 你好，有什么可以帮助的？ │  │
│  └────────┘  │  │ User: 帮我写个函数          │  │
│  ┌────────┐  │  │ AI: 好的，这个函数...       │  │
│  │ sess_2 │  │  └────────────────────────────┘  │
│  └────────┘  │                                  │
│              │  ┌────────────────────────────┐  │
│              │  │ 输入消息...          [发送] │  │
│              │  └────────────────────────────┘  │
│              │                                  │
└──────────────┴──────────────────────────────────┘
```

### 组件职责

| 组件 | 职责 |
|------|------|
| `SessionList` | 显示会话列表，点击切换当前会话 |
| `ChatView` | 组合 MessageList + ChatInput |
| `MessageList` | 渲染消息流，自动滚动到底部 |
| `MessageItem` | 区分用户/AI 消息样式 |
| `ChatInput` | 输入框，Enter 或按钮发送 |

---

## 状态管理

使用纯 React State（无需 Redux/Zustand）：

```typescript
// App.tsx 顶层状态

const [sessions, setSessions] = useState<Session[]>([])
const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
const [messages, setMessages] = useState<Map<string, Message[]>>(new Map())

// SSE 收到消息时
const handleSSEEvent = (event: SSEEvent) => {
  if (event.type === 'message') {
    setMessages(prev => {
      const sessionMessages = prev.get(event.data.sessionId) || []
      return new Map(prev).set(event.data.sessionId, [...sessionMessages, event.data])
    })
  }
}
```

---

## 交互流程

### 1. 用户打开页面

```
GET /api/sessions → 显示会话列表
GET /api/events (SSE) → 建立实时连接
```

### 2. 用户点击 "New Session"

```
POST /api/sessions → 创建新会话
SSE 推送 session-created 事件
切换到新会话
```

### 3. 用户发送消息

```
POST /api/sessions/:id/messages
Backend 发布到 NATS summ.ai.input
本地立即显示用户消息（乐观更新）
```

### 4. Consumer 处理完成

```
Consumer 发布到 summ.ai.output
Backend 接收，SSE 推送给前端
前端追加 AI 消息到列表
```

---

## 配置与部署

### 环境变量

```bash
# Backend
NATS_URL=nats://nats:4222
PORT=3000
FRONTEND_URL=http://localhost:5173   # CORS

# Frontend
VITE_API_URL=http://localhost:3000
```

### 本地开发

```bash
# 1. 启动 NATS（项目根目录）
docker compose up -d

# 2. 启动 Backend
cd web/backend && npm run dev

# 3. 启动 Frontend
cd web/frontend && npm run dev
```

### Docker Compose

```yaml
# web/docker-compose.yml
services:
  backend:
    build: ./backend
    ports:
      - "3000:3000"
    environment:
      - NATS_URL=nats://host.docker.internal:4222
    extra_hosts:
      - "host.docker.internal:host-gateway"

  frontend:
    build: ./frontend
    ports:
      - "80:80"
    depends_on:
      - backend
```

---

## 技术栈

### Backend
- **Runtime**: Node.js
- **Framework**: Hono
- **NATS Client**: nats.ws 或 nats
- **语言**: TypeScript

### Frontend
- **Build Tool**: Vite
- **Framework**: React
- **Styling**: Tailwind CSS
- **语言**: TypeScript

---

## MVP 范围确认

### 包含
- ✅ 发送/接收消息
- ✅ Session 列表
- ✅ 实时 SSE 推送
- ✅ 基础聊天 UI

### 不包含（后续迭代）
- ❌ 用户认证
- ❌ 附件上传
- ❌ Markdown 渲染
- ❌ 代码高亮
- ❌ Diff 视图
- ❌ 权限审批

---

## 参考

- hapi 项目: `/data/github/hapi/`
  - `web/src/` - 前端实现
  - `hub/src/web/` - 后端实现
- SUMM-Hub 协议: `docs/protocol.md`
