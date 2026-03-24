/**
 * Web Backend Type Definitions
 *
 * These are internal types for the web backend/frontend.
 * The backend converts between these and NATS protocol formats.
 */

// Session (internal representation)
export interface Session {
  id: string           // sess_xxx
  createdAt: number    // timestamp
  updatedAt: number    // timestamp
}

// Message (internal representation, for frontend rendering)
export interface Message {
  id: string
  sessionId: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

// Send message request (API input)
export interface SendMessageRequest {
  content: string
}

// API Responses
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

// SSE Event types
export type SSEEvent =
  | { type: 'message'; data: Message }
  | { type: 'session-created'; data: Session }
  | { type: 'error'; data: { sessionId: string; code: string; message: string } }
  | { type: 'heartbeat'; data: { timestamp: number } }
  | { type: 'connection-changed'; data: { connected: boolean } }

// NATS Protocol types (for conversion)
export interface NatsInputMessage {
  id: string
  session_id: string
  content: { text: string }
  context: { source: string }
  timestamp: number
}

export interface NatsOutputMessage {
  session_id: string
  message_id: string
  timestamp: number
  type: 'content' | 'error' | 'done'
  content?: string
  error_code?: string
  error_message?: string
}

export interface NatsErrorMessage {
  session: string
  code: string
  message: string
  timestamp: number
}
