# Implementation Plan: Web Consumer/Producer

**Source Spec**: `docs/superpowers/specs/2026-03-24-web-consumer-producer-design.md`
**Created**: 2026-03-24

---

## Scope

This plan implements a web chat interface for SUMM-Hub with:
- Backend (Hono): REST API + SSE real-time push + NATS integration
- Frontend (Vite + React): Chat UI with session management

**MVP Scope**:
- Send/receive messages
- Session list
- Real-time SSE push
- Basic chat UI

**Out of Scope**: Auth, file upload, markdown rendering, code highlighting

---

## File Structure

```
web/
├── backend/
│   ├── src/
│   │   ├── index.ts              # Entry point, Hono app
│   │   ├── routes/
│   │   │   ├── sessions.ts       # Session CRUD
│   │   │   ├── messages.ts       # Message sending
│   │   │   └── events.ts         # SSE endpoint
│   │   ├── services/
│   │   │   ├── nats.ts           # NATS connection + subscriptions
│   │   │   └── sessionStore.ts   # In-memory session storage
│   │   └── types.ts              # TypeScript types
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/
│   ├── src/
│   │   ├── main.tsx              # React entry
│   │   ├── App.tsx               # Root component
│   │   ├── api/
│   │   │   └── client.ts         # HTTP + SSE client
│   │   ├── hooks/
│   │   │   ├── useSSE.ts         # SSE connection management
│   │   │   └── useSessions.ts    # Session state
│   │   ├── components/
│   │   │   ├── SessionList.tsx   # Left sidebar
│   │   │   ├── ChatView.tsx      # Right chat area
│   │   │   ├── MessageList.tsx   # Message stream
│   │   │   ├── MessageItem.tsx   # Single message
│   │   │   └── ChatInput.tsx     # Input + send button
│   │   ├── types.ts
│   │   └── index.css             # Tailwind styles
│   ├── package.json
│   ├── vite.config.ts
│   └── tailwind.config.js
│
└── docker-compose.yml            # Local dev orchestration
```

---

## Task Breakdown

### Task 1: Backend Project Setup

**Description**: Initialize backend TypeScript project with Hono framework

**Files**:
- `web/backend/package.json` (create)
- `web/backend/tsconfig.json` (create)
- `web/backend/src/index.ts` (create)
- `web/backend/src/types.ts` (create)

**Tests**: N/A (setup task)

**Steps**:
- [ ] Create `web/backend/` directory
- [ ] Create `package.json` with dependencies: hono, nats, typescript, @types/node, tsx
- [ ] Create `tsconfig.json` targeting ES2022, Node module resolution
- [ ] Create `src/types.ts` with Session, Message, SSEEvent interfaces
- [ ] Create `src/index.ts` with basic Hono app skeleton (GET /health)
- [ ] Run `npm install` in backend directory
- [ ] Run `npx tsx src/index.ts` and verify /health returns 200

**Verification**:
```bash
cd web/backend && npm install && npx tsx src/index.ts &
curl http://localhost:3000/health
# Expected: {"status":"ok"}
```

---

### Task 2: Session Store Service

**Description**: Implement in-memory session storage with TTL cleanup

**Files**:
- `web/backend/src/services/sessionStore.ts` (create)
- `web/backend/src/services/sessionStore.test.ts` (create)

**Tests**:
```typescript
// sessionStore.test.ts
describe('SessionStore', () => {
  it('creates and retrieves session', () => {
    const store = new SessionStore()
    const session = store.create()
    expect(store.get(session.id)).toEqual(session)
  })

  it('lists all sessions sorted by updatedAt', () => {
    const store = new SessionStore()
    const s1 = store.create()
    const s2 = store.create()
    expect(store.list()[0].id).toBe(s2.id) // newest first
  })

  it('updates session timestamp', () => {
    const store = new SessionStore()
    const session = store.create()
    const oldUpdatedAt = session.updatedAt
    store.touch(session.id)
    expect(store.get(session.id)!.updatedAt).toBeGreaterThan(oldUpdatedAt)
  })

  it('stores messages per session', () => {
    const store = new SessionStore()
    const session = store.create()
    store.addMessage(session.id, { id: '1', role: 'user', content: 'hi' })
    expect(store.getMessages(session.id)).toHaveLength(1)
  })
})
```

