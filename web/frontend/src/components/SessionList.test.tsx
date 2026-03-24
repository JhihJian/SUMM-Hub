import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SessionList } from './SessionList'

describe('SessionList', () => {
  const mockSessions = [
    { id: 'sess_1', createdAt: 1000, updatedAt: 1000 },
    { id: 'sess_2', createdAt: 2000, updatedAt: 2000 },
  ]

  it('renders sessions', () => {
    render(
      <SessionList
        sessions={mockSessions}
        selectedId={null}
        onSelect={vi.fn()}
        onNewSession={vi.fn()}
      />
    )

    expect(screen.getByText('sess_1')).toBeInTheDocument()
    expect(screen.getByText('sess_2')).toBeInTheDocument()
  })

  it('calls onSelect when session clicked', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()

    render(
      <SessionList
        sessions={mockSessions}
        selectedId={null}
        onSelect={onSelect}
        onNewSession={vi.fn()}
      />
    )

    await user.click(screen.getByText('sess_1'))

    expect(onSelect).toHaveBeenCalledWith('sess_1')
  })

  it('highlights selected session', () => {
    render(
      <SessionList
        sessions={mockSessions}
        selectedId="sess_1"
        onSelect={vi.fn()}
        onNewSession={vi.fn()}
      />
    )

    const selectedButton = screen.getByText('sess_1').closest('button')
    expect(selectedButton).toHaveClass('bg-blue-50')
  })

  it('shows empty state when no sessions', () => {
    render(
      <SessionList
        sessions={[]}
        selectedId={null}
        onSelect={vi.fn()}
        onNewSession={vi.fn()}
      />
    )

    expect(screen.getByText('No sessions yet. Create one to get started.')).toBeInTheDocument()
  })

  it('calls onNewSession when button clicked', async () => {
    const onNewSession = vi.fn()
    const user = userEvent.setup()

    render(
      <SessionList
        sessions={mockSessions}
        selectedId={null}
        onSelect={vi.fn()}
        onNewSession={onNewSession}
      />
    )

    await user.click(screen.getByText('+ New Session'))

    expect(onNewSession).toHaveBeenCalled()
  })

  it('disables new session button when loading', () => {
    render(
      <SessionList
        sessions={mockSessions}
        selectedId={null}
        onSelect={vi.fn()}
        onNewSession={vi.fn()}
        isLoading={true}
      />
    )

    expect(screen.getByText('+ New Session')).toBeDisabled()
  })

  it('shows loading indicator', () => {
    render(
      <SessionList
        sessions={mockSessions}
        selectedId={null}
        onSelect={vi.fn()}
        onNewSession={vi.fn()}
        isLoading={true}
      />
    )

    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })
})
