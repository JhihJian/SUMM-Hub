import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import type { SessionStore } from '../services/sessionStore'
import type { NatsService } from '../services/nats'
import type { SSEEvent } from '../types'

/**
 * Create events SSE route
 */
export function createEventsRoute(store: SessionStore, nats: NatsService): Hono {
  const app = new Hono()

  /**
   * GET /api/events - SSE endpoint for real-time updates
   */
  app.get('/events', async (c) => {
    // Check NATS connection
    if (!nats.isConnected()) {
      return c.json({ error: 'Service unavailable' }, 503)
    }

    const stream = streamSSE(c, async (stream) => {
      // Send initial connection event
      await stream.writeSSE({
        event: 'message',
        data: JSON.stringify({
          type: 'connection-changed',
          data: { connected: true },
        } as SSEEvent),
      })

      // Track active sessions for this connection
      const activeSessions = new Set<string>()

      // Subscribe to NATS output messages
      await nats.subscribeOutput((msg) => {
        // Convert NATS output to frontend message
        const event: SSEEvent = {
          type: 'message',
          data: {
            id: msg.message_id,
            sessionId: msg.session_id,
            role: 'assistant',
            content: msg.content || '',
            timestamp: msg.timestamp,
          },
        }

        // Store message if session exists
        if (store.get(msg.session_id)) {
          store.addMessage(msg.session_id, {
            id: msg.message_id,
            role: 'assistant',
            content: msg.content || '',
          })
        }

        // Push to SSE stream (async, non-blocking)
        stream.writeSSE({
          event: 'message',
          data: JSON.stringify(event),
        }).catch(console.error)
      })

      // Subscribe to NATS error messages
      await nats.subscribeError((msg) => {
        const event: SSEEvent = {
          type: 'error',
          data: {
            sessionId: msg.session,
            code: msg.code,
            message: msg.message,
          },
        }

        stream.writeSSE({
          event: 'message',
          data: JSON.stringify(event),
        }).catch(console.error)
      })

      // Heartbeat loop - send every 30 seconds
      let lastHeartbeat = Date.now()
      const heartbeatInterval = setInterval(() => {
        const now = Date.now()
        if (now - lastHeartbeat >= 30000) {
          stream.writeSSE({
            event: 'message',
            data: JSON.stringify({
              type: 'heartbeat',
              data: { timestamp: now },
            } as SSEEvent),
          }).catch(console.error)
          lastHeartbeat = now
        }
      }, 5000) // Check every 5 seconds

      // Keep connection alive
      // The stream will close when the client disconnects
      return new Promise<void>((resolve) => {
        // Clean up on abort
        stream.onAbort(() => {
          clearInterval(heartbeatInterval)
          resolve()
        })
      })
    })

    return stream
  })

  return app
}
