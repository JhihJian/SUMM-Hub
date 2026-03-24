import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Hono } from 'hono'
import { createMessagesRoutes } from '../src/routes/messages'
import { SessionStore } from '../src/services/sessionStore'
import type { NatsService } from '../src/services/nats'

// Mock NatsService
function createMockNatsService() {
  return {
    publishInput: vi.fn().mockResolvedValue(undefined),
    isConnected: vi.fn().mockReturnValue(true),
  } as unknown as NatsService
}

describe('Messages API', () => {
  let app: Hono
  let store: SessionStore
  let nats: NatsService

  beforeEach(() => {
    app = new Hono()
    store = new SessionStore()
    nats = createMockNatsService()
    app.route('/api/sessions', createMessagesRoutes(store, nats))
  })

  describe('POST /api/sessions/:id/messages', () => {
    it('sends message and returns ok', async () => {
      const session = store.create()

      const res = await app.request(`/api/sessions/${session.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Hello' }),
      })

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true })
    })

    it('publishes message to NATS', async () => {
      const session = store.create()
      const mockNats = nats as { publishInput: ReturnType<typeof vi.fn> }

      await app.request(`/api/sessions/${session.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Hello from test' }),
      })

      expect(mockNats.publishInput).toHaveBeenCalledWith(
        session.id,
        'Hello from test'
      )
    })

    it('stores user message in session', async () => {
      const session = store.create()

      await app.request(`/api/sessions/${session.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Test message' }),
      })

      const messages = store.getMessages(session.id)
      expect(messages).toHaveLength(1)
      expect(messages[0].role).toBe('user')
      expect(messages[0].content).toBe('Test message')
    })

    it('returns 400 without content', async () => {
      const session = store.create()

      const res = await app.request(`/api/sessions/${session.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      expect(res.status).toBe(400)
      const body = await res.json() as { error: string }
      expect(body.error).toBe('Content is required')
    })

    it('returns 404 for unknown session', async () => {
      const res = await app.request('/api/sessions/sess_unknown/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'test' }),
      })

      expect(res.status).toBe(404)
    })

    it('returns 503 when NATS is not connected', async () => {
      const disconnectedNats = {
        publishInput: vi.fn(),
        isConnected: vi.fn().mockReturnValue(false),
      } as unknown as NatsService

      const localApp = new Hono()
      localApp.route('/api/sessions', createMessagesRoutes(store, disconnectedNats))

      const session = store.create()

      const res = await localApp.request(`/api/sessions/${session.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'test' }),
      })

      expect(res.status).toBe(503)
    })
  })
})
