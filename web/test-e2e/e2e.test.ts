/**
 * E2E Tests for Web Consumer/Producer
 *
 * Prerequisites:
 *   1. NATS running on localhost:6422
 *   2. Backend running on localhost:3000
 *   3. Mock consumer running (subscribes to summ.ai.input, responds to summ.ai.output)
 *
 * Run with: npm test
 */

import { describe, it, expect, beforeAll } from 'vitest'
import EventSource from 'eventsource'

const API_URL = process.env.API_URL || 'http://localhost:3000'

interface Session {
  id: string
  createdAt: number
  updatedAt: number
}

interface Message {
  id: string
  sessionId: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

interface SSEEvent {
  type: string
  data?: {
    id?: string
    sessionId?: string
    role?: string
    content?: string
    timestamp?: number
  }
}

// Helper: Wait for condition with timeout
async function waitFor(
  condition: () => boolean,
  options: { timeout?: number; interval?: number } = {}
): Promise<void> {
  const { timeout = 10000, interval = 100 } = options
  const startTime = Date.now()

  while (!condition()) {
    if (Date.now() - startTime > timeout) {
      throw new Error(`Timeout waiting for condition after ${timeout}ms`)
    }
    await new Promise((resolve) => setTimeout(resolve, interval))
  }
}

// Helper: Sleep
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

describe('E2E: Web Consumer/Producer', () => {
  beforeAll(async () => {
    const res = await fetch(`${API_URL}/health`)
    if (!res.ok) {
      throw new Error('Backend health check failed')
    }
    const data = await res.json()
    console.log('Backend health:', data)
  })

  describe('Health Check', () => {
    it('should return healthy status', async () => {
      const res = await fetch(`${API_URL}/health`)
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.status).toBe('ok')
    })
  })

  describe('Session Management', () => {
    it('should create a new session', async () => {
      const res = await fetch(`${API_URL}/api/sessions`, {
        method: 'POST',
      })
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.session).toBeDefined()
      expect(data.session.id).toMatch(/^sess_/)
    })

    it('should list sessions', async () => {
      await fetch(`${API_URL}/api/sessions`, { method: 'POST' })

      const res = await fetch(`${API_URL}/api/sessions`)
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.sessions).toBeDefined()
      expect(Array.isArray(data.sessions)).toBe(true)
      expect(data.sessions.length).toBeGreaterThan(0)
    })
  })

  describe('Message Flow', () => {
    it('should send a message and receive echo response via SSE', async () => {
      // 1. Create session
      const sessionRes = await fetch(`${API_URL}/api/sessions`, {
        method: 'POST',
      })
      expect(sessionRes.status).toBe(200)
      const sessionData = await sessionRes.json()
      const sessionId = sessionData.session.id
      console.log('Created session:', sessionId)

      // 2. Connect SSE
      const events: SSEEvent[] = []
      const eventSource = new EventSource(`${API_URL}/api/events`)

      await new Promise<void>((resolve, reject) => {
        eventSource.onopen = () => {
          console.log('SSE connected')
          resolve()
        }
        eventSource.onerror = () => {
          reject(new Error('SSE connection failed'))
        }
      })

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data)
        console.log('SSE event:', data.type)
        events.push(data)
      }

      // 3. Send message
      const testMessage = 'Hello E2E Test'
      const msgRes = await fetch(`${API_URL}/api/sessions/${sessionId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: testMessage }),
      })
      expect(msgRes.status).toBe(200)
      const msgData = await msgRes.json()
      expect(msgData.ok).toBe(true)
      console.log('Sent message:', testMessage)

      // 4. Wait for echo response
      await waitFor(
        () => {
          return events.some(
            (e) =>
              e.type === 'message' &&
              e.data?.sessionId === sessionId &&
              e.data?.role === 'assistant'
          )
        },
        { timeout: 15000 }
      )

      // 5. Verify response
      const responseEvent = events.find(
        (e) =>
          e.type === 'message' &&
          e.data?.sessionId === sessionId &&
          e.data?.role === 'assistant'
      )
      expect(responseEvent).toBeDefined()
      expect(responseEvent?.data?.content).toContain('Echo:')

      console.log('Received echo response:', responseEvent?.data?.content)

      // Cleanup
      eventSource.close()
    })

    it('should handle multiple messages in sequence', async () => {
      // Create session
      const sessionRes = await fetch(`${API_URL}/api/sessions`, {
        method: 'POST',
      })
      const sessionData = await sessionRes.json()
      const sessionId = sessionData.session.id

      // Connect SSE
      const events: SSEEvent[] = []
      const eventSource = new EventSource(`${API_URL}/api/events`)

      await new Promise<void>((resolve) => {
        eventSource.onopen = () => resolve()
      })

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data)
        events.push(data)
      }

      // Send 3 messages
      const messages = ['Message 1', 'Message 2', 'Message 3']
      for (const msg of messages) {
        const res = await fetch(`${API_URL}/api/sessions/${sessionId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: msg }),
        })
        expect(res.status).toBe(200)
        await sleep(500)
      }

      // Wait for all responses
      await waitFor(
        () => {
          const assistantMessages = events.filter(
            (e) =>
              e.type === 'message' &&
              e.data?.sessionId === sessionId &&
              e.data?.role === 'assistant'
          )
          return assistantMessages.length >= 3
        },
        { timeout: 20000 }
      )

      const assistantMessages = events.filter(
        (e) =>
          e.type === 'message' &&
          e.data?.sessionId === sessionId &&
          e.data?.role === 'assistant'
      )
      expect(assistantMessages.length).toBeGreaterThanOrEqual(3)

      eventSource.close()
    })
  })

  describe('Error Handling', () => {
    it('should return 404 for unknown session', async () => {
      const res = await fetch(`${API_URL}/api/sessions/unknown-session-id/messages`)
      expect(res.status).toBe(404)
    })

    it('should return 400 for message without content', async () => {
      const sessionRes = await fetch(`${API_URL}/api/sessions`, {
        method: 'POST',
      })
      const sessionData = await sessionRes.json()
      const sessionId = sessionData.session.id

      const res = await fetch(`${API_URL}/api/sessions/${sessionId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      expect(res.status).toBe(400)
    })
  })
})
