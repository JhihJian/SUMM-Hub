# Implementation Plan: Feishu Bidirectional Messaging

## Scope

Implement `feishu-connector` service enabling bidirectional messaging between Feishu users and AI through SUMM-Hub's NATS message bus.

**Key Features:**
- WebSocket connection to Feishu (no public URL required)
- Group chat support with @bot trigger
- Session ID specification via `#session-xxx` prefix
- Reply to original message for AI responses

---

## Architecture

```
Feishu Message → WebSocket → feishu-connector → NATS (summ.ai.input)
                                                      ↓
                                             claude-code-consumer
                                                      ↓
Feishu Reply ← API ← feishu-connector ← NATS (summ.ai.output)
```

---

## File Structure

```
consumer/feishu-connector/
├── src/
│   ├── index.ts           # Entry point, load config, start connector
│   ├── connector.ts       # FeishuConnector main class
│   ├── websocket.ts       # WebSocket client wrapper with reconnection
│   ├── parser.ts          # Message parser (session extraction, @mention)
│   ├── responder.ts       # Feishu API reply client
│   └── types.ts           # TypeScript type definitions
├── test/
│   ├── parser.test.ts     # Parser unit tests
│   └── connector.test.ts  # Connector integration tests
├── package.json
├── tsconfig.json
├── Dockerfile
├── .dockerignore
└── docker-compose.e2e.yml
```

---

## Tasks

### Task 1: Project Setup

**Goal:** Create project scaffold with dependencies and build configuration.

**Files:**
- `consumer/feishu-connector/package.json`
- `consumer/feishu-connector/tsconfig.json`
- `consumer/feishu-connector/.dockerignore`

**Commands:**
```bash
mkdir -p consumer/feishu-connector/src consumer/feishu-connector/test
cd consumer/feishu-connector
npm init -y
npm install nats@^2.18.0 @larksuiteoapi/node-sdk@^1.30.0 uuid@^9.0.0
npm install -D typescript@^5.3.0 ts-node@^10.9.2 vitest@^3.0.0 @types/node@^20.10.0 @types/uuid@^9.0.0
```

**Verification:**
```bash
cd consumer/feishu-connector && npm run build
```

---

### Task 2: Type Definitions

**Goal:** Define TypeScript types for message formats and configuration.

**File:** `consumer/feishu-connector/src/types.ts`

**Types to define:**
- `FeishuConnectorConfig` - Service configuration
- `InputMessage` - Message to NATS (matches SUMM-Hub protocol)
- `OutputMessage` - Message from NATS (matches SUMM-Hub protocol)
- `ParsedMessage` - Internal parsed message structure
- `FeishuMessageEvent` - Feishu WebSocket event type

**Verification:**
```bash
cd consumer/feishu-connector && npx tsc --noEmit src/types.ts
```

---

### Task 3: Message Parser with Tests

**Goal:** Implement message parsing logic with TDD.

**File:** `consumer/feishu-connector/src/parser.ts`

**Test File:** `consumer/feishu-connector/test/parser.test.ts`

**Behavior:**
1. Extract text from Feishu message event
2. Check @mention for group chats
3. Extract session_id from `#session-xxx` pattern
4. Clean content by removing session prefix

**Test Cases:**
- Private chat without session prefix → use chat_id as session
- Group chat without @bot → return null (skip)
- Group chat with @bot → parse normally
- Message with `#session-abc` → extract session_id "abc"
- Message with `#session-xyz hello` → session_id "xyz", content "hello"

**Verification:**
```bash
cd consumer/feishu-connector && npm test -- test/parser.test.ts
```

---

### Task 4: WebSocket Client Wrapper

**Goal:** Create WebSocket client with automatic reconnection.

**File:** `consumer/feishu-connector/src/websocket.ts`

**Behavior:**
- Connect using `Lark.WSClient`
- Event dispatcher for `im.message.receive_v1`
- Exponential backoff reconnection (max 30s interval)
- Graceful shutdown support

**Reference:** `/data/github/clawdbot-feishu/src/client.ts` - `createFeishuWSClient`

**Verification:**
```bash
cd consumer/feishu-connector && npx tsc --noEmit src/websocket.ts
```

---

### Task 5: Feishu API Responder

**Goal:** Implement reply functionality using Feishu API.

**File:** `consumer/feishu-connector/src/responder.ts`

**Behavior:**
- Use `client.im.v1.message.reply` API
- Support markdown format (post message type)
- Extract `reply_to` from output message context

**Reference:** `/data/dev/SUMM-Hub/consumer/feishu-consumer/src/feishu.ts`

