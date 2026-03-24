import type { Session, Message } from '../types'

/**
 * Generate a unique session ID with sess_ prefix
 */
function generateSessionId(): string {
  const random = Math.random().toString(36).substring(2, 11)
  return `sess_${random}`
}

/**
 * Generate a unique message ID
 */
function generateMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

/**
 * In-memory session storage with messages.
 *
 * MVP: All data is lost on server restart.
 */
export class SessionStore {
  private sessions: Map<string, Session> = new Map()
  private messages: Map<string, Message[]> = new Map()

  /**
   * Create a new session
   */
  create(): Session {
    const now = Date.now()
    const session: Session = {
      id: generateSessionId(),
      createdAt: now,
      updatedAt: now,
    }
    this.sessions.set(session.id, session)
    this.messages.set(session.id, [])
    return session
  }

  /**
   * Get a session by ID
   */
  get(id: string): Session | null {
    return this.sessions.get(id) || null
  }

  /**
   * List all sessions sorted by updatedAt (newest first)
   */
  list(): Session[] {
    return Array.from(this.sessions.values())
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }

  /**
   * Update the updatedAt timestamp of a session
   */
  touch(id: string): void {
    const session = this.sessions.get(id)
    if (session) {
      session.updatedAt = Date.now()
    }
  }

  /**
   * Add a message to a session
   */
  addMessage(sessionId: string, msg: { id: string; role: 'user' | 'assistant'; content: string }): Message {
    const message: Message = {
      id: msg.id || generateMessageId(),
      sessionId,
      role: msg.role,
      content: msg.content,
      timestamp: Date.now(),
    }
    const sessionMessages = this.messages.get(sessionId) || []
    sessionMessages.push(message)
    this.messages.set(sessionId, sessionMessages)

    // Update session timestamp
    this.touch(sessionId)

    return message
  }

  /**
   * Get all messages for a session
   */
  getMessages(sessionId: string): Message[] {
    return this.messages.get(sessionId) || []
  }

  /**
   * Delete a session and its messages
   */
  delete(id: string): boolean {
    this.messages.delete(id)
    return this.sessions.delete(id)
  }
}
