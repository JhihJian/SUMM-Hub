import { Hono } from 'hono'
import { cors } from 'hono/cors'

const app = new Hono()

// CORS middleware for frontend
app.use('*', cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
}))

// Health check endpoint
app.get('/health', (c) => {
  return c.json({ status: 'ok' })
})

// Start server
const port = parseInt(process.env.PORT || '3000', 10)

console.log(`Starting server on port ${port}...`)

export default {
  port,
  fetch: app.fetch,
}
