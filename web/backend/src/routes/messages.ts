import { Hono } from 'hono'
import type { SessionStore } from '../services/sessionStore'
import type { NatsService } from '../services/nats'

/**
 * Create messages API routes
 */
export function createMessagesRoutes(store: SessionStore, nats: NatsService): Hono {
  const app = new Hono()

  /**
   * POST /api/sessions/:id/messages - Send a message
   */
  app.post('/:id/messages', async (c) => {
    const sessionId = c.req.param('id')

    // Check session exists
    const session = store.get(sessionId)
    if (!session) {
      return c.json({ error: 'Session not found' }, 404)
    }

    // Parse request body
    const body = await c.req.json<{ content?: string }>()

    if (!body.content || typeof body.content !== 'string') {
      return c.json({ error: 'Content is required' }, 400)
    }

    // Check NATS connection
    if (!nats.isConnected()) {
      return c.json({ error: 'Service unavailable' }, 503)
    }

    // Store user message
    store.addMessage(sessionId, {
      role: 'user',
      content: body.content,
    })

    // Publish to NATS
    await nats.publishInput(sessionId, body.content)

    return c.json({ ok: true })
  })

  return app
}
