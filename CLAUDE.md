# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SUMM-Hub is a message hub based on NATS JetStream that decouples message sources from consumers. It routes messages by subject and ensures messages from the same session are delivered to the same consumer.

**What it IS:**
- A message distribution center that accepts messages from any source
- Routes messages to subscribers by subject
- Guarantees same-session messages route to the same consumer (via FNV-1a hash)

**What it is NOT:**
- Does not process message content
- Does not contain business logic
- Does not care about message semantics
- Does not manage session state

## Common Commands

### Start Local Environment
```bash
docker compose up -d
```

### Initialize Streams
```bash
./scripts/setup-streams.sh
```

### Health Check
```bash
./scripts/health-check.sh
```

### Run Examples

**Go Consumer:**
```bash
cd examples/go
CONSUMER_ID=0 CONSUMER_TOTAL=1 go run .
```

**TypeScript Producer:**
```bash
cd examples/typescript
npm install
npm run start
```

### TypeScript Consumer (claude-code-consumer)
```bash
cd consumer/claude-code-consumer
npm install

# Development
npm run dev

# Build
npm run build

# Run tests
npm test

# Run single test file
npx vitest run test/hash.test.ts

# Run tests with coverage
npm run test:coverage

# Integration tests (requires Docker)
npm run test:integration
```

## Architecture

### Core Subject Format
```
summ.<domain>.<action>
```

Examples:
- `summ.ai.input` - AI input messages (Producer → Hub → Consumer)
- `summ.ai.output` - AI output messages (Consumer → Hub → Producer)
- `summ.ai.error` - AI error messages
- `summ.notify.event` - Notification events

### Session Routing Strategy

Consumers use Queue Group subscription. NATS delivers to only ONE consumer in the group. Each consumer checks session ownership via FNV-1a hash:

```
hash(session_id) % consumer_total == consumer_id
```

If the consumer doesn't own the session, it NAKs the message for redelivery.

### Key Directories

| Directory | Purpose |
|----------|---------|
| `nats/` | NATS server config and stream definitions |
| `scripts/` | Setup and health check scripts |
| `docs/` | Protocol specs and guides |
| `examples/` | Go consumer and TypeScript producer examples |
| `consumer/claude-code-consumer/` | TypeScript consumer that spawns Claude Code |

### Key Documentation

| File | Purpose |
|------|---------|
| `docs/capabilities.md` | Message types and formats quick reference |
| `docs/protocol.md` | Full protocol specification (subjects, routing, errors) |
| `docs/producer-guide.md` | How to implement a producer |
| `docs/consumer-guide.md` | How to implement a consumer |
| `docs/getting-started.md` | 5-minute setup guide |

### NATS Configuration

- Server config: `nats/server.conf`
- Stream definitions: `nats/streams/ai.conf`, `nats/streams/notify.conf`
- Default ports: 4222 (client), 8222 (HTTP monitoring), 6222 (cluster routing)

## Message Format

### Input Message
```json
{
  "id": "uuid-v4",
  "session_id": "optional-session-id",
  "content": { "text": "message text" },
  "context": { "source": "slack", "user_id": "U123" },
  "timestamp": 1234567890
}
```

### Output Message
```json
{
  "session_id": "session-id",
  "message_id": "uuid",
  "timestamp": 1234567890,
  "type": "content" | "error" | "done",
  "content": "response text",
  "error_code": "only for error type",
  "error_message": "only for error type"
}
```

## Environment Variables

### Consumer Configuration
| Variable | Default | Description |
|---------|---------|------------|
| `NATS_URL` | `nats://localhost:4222` | NATS server URL |
| `CONSUMER_ID` | `0` | This consumer's ID (0, 1, 2, ...) |
| `CONSUMER_TOTAL` | `1` | Total number of consumers |
| `SESSION_TTL_MS` | `3600000` | Session TTL in ms (1 hour) |

## Key Files for claude-code-consumer

| File | Purpose |
|-----|---------|
| `src/index.ts` | Entry point, loads config, starts consumer |
| `src/consumer.ts` | NATS subscription and message handling |
| `src/executor.ts` | Spawns and manages Claude Code subprocess |
| `src/session.ts` | Session state management with TTL cleanup |
| `src/utils/hash.ts` | FNV-1a hash for session routing |
| `src/utils/types.ts` | TypeScript type definitions |

## Testing Notes

- Uses Vitest for testing
- Test files in `test/**/*.test.ts`
- Integration tests in `test-integration/` (requires Docker)
- Run specific tests: `npx vitest run test/<filename>.test.ts`
