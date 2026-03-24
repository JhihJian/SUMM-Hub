import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChatView } from './ChatView'
import type { Message } from '../types'

// Mock child components
vi.mock('./MessageList', () => ({
  MessageList: ({ messages, isLoading }: { messages: Message[] | null; isLoading?: boolean }) => (
    <div data-testid="message-list" data-loading={isLoading}>
      {messages?.map(m => <span key={m.id}>{m.content}</span>)}
    </div>
  ),
}))

vi.mock('./ChatInput', () => ({
  ChatInput: ({ onSend, disabled, placeholder }: {
    onSend: (msg: string) => void
    disabled?: boolean
    placeholder?: string
  }) => (
    <div data-testid="chat-input" data-disabled={disabled} data-placeholder={placeholder}>
      <button onClick={() => onSend('test')} disabled={disabled}>Mock Send</button>
    </div>
  ),
}))

describe('ChatView', () => {
  const messages: Message[] = [
    { id: '1', sessionId: 's', role: 'user', content: 'Hi', timestamp: 1000 },
    { id: '2', sessionId: 's', role: 'assistant', content: 'Hello!', timestamp: 2000 },
  ]

  it('renders messages and input', () => {
    render(<ChatView messages={messages} onSendMessage={vi.fn()} />)

    expect(screen.getByTestId('message-list')).toBeInTheDocument()
    expect(screen.getByTestId('chat-input')).toBeInTheDocument()
  })

  it('passes messages to MessageList', () => {
    render(<ChatView messages={messages} onSendMessage={vi.fn()} />)

    expect(screen.getByText('Hi')).toBeInTheDocument()
    expect(screen.getByText('Hello!')).toBeInTheDocument()
  })

  it('passes isLoading to MessageList', () => {
    render(<ChatView messages={messages} onSendMessage={vi.fn()} isLoading />)

    expect(screen.getByTestId('message-list')).toHaveAttribute('data-loading', 'true')
  })

  it('calls onSendMessage when message sent', async () => {
    const onSendMessage = vi.fn()
    const user = userEvent.setup()

    render(<ChatView messages={messages} onSendMessage={onSendMessage} />)

    await user.click(screen.getByText('Mock Send'))

    expect(onSendMessage).toHaveBeenCalledWith('test')
  })

  it('disables input when isDisabled is true', () => {
    render(<ChatView messages={messages} onSendMessage={vi.fn()} isDisabled />)

    expect(screen.getByTestId('chat-input')).toHaveAttribute('data-disabled', 'true')
  })

  it('disables input when isLoading is true', () => {
    render(<ChatView messages={messages} onSendMessage={vi.fn()} isLoading />)

    expect(screen.getByTestId('chat-input')).toHaveAttribute('data-disabled', 'true')
  })

  it('passes placeholder to ChatInput', () => {
    render(
      <ChatView
        messages={messages}
        onSendMessage={vi.fn()}
        placeholder="Ask me anything..."
      />
    )

    expect(screen.getByTestId('chat-input')).toHaveAttribute('data-placeholder', 'Ask me anything...')
  })

  it('shows empty state when no session selected', () => {
    render(
      <ChatView
        messages={null}
        onSendMessage={vi.fn()}
      />
    )

    expect(screen.getByText('Select a session or create a new one to start chatting.')).toBeInTheDocument()
  })
})
