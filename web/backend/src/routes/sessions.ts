import { Hono } from 'hono'
import type { SessionStore } from '../services/sessionStore'

/**
 * Create sessions API routes
 */
export function createSessionsRoutes(store: SessionStore): Hono {
  const app = new Hono()

  /**
   * GET /api/sessions - List all sessions
   */
  app.get('/', (c) => {
    const sessions = store.list()
    return c.json({ sessions })
  })

  /**
   * POST /api/sessions - Create a new session
   */
  app.post('/', (c) => {
    const session = store.create()
    return c.json({ session })
  })

  /**
   * GET /api/sessions/:id/messages - Get messages for a session
   */
  app.get('/:id/messages', (c) => {
    const sessionId = c.req.param('id')
    const session = store.get(sessionId)

    if (!session) {
      return c.json({ error: 'Session not found' }, 404)
    }

    const messages = store.getMessages(sessionId)
    return c.json({ messages })
  })

  return app
}
