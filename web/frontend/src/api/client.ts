import type {
  Session,
  Message,
  SessionsResponse,
  SessionResponse,
  MessagesResponse,
  SendMessageResponse,
} from '../types'

export class ApiClient {
  private baseUrl: string

  constructor(baseUrl: string = '') {
    this.baseUrl = baseUrl
  }

  /**
   * Get all sessions
   */
  async getSessions(): Promise<SessionsResponse> {
    const res = await fetch(`${this.baseUrl}/api/sessions`)
    if (!res.ok) {
      throw new Error(`Failed to get sessions: ${res.statusText}`)
    }
    return res.json()
  }

  /**
   * Create a new session
   */
  async createSession(): Promise<SessionResponse> {
    const res = await fetch(`${this.baseUrl}/api/sessions`, {
      method: 'POST',
    })
    if (!res.ok) {
      throw new Error(`Failed to create session: ${res.statusText}`)
    }
    return res.json()
  }

  /**
   * Get messages for a session
   */
  async getMessages(sessionId: string): Promise<MessagesResponse> {
    const res = await fetch(`${this.baseUrl}/api/sessions/${sessionId}/messages`)
    if (!res.ok) {
      throw new Error(`Failed to get messages: ${res.statusText}`)
    }
    return res.json()
  }

  /**
   * Send a message to a session
   */
  async sendMessage(sessionId: string, content: string): Promise<SendMessageResponse> {
    const res = await fetch(`${this.baseUrl}/api/sessions/${sessionId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error(body.error || `Failed to send message: ${res.statusText}`)
    }
    return res.json()
  }

  /**
   * Create SSE connection for real-time events
   */
  createEventSource(onEvent: (event: unknown) => void): EventSource {
    const eventSource = new EventSource(`${this.baseUrl}/api/events`)

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        onEvent(data)
      } catch (e) {
        console.error('Failed to parse SSE event:', e)
      }
    }

    eventSource.onerror = (error) => {
      console.error('SSE error:', error)
    }

    return eventSource
  }
}

// Default client instance
export const apiClient = new ApiClient()
