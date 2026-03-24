import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import { createSessionsRoutes } from './routes/sessions'
import { createMessagesRoutes } from './routes/messages'
import { createEventsRoute } from './routes/events'
import { SessionStore } from './services/sessionStore'
import { NatsService } from './services/nats'

// Configuration
const PORT = parseInt(process.env.PORT || '3000', 10)
const NATS_URL = process.env.NATS_URL || 'nats://localhost:4222'
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'

// Initialize services
const store = new SessionStore()
const nats = new NatsService({ url: NATS_URL })

// Create Hono app
const app = new Hono()

// CORS middleware
app.use('*', cors({
  origin: FRONTEND_URL,
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
}))

// Health check endpoint
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    nats: nats.isConnected() ? 'connected' : 'disconnected',
  })
})

// Mount API routes
app.route('/api/sessions', createSessionsRoutes(store))
app.route('/api/sessions', createMessagesRoutes(store, nats))
app.route('/api', createEventsRoute(store, nats))

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not found' }, 404)
})

// Error handler
app.onError((err, c) => {
  console.error('Server error:', err)
  return c.json({ error: 'Internal server error' }, 500)
})

// Start server
async function start() {
  console.log(`[Server] Starting on port ${PORT}...`)
  console.log(`[Server] NATS URL: ${NATS_URL}`)
  console.log(`[Server] Frontend URL: ${FRONTEND_URL}`)

  // Connect to NATS
  try {
    await nats.connect()
    console.log('[NATS] Connected successfully')
  } catch (err) {
    console.error('[NATS] Connection failed:', err)
    console.log('[NATS] Server will start anyway, NATS features will be unavailable')
  }

  const server = serve({
    fetch: app.fetch,
    port: PORT,
  })

  console.log(`[Server] Listening on http://localhost:${PORT}`)

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n[Server] Shutting down...')
    await nats.disconnect()
    server.close()
    console.log('[Server] Shutdown complete')
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

start()

export { app }
