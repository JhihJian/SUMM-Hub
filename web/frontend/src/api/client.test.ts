import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ApiClient } from './client'

// Mock fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock EventSource
class MockEventSource {
  url: string
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((error: Event) => void) | null = null
  readyState: number = 0

  constructor(url: string) {
    this.url = url
  }
  close() {
    this.readyState = 2
  }
}
global.EventSource = MockEventSource as unknown as typeof EventSource

describe('ApiClient', () => {
  let client: ApiClient

  beforeEach(() => {
    client = new ApiClient('http://localhost:3000')
    mockFetch.mockReset()
  })

  describe('getSessions', () => {
    it('returns sessions array', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sessions: [] }),
      })

      const result = await client.getSessions()
      expect(result.sessions).toEqual([])
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/sessions')
    })
  })

  describe('createSession', () => {
    it('creates session and returns it', async () => {
      const mockSession = {
        id: 'sess_123',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ session: mockSession }),
      })

      const result = await client.createSession()
      expect(result.session.id).toMatch(/^sess_/)
    })
  })

  describe('getMessages', () => {
    it('returns messages for session', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [] }),
      })

      const result = await client.getMessages('sess_123')
      expect(result.messages).toEqual([])
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/sessions/sess_123/messages')
    })
  })

  describe('sendMessage', () => {
    it('sends message with content', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true }),
      })

      const result = await client.sendMessage('sess_123', 'Hello')
      expect(result.ok).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/sessions/sess_123/messages',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: 'Hello' }),
        }
      )
    })

    it('throws on error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found',
        json: async () => ({ error: 'Session not found' }),
      })

      await expect(client.sendMessage('sess_unknown', 'test')).rejects.toThrow()
    })
  })

  describe('createEventSource', () => {
    it('creates EventSource with correct URL', () => {
      const onEvent = vi.fn()
      const eventSource = client.createEventSource(onEvent)

      expect(eventSource.url).toBe('http://localhost:3000/api/events')
      eventSource.close()
    })
  })
})
