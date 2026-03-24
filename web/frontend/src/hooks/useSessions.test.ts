import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSessions } from './useSessions'
import * as api from '../api/client'

// Mock API client
vi.mock('../api/client', () => ({
  apiClient: {
    getSessions: vi.fn(),
    createSession: vi.fn(),
    getMessages: vi.fn(),
    sendMessage: vi.fn(),
  },
}))

const mockedApi = vi.mocked(api.apiClient)

describe('useSessions', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('loads sessions on mount', async () => {
    const mockSessions = [
      { id: 'sess_1', createdAt: 1, updatedAt: 1 },
      { id: 'sess_2', createdAt: 2, updatedAt: 2 },
    ]

    mockedApi.getSessions.mockResolvedValueOnce({ sessions: mockSessions })

    const { result } = renderHook(() => useSessions())

    // Wait for load to complete
    await act(async () => {
      await new Promise(r => setTimeout(r, 0))
    })

    expect(result.current.sessions).toHaveLength(2)
    expect(result.current.isLoading).toBe(false)
  })

  it('creates new session', async () => {
    const mockSession = { id: 'sess_new', createdAt: 123, updatedAt: 123 }
    mockedApi.getSessions.mockResolvedValueOnce({ sessions: [] })
    mockedApi.createSession.mockResolvedValueOnce({ session: mockSession })

    const { result } = renderHook(() => useSessions())

    await act(async () => {
      await result.current.createSession()
    })

    expect(result.current.sessions).toHaveLength(1)
    expect(result.current.sessions[0].id).toBe('sess_new')
    expect(result.current.currentSessionId).toBe('sess_new')
  })

  it('selects session', async () => {
    mockedApi.getSessions.mockResolvedValueOnce({ sessions: [] })

    const { result } = renderHook(() => useSessions())

    act(() => {
      result.current.selectSession('sess_123')
    })

    expect(result.current.currentSessionId).toBe('sess_123')
  })

  it('sends message with optimistic update', async () => {
    const mockSession = { id: 'sess_1', createdAt: 123, updatedAt: 123 }
    mockedApi.getSessions.mockResolvedValueOnce({ sessions: [mockSession] })
    mockedApi.sendMessage.mockResolvedValueOnce({ ok: true })

    const { result } = renderHook(() => useSessions())

    // Wait for initial load and select session
    await act(async () => {
      await new Promise(r => setTimeout(r, 0))
    })

    act(() => {
      result.current.selectSession('sess_1')
    })

    // Send message
    await act(async () => {
      await result.current.sendMessage('Hello')
    })

    const sessionMessages = result.current.messages.get('sess_1')
    expect(sessionMessages).toBeDefined()
    expect(sessionMessages).toHaveLength(1)
    expect(sessionMessages![0].content).toBe('Hello')
    expect(sessionMessages![0].role).toBe('user')
  })

  it('handles SSE message event', async () => {
    mockedApi.getSessions.mockResolvedValueOnce({ sessions: [] })

    const { result } = renderHook(() => useSessions())

    // Simulate receiving an SSE message
    act(() => {
      result.current.handleSSEEvent({
        type: 'message',
        data: {
          id: 'msg_1',
          sessionId: 'sess_1',
          role: 'assistant',
          content: 'Hello back',
          timestamp: 123,
        },
      })
    })

    const sessionMessages = result.current.messages.get('sess_1')
    expect(sessionMessages).toBeDefined()
    expect(sessionMessages).toHaveLength(1)
    expect(sessionMessages![0].content).toBe('Hello back')
  })

  it('handles SSE session-created event', async () => {
    mockedApi.getSessions.mockResolvedValueOnce({ sessions: [] })

    const { result } = renderHook(() => useSessions())

    // Simulate receiving a session-created event
    act(() => {
      result.current.handleSSEEvent({
        type: 'session-created',
        data: {
          id: 'sess_new',
          createdAt: 123,
          updatedAt: 123,
        },
      })
    })

    expect(result.current.sessions).toHaveLength(1)
    expect(result.current.sessions[0].id).toBe('sess_new')
  })
})
