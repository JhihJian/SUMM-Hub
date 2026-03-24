# Web Consumer/Producer

A web chat interface for SUMM-Hub with real-time messaging via Server-Sent Events (SSE).

## Architecture

```
┌─────────────┐     REST/SSE      ┌─────────────┐     NATS      ┌─────────────┐
│   Frontend  │ ◄───────────────► │   Backend   │ ◄───────────► │  SUMM-Hub   │
│  (React +   │                   │   (Hono)    │               │   (NATS)    │
│   Vite)     │                   │             │               │             │
└─────────────┘                   └─────────────┘               └─────────────┘
                                        │                              │
                                        │                              │
                                        └──────────────────────────────┘
                                              summ.ai.input
                                              summ.ai.output
                                              summ.ai.error
```

## Features

- **Session Management**: Create and switch between chat sessions
- **Real-time Messaging**: SSE-based push for instant message delivery
- **Responsive UI**: Left sidebar for sessions, right panel for chat
- **Docker Ready**: Full Docker Compose setup for local development

## Quick Start

### Prerequisites

- Node.js 20+
- NATS Server (or use Docker Compose)

### Using Docker Compose (Recommended)

```bash
# Start all services (NATS + Backend + Frontend)
docker compose up --build

# Access the application
open http://localhost:5173
```

### Manual Setup

```bash
# 1. Start NATS (if not using Docker)
docker run -d --name nats -p 4222:4222 -p 8222:8222 nats:2.10-alpine --http_port=8222 --jetstream

# 2. Start Backend
cd backend
npm install
NATS_URL=nats://localhost:4222 npm run dev

# 3. Start Frontend (in another terminal)
cd frontend
npm install
npm run dev

# 4. Access the application
open http://localhost:5173
```

## API Endpoints

### Health Check

```
GET /health
```

Response:
```json
{
  "status": "ok",
  "nats": "connected"
}
```

### Sessions

```
GET    /api/sessions              # List all sessions
POST   /api/sessions              # Create new session
GET    /api/sessions/:id/messages # Get messages for session
```

### Messages

```
POST   /api/sessions/:id/messages # Send message to session
```

Body:
```json
{
  "content": "Hello, world!"
}
```

### Events (SSE)

```
GET    /api/events                # SSE stream for real-time updates
```

Event types:
- `connection-changed` - SSE connection status
- `message` - New message received
- `error` - Error occurred

## Project Structure

```
web/
├── backend/
│   ├── src/
│   │   ├── index.ts           # Entry point, Hono app
│   │   ├── routes/
│   │   │   ├── sessions.ts    # Session CRUD
│   │   │   ├── messages.ts    # Message sending
│   │   │   └── events.ts      # SSE endpoint
│   │   ├── services/
│   │   │   ├── nats.ts        # NATS connection
│   │   │   └── sessionStore.ts # In-memory session storage
│   │   └── types.ts           # TypeScript types
│   ├── test/                  # Unit tests
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx            # Root component
│   │   ├── api/client.ts      # HTTP client
│   │   ├── hooks/
│   │   │   ├── useSSE.ts      # SSE connection management
│   │   │   └── useSessions.ts # Session state
│   │   ├── components/
│   │   │   ├── SessionList.tsx
│   │   │   ├── ChatView.tsx
│   │   │   ├── MessageList.tsx
│   │   │   ├── MessageItem.tsx
│   │   │   └── ChatInput.tsx
│   │   └── types.ts
│   └── package.json
│
├── docker-compose.yml         # Local dev orchestration
└── README.md                  # This file
```

## Environment Variables

### Backend

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `NATS_URL` | `nats://localhost:4222` | NATS server URL |
| `FRONTEND_URL` | `http://localhost:5173` | Frontend URL for CORS |

### Frontend

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | `http://localhost:3000` | Backend API URL |

## Testing

### Backend Tests

```bash
cd backend
npm test
```

### Frontend Tests

```bash
cd frontend
npm test
```

### E2E Tests

```bash
cd scripts
./run-e2e.sh
```

## Development

### Run Tests (Watch Mode)

```bash
# Backend
cd backend && npm run test:watch

# Frontend
cd frontend && npm run test:watch
```

### Type Checking

```bash
cd backend && npx tsc --noEmit
cd frontend && npx tsc --noEmit
```

## Message Flow

1. User types message in frontend
2. Frontend sends POST to `/api/sessions/:id/messages`
3. Backend stores message and publishes to `summ.ai.input` on NATS
4. Consumer (e.g., claude-code-consumer) processes message
5. Consumer publishes response to `summ.ai.output` on NATS
6. Backend receives response via NATS subscription
7. Backend pushes response to frontend via SSE
8. Frontend displays response in chat

## License

MIT