**Steps**:
- [ ] Write failing tests in `sessionStore.test.ts`
- [ ] Run `npx vitest run` - verify tests fail
- [ ] Implement `SessionStore` class with:
  - `create()`: generate sess_xxx ID, return Session
  - `get(id)`: return Session or null
  - `list()`: return all sessions sorted by updatedAt desc
  - `touch(id)`: update updatedAt timestamp
  - `addMessage(sessionId, message)`: append message to session
  - `getMessages(sessionId)`: return messages for session
- [ ] Run tests - verify all pass
- [ ] Commit: `feat(web): add session store service`

**Verification**:
```bash
cd web/backend && npx vitest run src/services/sessionStore.test.ts
# Expected: all tests pass
```

---

### Task 3: NATS Service

**Description**: Implement NATS connection, publishing, and subscription

**Files**:
- `web/backend/src/services/nats.ts` (create)
- `web/backend/src/services/nats.test.ts` (create)

**Tests**:
```typescript
// nats.test.ts - integration test with local NATS
describe('NatsService', () => {
  it('connects to NATS server', async () => {
    const service = new NatsService({ url: 'nats://localhost:4222' })
    await service.connect()
    expect(service.isConnected()).toBe(true)
    await service.disconnect()
  })

  it('publishes input message', async () => {
    const service = new NatsService({ url: 'nats://localhost:4222' })
    await service.connect()
    await service.publishInput('sess_123', 'Hello world')
    // No throw = success
    await service.disconnect()
  })
})
```

**Steps**:
- [ ] Write failing tests in `nats.test.ts`
- [ ] Run `npx vitest run` - verify tests fail
- [ ] Implement `NatsService` class with:
  - `connect()`: establish NATS connection
  - `disconnect()`: close connection
  - `isConnected()`: check connection status
  - `publishInput(sessionId, content)`: publish to summ.ai.input
  - `subscribe(callback)`: subscribe to summ.ai.output and summ.ai.error
- [ ] Run tests - verify all pass
- [ ] Commit: `feat(web): add NATS service`

**Verification**:
```bash
# Start NATS first
docker compose up -d nats
cd web/backend && npx vitest run src/services/nats.test.ts
# Expected: all tests pass
```

---

### Task 4: Sessions API Route

**Description**: Implement session CRUD endpoints

**Files**:
- `web/backend/src/routes/sessions.ts` (create)
- `web/backend/src/routes/sessions.test.ts` (create)

**Tests**:
```typescript
// sessions.test.ts
describe('Sessions API', () => {
  it('GET /api/sessions returns empty array initially', async () => {
    const res = await app.request('/api/sessions')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ sessions: [] })
  })

  it('POST /api/sessions creates new session', async () => {
    const res = await app.request('/api/sessions', { method: 'POST' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.session.id).toMatch(/^sess_/)
  })

  it('GET /api/sessions/:id/messages returns messages', async () => {
    // Create session first
    const createRes = await app.request('/api/sessions', { method: 'POST' })
    const { session } = await createRes.json()

    const res = await app.request(`/api/sessions/${session.id}/messages`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ messages: [] })
  })

  it('GET /api/sessions/:id/messages returns 404 for unknown session', async () => {
    const res = await app.request('/api/sessions/unknown/messages')
    expect(res.status).toBe(404)
  })
})
```

**Steps**:
- [ ] Write failing tests in `sessions.test.ts`
- [ ] Run `npx vitest run` - verify tests fail
- [ ] Implement routes:
  - `GET /api/sessions`: list all sessions
  - `POST /api/sessions`: create new session
  - `GET /api/sessions/:id/messages`: get messages for session
- [ ] Run tests - verify all pass
- [ ] Commit: `feat(web): add sessions API routes`

**Verification**:
```bash
cd web/backend && npx vitest run src/routes/sessions.test.ts
# Expected: all tests pass
```

---

### Task 5: Messages API Route

