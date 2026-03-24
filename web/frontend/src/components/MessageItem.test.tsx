import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MessageItem } from './MessageItem'
import type { Message } from '../types'

describe('MessageItem', () => {
  const userMessage: Message = {
    id: '1',
    sessionId: 's',
    role: 'user',
    content: 'Hello',
    timestamp: 1000000000000,
  }

  const assistantMessage: Message = {
    id: '2',
    sessionId: 's',
    role: 'assistant',
    content: 'Hi there',
    timestamp: 1000000000000,
  }

  it('renders user message with correct style', () => {
    render(<MessageItem message={userMessage} />)
    // Find the inner message content div
    const container = screen.getByText('Hello').parentElement
    expect(container).toHaveClass('bg-blue-600')
  })

  it('renders assistant message with correct style', () => {
    render(<MessageItem message={assistantMessage} />)
    const container = screen.getByText('Hi there').parentElement
    expect(container).toHaveClass('bg-gray-200')
  })

  it('renders message content', () => {
    render(<MessageItem message={userMessage} />)
    expect(screen.getByText('Hello')).toBeInTheDocument()
  })

  it('renders timestamp', () => {
    render(<MessageItem message={userMessage} />)
    // Timestamp should be formatted
    expect(screen.getByText(/\d{1,2}:\d{2}/)).toBeInTheDocument()
  })

  it('handles multiline content', () => {
    const multiLineMessage: Message = {
      ...userMessage,
      content: 'Line 1\nLine 2\nLine 3',
    }

    render(<MessageItem message={multiLineMessage} />)

    // All lines should be visible
    expect(screen.getByText(/Line 1/)).toBeInTheDocument()
    expect(screen.getByText(/Line 2/)).toBeInTheDocument()
    expect(screen.getByText(/Line 3/)).toBeInTheDocument()
  })

  it('handles long content with word wrap', () => {
    const longMessage: Message = {
      ...userMessage,
      content: 'a'.repeat(500),
    }

    render(<MessageItem message={longMessage} />)

    const messageDiv = screen.getByText('a'.repeat(500)).closest('div')
    expect(messageDiv).toHaveClass('whitespace-pre-wrap', 'break-words')
  })
})
