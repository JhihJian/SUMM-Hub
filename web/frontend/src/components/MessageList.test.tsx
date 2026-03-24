import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MessageList } from './MessageList'
import type { Message } from '../types'

// Mock scrollIntoView
const scrollIntoViewMock = vi.fn()
HTMLElement.prototype.scrollIntoView = scrollIntoViewMock

describe('MessageList', () => {
  const messages: Message[] = [
    { id: '1', sessionId: 's', role: 'user', content: 'Hi', timestamp: 1000 },
    { id: '2', sessionId: 's', role: 'assistant', content: 'Hello!', timestamp: 2000 },
  ]

  beforeEach(() => {
    scrollIntoViewMock.mockClear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders list of messages', () => {
    render(<MessageList messages={messages} />)

    expect(screen.getByText('Hi')).toBeInTheDocument()
    expect(screen.getByText('Hello!')).toBeInTheDocument()
  })

  it('shows empty state when no messages', () => {
    render(<MessageList messages={[]} />)

    expect(screen.getByText('No messages yet. Start a conversation!')).toBeInTheDocument()
  })

  it('scrolls to bottom on new message', () => {
    const { rerender } = render(<MessageList messages={messages} />)

    // Add a new message
    const newMessages = [...messages, { id: '3', sessionId: 's', role: 'user', content: 'New', timestamp: 3000 }]
    rerender(<MessageList messages={newMessages} />)

    expect(scrollIntoViewMock).toHaveBeenCalled()
  })

  it('does not scroll when same number of messages', () => {
    const { rerender } = render(<MessageList messages={messages} />)

    // Clear the mock after initial render
    scrollIntoViewMock.mockClear()

    // Rerender with same messages (should not trigger scroll)
    rerender(<MessageList messages={messages} />)

    // No scroll should happen when message count hasn't increased
    expect(scrollIntoViewMock).not.toHaveBeenCalled()
  })

  it('shows loading indicator', () => {
    render(<MessageList messages={messages} isLoading />)

    // Loading indicator contains multiple bullet characters
    const bullets = screen.getAllByText('●')
    expect(bullets.length).toBe(3)
  })

  it('does not show loading indicator when not loading', () => {
    render(<MessageList messages={messages} isLoading={false} />)

    expect(screen.queryAllByText('●')).toHaveLength(0)
  })
})