**Description**: Implement message sending endpoint

**Files**:
- `web/backend/src/routes/messages.ts` (create)
- `web/backend/src/routes/messages.test.ts` (create)

**Tests**:
```typescript
// messages.test.ts
describe('Messages API', () => {
  it('POST /api/sessions/:id/messages sends message', async () => {
    // Create session
    const createRes = await app.request('/api/sessions', { method: 'POST' })
    const { session } = await createRes.json()

    const res = await app.request(`/api/sessions/${session.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Hello' })
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('POST /api/sessions/:id/messages returns 400 without content', async () => {
    const createRes = await app.request('/api/sessions', { method: 'POST' })
    const { session } = await createRes.json()

    const res = await app.request(`/api/sessions/${session.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    })
    expect(res.status).toBe(400)
  })

  it('POST /api/sessions/:id/messages returns 404 for unknown session', async () => {
    const res = await app.request('/api/sessions/unknown/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'test' })
    })
    expect(res.status).toBe(404)
  })
})
```

**Steps**:
- [ ] Write failing tests in `messages.test.ts`
- [ ] Run `npx vitest run` - verify tests fail
- [ ] Implement `POST /api/sessions/:id/messages`:
  - Validate body has `content` field
  - Add user message to session store
  - Publish to NATS summ.ai.input
  - Return `{ ok: true }`
- [ ] Run tests - verify all pass
- [ ] Commit: `feat(web): add messages API route`

**Verification**:
```bash
cd web/backend && npx vitest run src/routes/messages.test.ts
# Expected: all tests pass
```

---

### Task 6: SSE Events Route

**Description**: Implement Server-Sent Events endpoint for real-time push

**Files**:
- `web/backend/src/routes/events.ts` (create)
- `web/backend/src/routes/events.test.ts` (create)

**Tests**:
```typescript
// events.test.ts
describe('Events SSE', () => {
  it('GET /api/events returns SSE stream', async () => {
    const res = await app.request('/api/events')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/event-stream')
  })

  it('sends connection-changed event on connect', async () => {
    const res = await app.request('/api/events')
    const reader = res.body?.getReader()
    const { value } = await reader!.read()
    const text = new TextDecoder().decode(value)
    expect(text).toContain('connection-changed')
  })

  it('sends heartbeat every 30 seconds', async () => {
    // This is more of an integration test - skip in unit tests
    // or mock timers
  })
})
```

**Steps**:
- [ ] Write failing tests in `events.test.ts`
- [ ] Run `npx vitest run` - verify tests fail
- [ ] Implement `GET /api/events` using Hono's `streamSSE`:
  - Track active SSE connections by session
  - Subscribe to NATS summ.ai.output and summ.ai.error
  - Filter messages by session with active connections
  - Push message events to connected clients
  - Send heartbeat every 30 seconds
  - Clean up on disconnect
- [ ] Run tests - verify all pass
- [ ] Commit: `feat(web): add SSE events route`

**Verification**:
```bash
cd web/backend && npx vitest run src/routes/events.test.ts
# Expected: all tests pass
```

---

### Task 7: Backend Integration

**Description**: Wire all routes together in main entry point

**Files**:
- `web/backend/src/index.ts` (modify)

**Tests**: Manual integration test

**Steps**:
- [ ] Import all route modules
- [ ] Create Hono app with routes under `/api`
- [ ] Initialize NATS service on startup
- [ ] Pass NATS service to routes that need it
- [ ] Add CORS middleware for frontend origin
- [ ] Add graceful shutdown handler
- [ ] Test full flow manually:
  1. Start NATS
  2. Start backend
  3. Create session via curl
  4. Connect SSE via curl
  5. Send message via curl
  6. Verify SSE receives message
- [ ] Commit: `feat(web): integrate backend routes`

**Verification**:
```bash
# Terminal 1: Start NATS
docker compose up -d nats

# Terminal 2: Start backend
cd web/backend && npx tsx src/index.ts

# Terminal 3: Test
curl http://localhost:3000/api/sessions -X POST
# {"session":{"id":"sess_xxx",...}}

curl -N http://localhost:3000/api/events
# data: {"type":"connection-changed",...}

# Terminal 4: Send message (use session ID from above)
curl http://localhost:3000/api/sessions/sess_xxx/messages \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"content":"hello"}'
# {"ok":true}
```

---

### Task 8: Frontend Project Setup

**Description**: Initialize Vite + React + Tailwind frontend project

**Files**:
- `web/frontend/package.json` (create)
- `web/frontend/vite.config.ts` (create)
- `web/frontend/tailwind.config.js` (create)
- `web/frontend/postcss.config.js` (create)
- `web/frontend/tsconfig.json` (create)
- `web/frontend/index.html` (create)
- `web/frontend/src/main.tsx` (create)
- `web/frontend/src/index.css` (create)

**Tests**: N/A (setup task)

**Steps**:
- [ ] Create `web/frontend/` directory
- [ ] Create `package.json` with dependencies: react, react-dom, vite, tailwindcss, typescript
- [ ] Create `vite.config.ts` with proxy to backend
- [ ] Create `tailwind.config.js` with content paths
- [ ] Create `tsconfig.json` for React
- [ ] Create `index.html` entry point
- [ ] Create `src/main.tsx` rendering App
- [ ] Create `src/index.css` with Tailwind directives
- [ ] Run `npm install`
- [ ] Run `npm run dev` and verify blank page loads
- [ ] Commit: `feat(web): initialize frontend project`

**Verification**:
```bash
cd web/frontend && npm install && npm run dev &
curl http://localhost:5173
# Expected: HTML with React root
```

---

### Task 9: Frontend Types and API Client

**Description**: Create TypeScript types and HTTP/SSE client

**Files**:
- `web/frontend/src/types.ts` (create)
- `web/frontend/src/api/client.ts` (create)

**Tests**:
```typescript
// client.test.ts
describe('ApiClient', () => {
  it('getSessions returns sessions array', async () => {
    const client = new ApiClient('http://localhost:3000')
    const { sessions } = await client.getSessions()
    expect(Array.isArray(sessions)).toBe(true)
  })

  it('createSession returns new session', async () => {
    const client = new ApiClient('http://localhost:3000')
    const { session } = await client.createSession()
    expect(session.id).toMatch(/^sess_/)
  })
})
```

**Steps**:
- [ ] Create `types.ts` with Session, Message, SSEEvent interfaces
- [ ] Write failing tests in `client.test.ts`
- [ ] Implement `ApiClient` class:
  - `getSessions()`: GET /api/sessions
  - `createSession()`: POST /api/sessions
  - `getMessages(sessionId)`: GET /api/sessions/:id/messages
  - `sendMessage(sessionId, content)`: POST /api/sessions/:id/messages
- [ ] Run tests - verify all pass
- [ ] Commit: `feat(web): add frontend API client`

**Verification**:
```bash
# Start backend first
cd web/backend && npx tsx src/index.ts &

cd web/frontend && npx vitest run src/api/client.test.ts
# Expected: all tests pass
```

---

### Task 10: useSSE Hook

**Description**: Implement SSE connection management hook

**Files**:
- `web/frontend/src/hooks/useSSE.ts` (create)
- `web/frontend/src/hooks/useSSE.test.ts` (create)

**Tests**:
```typescript
// useSSE.test.ts - using @testing-library/react-hooks
describe('useSSE', () => {
  it('connects to SSE endpoint', async () => {
    const { result } = renderHook(() => useSSE({
      baseUrl: 'http://localhost:3000',
      onEvent: vi.fn()
    }))
    await waitFor(() => expect(result.current.connected).toBe(true))
  })

  it('calls onEvent for received events', async () => {
    const onEvent = vi.fn()
    renderHook(() => useSSE({
      baseUrl: 'http://localhost:3000',
      onEvent
    }))
    // Trigger event from backend...
    await waitFor(() => expect(onEvent).toHaveBeenCalled())
  })
})
```

**Steps**:
- [ ] Write failing tests in `useSSE.test.ts`
- [ ] Implement `useSSE` hook:
  - Create EventSource connection
  - Parse JSON events
  - Call `onEvent` callback
  - Handle heartbeat watchdog (90s timeout)
  - Auto-reconnect on disconnect with exponential backoff
  - Return `{ connected, disconnect }`
- [ ] Run tests - verify all pass
- [ ] Commit: `feat(web): add useSSE hook`

**Verification**:
```bash
cd web/frontend && npx vitest run src/hooks/useSSE.test.ts
# Expected: all tests pass
```

---

### Task 11: useSessions Hook

**Description**: Implement session state management hook

**Files**:
- `web/frontend/src/hooks/useSessions.ts` (create)
- `web/frontend/src/hooks/useSessions.test.ts` (create)

**Tests**:
```typescript
// useSessions.test.ts
describe('useSessions', () => {
  it('loads sessions on mount', async () => {
    const { result } = renderHook(() => useSessions())
    await waitFor(() => expect(result.current.sessions.length).toBeGreaterThan(0))
  })

  it('creates new session', async () => {
    const { result } = renderHook(() => useSessions())
    await result.current.createSession()
    await waitFor(() => expect(result.current.sessions.length).toBe(1))
  })

  it('selects session', async () => {
    const { result } = renderHook(() => useSessions())
    await result.current.createSession()
    result.current.selectSession(result.current.sessions[0].id)
    expect(result.current.currentSessionId).toBe(result.current.sessions[0].id)
  })
})
```

**Steps**:
- [ ] Write failing tests in `useSessions.test.ts`
- [ ] Implement `useSessions` hook:
  - `sessions`: array of Session
  - `currentSessionId`: selected session ID
  - `messages`: Map<sessionId, Message[]>
  - `createSession()`: create and select new session
  - `selectSession(id)`: set current session
  - `sendMessage(content)`: send message to current session
  - Handle SSE events to append incoming messages
- [ ] Run tests - verify all pass
- [ ] Commit: `feat(web): add useSessions hook`

**Verification**:
```bash
cd web/frontend && npx vitest run src/hooks/useSessions.test.ts
# Expected: all tests pass
```

---

### Task 12: SessionList Component

**Description**: Implement left sidebar with session list

**Files**:
- `web/frontend/src/components/SessionList.tsx` (create)
- `web/frontend/src/components/SessionList.test.tsx` (create)

**Tests**:
```typescript
// SessionList.test.tsx
describe('SessionList', () => {
  it('renders sessions', () => {
    const sessions = [{ id: 'sess_1', createdAt: 1, updatedAt: 1 }]
    render(<SessionList sessions={sessions} onSelect={vi.fn()} />)
    expect(screen.getByText('sess_1')).toBeInTheDocument()
  })

  it('calls onSelect when session clicked', async () => {
    const sessions = [{ id: 'sess_1', createdAt: 1, updatedAt: 1 }]
    const onSelect = vi.fn()
    render(<SessionList sessions={sessions} onSelect={onSelect} selectedId={null} />)
    await userEvent.click(screen.getByText('sess_1'))
    expect(onSelect).toHaveBeenCalledWith('sess_1')
  })

  it('highlights selected session', () => {
    const sessions = [{ id: 'sess_1', createdAt: 1, updatedAt: 1 }]
    render(<SessionList sessions={sessions} onSelect={vi.fn()} selectedId="sess_1" />)
    expect(screen.getByText('sess_1').closest('div')).toHaveClass('bg-blue-100')
  })
})
```

**Steps**:
- [ ] Write failing tests in `SessionList.test.tsx`
- [ ] Implement `SessionList` component:
  - Props: `sessions`, `selectedId`, `onSelect`
  - List of clickable session items
  - Highlight selected session
  - "New Session" button at top
  - Empty state when no sessions
- [ ] Run tests - verify all pass
- [ ] Commit: `feat(web): add SessionList component`

**Verification**:
```bash
cd web/frontend && npx vitest run src/components/SessionList.test.tsx
# Expected: all tests pass
```

---

### Task 13: MessageItem Component

**Description**: Implement single message display component

**Files**:
- `web/frontend/src/components/MessageItem.tsx` (create)
- `web/frontend/src/components/MessageItem.test.tsx` (create)

**Tests**:
```typescript
// MessageItem.test.tsx
describe('MessageItem', () => {
  it('renders user message with correct style', () => {
    const msg = { id: '1', sessionId: 's', role: 'user', content: 'Hello', timestamp: 1 }
    render(<MessageItem message={msg} />)
    expect(screen.getByText('Hello')).toBeInTheDocument()
    expect(screen.getByText('Hello').closest('div')).toHaveClass('bg-blue-500')
  })

  it('renders assistant message with correct style', () => {
    const msg = { id: '1', sessionId: 's', role: 'assistant', content: 'Hi there', timestamp: 1 }
    render(<MessageItem message={msg} />)
    expect(screen.getByText('Hi there')).toBeInTheDocument()
    expect(screen.getByText('Hi there').closest('div')).toHaveClass('bg-gray-200')
  })
})
```

**Steps**:
- [ ] Write failing tests in `MessageItem.test.tsx`
- [ ] Implement `MessageItem` component:
  - Props: `message`
  - Different styles for user (blue, right-aligned) vs assistant (gray, left-aligned)
  - Display message content as text
- [ ] Run tests - verify all pass
- [ ] Commit: `feat(web): add MessageItem component`

**Verification**:
```bash
cd web/frontend && npx vitest run src/components/MessageItem.test.tsx
# Expected: all tests pass
```

---

### Task 14: MessageList Component

**Description**: Implement scrollable message stream

**Files**:
- `web/frontend/src/components/MessageList.tsx` (create)
- `web/frontend/src/components/MessageList.test.tsx` (create)

**Tests**:
```typescript
// MessageList.test.tsx
describe('MessageList', () => {
  it('renders list of messages', () => {
    const messages = [
      { id: '1', sessionId: 's', role: 'user', content: 'Hi', timestamp: 1 },
      { id: '2', sessionId: 's', role: 'assistant', content: 'Hello', timestamp: 2 }
    ]
    render(<MessageList messages={messages} />)
    expect(screen.getByText('Hi')).toBeInTheDocument()
    expect(screen.getByText('Hello')).toBeInTheDocument()
  })

  it('scrolls to bottom on new message', async () => {
    const { rerender } = render(<MessageList messages={[]} />)
    const scrollIntoView = vi.fn()
    // Mock scroll behavior...

    const messages = [{ id: '1', sessionId: 's', role: 'user', content: 'New', timestamp: 1 }]
    rerender(<MessageList messages={messages} />)
    // Verify scroll was called
  })
})
```

**Steps**:
- [ ] Write failing tests in `MessageList.test.tsx`
- [ ] Implement `MessageList` component:
  - Props: `messages`
  - Render MessageItem for each message
  - Auto-scroll to bottom on new messages
  - Empty state when no messages
- [ ] Run tests - verify all pass
- [ ] Commit: `feat(web): add MessageList component`

**Verification**:
```bash
cd web/frontend && npx vitest run src/components/MessageList.test.tsx
# Expected: all tests pass
```

---

### Task 15: ChatInput Component

**Description**: Implement message input with send button

**Files**:
- `web/frontend/src/components/ChatInput.tsx` (create)
- `web/frontend/src/components/ChatInput.test.tsx` (create)

**Tests**:
```typescript
// ChatInput.test.tsx
describe('ChatInput', () => {
  it('sends message on button click', async () => {
    const onSend = vi.fn()
    render(<ChatInput onSend={onSend} disabled={false} />)
    await userEvent.type(screen.getByPlaceholderText('Type a message...'), 'Hello')
    await userEvent.click(screen.getByText('Send'))
    expect(onSend).toHaveBeenCalledWith('Hello')
  })

  it('sends message on Enter key', async () => {
    const onSend = vi.fn()
    render(<ChatInput onSend={onSend} disabled={false} />)
    await userEvent.type(screen.getByPlaceholderText('Type a message...'), 'Hello{enter}')
    expect(onSend).toHaveBeenCalledWith('Hello')
  })

  it('clears input after send', async () => {
    const onSend = vi.fn()
    render(<ChatInput onSend={onSend} disabled={false} />)
    await userEvent.type(screen.getByPlaceholderText('Type a message...'), 'Hello{enter}')
    expect(screen.getByPlaceholderText('Type a message...')).toHaveValue('')
  })

  it('is disabled when prop is true', () => {
    render(<ChatInput onSend={vi.fn()} disabled={true} />)
    expect(screen.getByPlaceholderText('Type a message...')).toBeDisabled()
  })
})
```

**Steps**:
- [ ] Write failing tests in `ChatInput.test.tsx`
- [ ] Implement `ChatInput` component:
  - Props: `onSend`, `disabled`
  - Text input with placeholder
  - Send button
  - Submit on Enter or button click
  - Clear input after send
  - Disabled state
- [ ] Run tests - verify all pass
- [ ] Commit: `feat(web): add ChatInput component`

**Verification**:
```bash
cd web/frontend && npx vitest run src/components/ChatInput.test.tsx
# Expected: all tests pass
```

---

### Task 16: ChatView Component

**Description**: Combine MessageList and ChatInput

**Files**:
- `web/frontend/src/components/ChatView.tsx` (create)
- `web/frontend/src/components/ChatView.test.tsx` (create)

**Tests**:
```typescript
// ChatView.test.tsx
describe('ChatView', () => {
  it('renders messages and input', () => {
    const messages = [{ id: '1', sessionId: 's', role: 'user', content: 'Hi', timestamp: 1 }]
    render(<ChatView messages={messages} onSendMessage={vi.fn()} />)
    expect(screen.getByText('Hi')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Type a message...')).toBeInTheDocument()
  })

  it('shows empty state when no session selected', () => {
    render(<ChatView messages={null} onSendMessage={vi.fn()} />)
    expect(screen.getByText('Select a session or create a new one')).toBeInTheDocument()
  })
})
```

**Steps**:
- [ ] Write failing tests in `ChatView.test.tsx`
- [ ] Implement `ChatView` component:
  - Props: `messages`, `onSendMessage`
  - Render MessageList
  - Render ChatInput
  - Empty state when no session selected
- [ ] Run tests - verify all pass
- [ ] Commit: `feat(web): add ChatView component`

**Verification**:
```bash
cd web/frontend && npx vitest run src/components/ChatView.test.tsx
# Expected: all tests pass
```

---

### Task 17: App Component Integration

**Description**: Wire all components together with hooks

**Files**:
- `web/frontend/src/App.tsx` (create)
- `web/frontend/src/App.test.tsx` (create)

**Tests**:
```typescript
// App.test.tsx
describe('App', () => {
  it('renders session list and chat view', () => {
    render(<App />)
    expect(screen.getByText('New Session')).toBeInTheDocument()
    expect(screen.getByText('Select a session')).toBeInTheDocument()
  })

  it('creates session on button click', async () => {
    render(<App />)
    await userEvent.click(screen.getByText('New Session'))
    // Verify session was created and selected
  })

  it('sends and receives messages', async () => {
    render(<App />)
    await userEvent.click(screen.getByText('New Session'))
    await userEvent.type(screen.getByPlaceholderText('Type a message...'), 'Hello{enter}')
    // Verify message appears in list
  })
})
```

**Steps**:
- [ ] Write failing tests in `App.test.tsx`
- [ ] Implement `App` component:
  - Use `useSSE` for real-time connection
  - Use `useSessions` for state management
  - Layout: SessionList (left) + ChatView (right)
  - Header with "New Session" button
- [ ] Run tests - verify all pass
- [ ] Commit: `feat(web): integrate App component`

**Verification**:
```bash
cd web/frontend && npx vitest run src/App.test.tsx
# Expected: all tests pass
```

---

### Task 18: Docker Compose for Local Dev

**Description**: Create docker-compose for local development

**Files**:
- `web/docker-compose.yml` (create)

**Tests**: N/A (infra)

**Steps**:
- [ ] Create `docker-compose.yml` with:
  - `backend` service (build from ./backend, port 3000)
  - `frontend` service (build from ./frontend, port 80)
  - Network configuration
  - Environment variables (NATS_URL, etc.)
- [ ] Run `docker compose up --build`
- [ ] Verify both services start
- [ ] Verify frontend can reach backend
- [ ] Commit: `feat(web): add docker-compose for local dev`

**Verification**:
```bash
cd web && docker compose up --build &
curl http://localhost:3000/health
curl http://localhost:80
# Expected: both return 200
```

---

### Task 19: End-to-End Integration Test

**Description**: Full stack integration test with NATS

**Files**:
- `web/backend/src/e2e.test.ts` (create)

**Tests**:
```typescript
// e2e.test.ts
describe('E2E', () => {
  it('full message flow', async () => {
    // 1. Create session
    const { session } = await client.createSession()

    // 2. Connect SSE
    const events: SSEEvent[] = []
    const eventSource = new EventSource(`${baseUrl}/api/events`)
    eventSource.onmessage = (e) => events.push(JSON.parse(e.data))

    // 3. Send message
    await client.sendMessage(session.id, 'Hello')

    // 4. Verify SSE receives response (if consumer is running)
    // Note: This requires claude-code-consumer to be running
    await waitFor(() => {
      expect(events.some(e => e.type === 'message')).toBe(true)
    })
  })
})
```

**Steps**:
- [ ] Write e2e test
- [ ] Start full stack: NATS + Consumer + Backend
- [ ] Run e2e test
- [ ] Verify all events flow correctly
- [ ] Commit: `test(web): add e2e integration test`

**Verification**:
```bash
# Start all services
docker compose up -d  # NATS
cd consumer/claude-code-consumer && npm run dev &
cd web/backend && npx tsx src/index.ts &

# Run e2e test
cd web/backend && npx vitest run src/e2e.test.ts
# Expected: test passes
```

---

### Task 20: Documentation

**Description**: Add README and usage documentation

**Files**:
- `web/README.md` (create)

**Tests**: N/A (docs)

**Steps**:
- [ ] Create README with:
  - Project overview
  - Prerequisites (Node.js, NATS)
  - Quick start commands
  - Architecture diagram
  - API documentation
  - Environment variables
- [ ] Commit: `docs(web): add README`

**Verification**:
```bash
cat web/README.md
# Expected: documentation is readable and accurate
```

---

## Summary

| Phase | Tasks | Key Deliverables |
|-------|-------|------------------|
| Backend Setup | 1-3 | Project skeleton, SessionStore, NatsService |
| Backend API | 4-7 | Sessions/Messages/Events routes, full integration |
| Frontend Setup | 8-9 | Vite project, API client |
| Frontend Hooks | 10-11 | useSSE, useSessions |
| Frontend UI | 12-17 | All components, App integration |
| DevOps | 18-20 | Docker Compose, E2E tests, Documentation |

**Total Tasks**: 20
**Estimated Time**: 4-6 hours for experienced developer

---

## Dependencies

```
Task 1 (Backend Setup)
  └─> Task 2 (SessionStore) ─> Task 4 (Sessions API)
  └─> Task 3 (NatsService) ─> Task 5 (Messages API)
                              └─> Task 6 (Events SSE)
                                └─> Task 7 (Backend Integration)

Task 8 (Frontend Setup)
  └─> Task 9 (API Client) ─> Task 11 (useSessions)
  └─> Task 10 (useSSE) ──> Task 11 (useSessions)

Task 11 (useSessions)
  └─> Task 12-16 (Components)
    └─> Task 17 (App)

Task 7 + Task 17
  └─> Task 18 (Docker Compose)
    └─> Task 19 (E2E Test)
      └─> Task 20 (Documentation)
```

---

## Verification Checklist

Before marking complete:

- [ ] All backend tests pass: `cd web/backend && npm test`
- [ ] All frontend tests pass: `cd web/frontend && npm test`
- [ ] Backend health check: `curl http://localhost:3000/health`
- [ ] Frontend loads: `curl http://localhost:5173`
- [ ] Can create session via API
- [ ] Can send message via API
- [ ] SSE connection receives events
- [ ] Docker Compose builds and runs
- [ ] README documents all features
