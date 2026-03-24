// Session type
export interface Session {
  id: string
  createdAt: number
  updatedAt: number
}

// Message type
export interface Message {
  id: string
  sessionId: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

// SSE Event types
export type SSEEvent =
  | { type: 'message'; data: Message }
  | { type: 'session-created'; data: Session }
  | { type: 'error'; data: { sessionId: string; code: string; message: string } }
  | { type: 'heartbeat'; data: { timestamp: number } }
  | { type: 'connection-changed'; data: { connected: boolean } }

// API Response types
export interface SessionsResponse {
  sessions: Session[]
}

export interface SessionResponse {
  session: Session
}

export interface MessagesResponse {
  messages: Message[]
}

export interface SendMessageResponse {
  ok: boolean
}

export interface ErrorResponse {
  error: string
}
