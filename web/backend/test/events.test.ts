import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { Hono } from 'hono'
import { createEventsRoute } from '../src/routes/events'
import { SessionStore } from '../src/services/sessionStore'
import type { NatsService } from '../src/services/nats'

// Mock NatsService
function createMockNatsService() {
  return {
    subscribeOutput: vi.fn().mockResolvedValue(undefined),
    subscribeError: vi.fn().mockResolvedValue(undefined),
    isConnected: vi.fn().mockReturnValue(true),
  } as unknown as NatsService
}

describe('Events SSE', () => {
  let app: Hono
  let store: SessionStore
  let nats: NatsService

  beforeEach(() => {
    app = new Hono()
    store = new SessionStore()
    nats = createMockNatsService()
    app.route('/api', createEventsRoute(store, nats))
  })

  describe('GET /api/events', () => {
    it('returns SSE stream with correct headers', async () => {
      const res = await app.request('/api/events')
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toContain('text/event-stream')
      expect(res.headers.get('cache-control')).toBe('no-cache')
      expect(res.headers.get('connection')).toBe('keep-alive')
    })

    it('sends connection-changed event on connect', async () => {
      const res = await app.request('/api/events')
      const reader = res.body?.getReader()

      if (!reader) {
        throw new Error('No reader')
      }

      const { value } = await reader.read()
      const text = new TextDecoder().decode(value)

      expect(text).toContain('event: message')
      expect(text).toContain('connection-changed')

      reader.cancel()
    })

    it('subscribes to NATS output and error subjects', async () => {
      const mockNats = nats as {
        subscribeOutput: ReturnType<typeof vi.fn>
        subscribeError: ReturnType<typeof vi.fn>
      }

      const res = await app.request('/api/events')

      // Allow async operations to complete
      await new Promise(r => setTimeout(r, 10))

      expect(mockNats.subscribeOutput).toHaveBeenCalled()
      expect(mockNats.subscribeError).toHaveBeenCalled()

      // Clean up
      const reader = res.body?.getReader()
      reader?.cancel()
    })

    it('returns 503 when NATS is not connected', async () => {
      const disconnectedNats = {
        subscribeOutput: vi.fn(),
        subscribeError: vi.fn(),
        isConnected: vi.fn().mockReturnValue(false),
      } as unknown as NatsService

      const localApp = new Hono()
      localApp.route('/api', createEventsRoute(store, disconnectedNats))

      const res = await localApp.request('/api/events')
      expect(res.status).toBe(503)
    })
  })
})
