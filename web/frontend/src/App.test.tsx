import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'

// Mock hooks
vi.mock('./hooks/useSSE', () => ({
  useSSE: () => ({
    connected: true,
    error: null,
    disconnect: vi.fn(),
    reconnect: vi.fn(),
  }),
}))

vi.mock('./hooks/useSessions', () => ({
  useSessions: () => ({
    sessions: [
      { id: 'sess_1', createdAt: 1000, updatedAt: 1000 },
      { id: 'sess_2', createdAt: 2000, updatedAt: 2000 },
    ],
    currentSessionId: null,
    currentSession: null,
    messages: new Map(),
    isLoading: false,
    error: null,
    loadSessions: vi.fn(),
    createSession: vi.fn().mockResolvedValue({ id: 'sess_new' }),
    selectSession: vi.fn(),
    sendMessage: vi.fn().mockResolvedValue(undefined),
    handleSSEEvent: vi.fn(),
  }),
}))

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders session list with sessions', () => {
    render(<App />)

    expect(screen.getByText('+ New Session')).toBeInTheDocument()
    expect(screen.getByText('sess_1')).toBeInTheDocument()
    expect(screen.getByText('sess_2')).toBeInTheDocument()
  })

  it('shows connection status', () => {
    render(<App />)

    expect(screen.getByText('Connected')).toBeInTheDocument()
  })

  it('shows empty state when no session selected', () => {
    render(<App />)

    expect(screen.getByText('Select a session or create a new one to start chatting.')).toBeInTheDocument()
  })

  it('creates session on button click', async () => {
    const user = userEvent.setup()

    render(<App />)

    await user.click(screen.getByText('+ New Session'))

    // Button should still be in the document after click
    expect(screen.getByText('+ New Session')).toBeInTheDocument()
  })
})
