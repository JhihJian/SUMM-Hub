import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChatInput } from './ChatInput'

describe('ChatInput', () => {
  it('sends message on button click', async () => {
    const onSend = vi.fn()
    const user = userEvent.setup()

    render(<ChatInput onSend={onSend} />)

    const input = screen.getByPlaceholderText('Type a message...')
    await user.type(input, 'Hello')
    await user.click(screen.getByText('Send'))

    expect(onSend).toHaveBeenCalledWith('Hello')
  })

  it('sends message on Enter key', async () => {
    const onSend = vi.fn()
    const user = userEvent.setup()

    render(<ChatInput onSend={onSend} />)

    const input = screen.getByPlaceholderText('Type a message...')
    await user.type(input, 'Hello{enter}')

    expect(onSend).toHaveBeenCalledWith('Hello')
  })

  it('allows new line with Shift+Enter', async () => {
    const onSend = vi.fn()
    const user = userEvent.setup()

    render(<ChatInput onSend={onSend} />)

    const input = screen.getByPlaceholderText('Type a message...')
    await user.type(input, 'Line 1{Shift>}{enter}{/Shift}Line 2')

    // Should not have sent yet - just added a new line
    expect(onSend).not.toHaveBeenCalled()
    expect(input).toHaveValue('Line 1\nLine 2')
  })

  it('clears input after send', async () => {
    const onSend = vi.fn()
    const user = userEvent.setup()

    render(<ChatInput onSend={onSend} />)

    const input = screen.getByPlaceholderText('Type a message...')
    await user.type(input, 'Hello{enter}')

    expect(input).toHaveValue('')
  })

  it('does not send empty message', async () => {
    const onSend = vi.fn()
    const user = userEvent.setup()

    render(<ChatInput onSend={onSend} />)

    await user.click(screen.getByText('Send'))

    expect(onSend).not.toHaveBeenCalled()
  })

  it('does not send whitespace-only message', async () => {
    const onSend = vi.fn()
    const user = userEvent.setup()

    render(<ChatInput onSend={onSend} />)

    const input = screen.getByPlaceholderText('Type a message...')
    await user.type(input, '   {enter}')

    expect(onSend).not.toHaveBeenCalled()
  })

  it('is disabled when prop is true', () => {
    render(<ChatInput onSend={vi.fn()} disabled />)

    expect(screen.getByPlaceholderText('Type a message...')).toBeDisabled()
    expect(screen.getByText('Send')).toBeDisabled()
  })

  it('disables send button when input is empty', () => {
    render(<ChatInput onSend={vi.fn()} />)

    expect(screen.getByText('Send')).toBeDisabled()
  })

  it('uses custom placeholder', () => {
    render(<ChatInput onSend={vi.fn()} placeholder="Ask anything..." />)

    expect(screen.getByPlaceholderText('Ask anything...')).toBeInTheDocument()
  })
})
