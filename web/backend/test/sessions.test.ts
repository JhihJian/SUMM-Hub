import { describe, it, expect, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { createSessionsRoutes } from '../src/routes/sessions'
import { SessionStore } from '../src/services/sessionStore'

describe('Sessions API', () => {
  let app: Hono
  let store: SessionStore

  beforeEach(() => {
    app = new Hono()
    store = new SessionStore()
    app.route('/api/sessions', createSessionsRoutes(store))
  })

  describe('GET /api/sessions', () => {
    it('returns empty array initially', async () => {
      const res = await app.request('/api/sessions')
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ sessions: [] })
    })

    it('returns sessions sorted by updatedAt desc', async () => {
      // Create sessions via the store directly for this test
      const s1 = store.create()
      await new Promise(r => setTimeout(r, 10))
      const s2 = store.create()

      const res = await app.request('/api/sessions')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.sessions).toHaveLength(2)
      expect(body.sessions[0].id).toBe(s2.id) // newest first
      expect(body.sessions[1].id).toBe(s1.id)
    })
  })

  describe('POST /api/sessions', () => {
    it('creates new session', async () => {
      const res = await app.request('/api/sessions', { method: 'POST' })
      expect(res.status).toBe(200)
      const body = await res.json() as { session: { id: string } }
      expect(body.session.id).toMatch(/^sess_/)
    })

    it('returns session with timestamps', async () => {
      const res = await app.request('/api/sessions', { method: 'POST' })
      const body = await res.json() as { session: { createdAt: number; updatedAt: number } }
      expect(body.session.createdAt).toBeGreaterThan(0)
      expect(body.session.updatedAt).toBeGreaterThan(0)
    })
  })

  describe('GET /api/sessions/:id/messages', () => {
    it('returns empty messages array for new session', async () => {
      const session = store.create()
      const res = await app.request(`/api/sessions/${session.id}/messages`)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ messages: [] })
    })

    it('returns messages for session', async () => {
      const session = store.create()
      store.addMessage(session.id, { id: '1', role: 'user', content: 'Hello' })
      store.addMessage(session.id, { id: '2', role: 'assistant', content: 'Hi there' })

      const res = await app.request(`/api/sessions/${session.id}/messages`)
      const body = await res.json() as { messages: Array<{ id: string; content: string }> }

      expect(res.status).toBe(200)
      expect(body.messages).toHaveLength(2)
      expect(body.messages[0].id).toBe('1')
      expect(body.messages[1].id).toBe('2')
    })

    it('returns 404 for unknown session', async () => {
      const res = await app.request('/api/sessions/sess_unknown/messages')
      expect(res.status).toBe(404)
      const body = await res.json() as { error: string }
      expect(body.error).toBe('Session not found')
    })
  })
})