**Verification:**
```bash
cd consumer/feishu-connector && npx tsc --noEmit src/responder.ts
```

---

### Task 6: Main Connector Class

**Goal:** Integrate all components in FeishuConnector class.

**File:** `consumer/feishu-connector/src/connector.ts`

**Behavior:**
1. Connect to NATS
2. Start WebSocket client
3. Subscribe to `summ.ai.output` for AI responses
4. Route messages: WebSocket → Parser → NATS publish
5. Route responses: NATS → Responder → Feishu API

**Verification:**
```bash
cd consumer/feishu-connector && npx tsc --noEmit src/connector.ts
```

---

### Task 7: Entry Point

**Goal:** Create service entry point with configuration loading.

**File:** `consumer/feishu-connector/src/index.ts`

**Environment Variables:**
- `FEISHU_APP_ID` - Feishu application ID
- `FEISHU_APP_SECRET` - Feishu application secret
- `NATS_URL` - NATS server URL (default: `nats://localhost:4222`)
- `TRIGGER_PREFIX` - Session prefix (default: `#`)

**Verification:**
```bash
cd consumer/feishu-connector && npm run build
```

---

### Task 8: Enable AI_OUTPUT Stream

**Goal:** Uncomment AI_OUTPUT stream configuration.

**File:** `nats/streams/ai.conf`

**Change:** Uncomment lines 47-54 (AI_OUTPUT stream definition)

**Verification:**
```bash
# After restarting NATS with updated config
docker compose exec nats nats stream ls
# Should show: AI_INPUT, AI_OUTPUT
```

---

### Task 9: Integration Tests

**Goal:** Test connector with mocked NATS and Feishu.

**File:** `consumer/feishu-connector/test/connector.test.ts`

**Test Cases:**
- Message flow: WebSocket event → NATS publish
- Response flow: NATS message → Feishu reply
- Error handling: Invalid message, missing context

**Verification:**
```bash
cd consumer/feishu-connector && npm test -- test/connector.test.ts
```

---

### Task 10: Docker Configuration

**Goal:** Create containerization files.

**Files:**
- `consumer/feishu-connector/Dockerfile`
- `consumer/feishu-connector/docker-compose.e2e.yml`

**Dockerfile:** Multi-stage build (build → production image)

**Verification:**
```bash
cd consumer/feishu-connector && docker build -t feishu-connector:test .
```

---

### Task 11: E2E Test Setup

**Goal:** Create E2E test infrastructure.

**File:** `consumer/feishu-connector/docker-compose.e2e.yml`

**Services:**
- `nats` - NATS server with JetStream
- `feishu-connector` - Service under test
- `mock-ai` - Mock AI consumer for testing

**Verification:**
```bash
cd consumer/feishu-connector && docker compose -f docker-compose.e2e.yml up --abort-on-container-exit
```

---

## Dependencies

```json
{
  "dependencies": {
    "nats": "^2.18.0",
    "@larksuiteoapi/node-sdk": "^1.30.0",
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "ts-node": "^10.9.2",
    "vitest": "^3.0.0",
    "@types/node": "^20.10.0",
    "@types/uuid": "^9.0.0"
  }
}
```

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `FEISHU_APP_ID` | Yes | - | Feishu application ID |
| `FEISHU_APP_SECRET` | Yes | - | Feishu application secret |
| `NATS_URL` | No | `nats://localhost:4222` | NATS server URL |
| `TRIGGER_PREFIX` | No | `#` | Session ID prefix |

---

## Reference Files

| Purpose | Path |
|---------|------|
| WebSocket client pattern | `/data/github/clawdbot-feishu/src/client.ts` |
| @mention parsing | `/data/github/clawdbot-feishu/src/mention.ts` |
| Feishu API usage | `/data/dev/SUMM-Hub/consumer/feishu-consumer/src/feishu.ts` |
| NATS message format | `/data/dev/SUMM-Hub/consumer/claude-code-consumer/src/utils/types.ts` |
| NATS stream config | `/data/dev/SUMM-Hub/nats/streams/ai.conf` |

---

## Verification Commands

```bash
# Build
cd consumer/feishu-connector && npm run build

# Unit tests
cd consumer/feishu-connector && npm test

# Type check
cd consumer/feishu-connector && npx tsc --noEmit

# Docker build
cd consumer/feishu-connector && docker build -t feishu-connector:test .

# E2E tests (requires Docker)
cd consumer/feishu-connector && docker compose -f docker-compose.e2e.yml up --abort-on-container-exit
```
