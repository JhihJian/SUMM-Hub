import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSSE } from './useSSE'

// Mock EventSource
class MockEventSource {
  url: string
  onopen: (() => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: (() => void) | null = null
  readyState: number = 0
  private closed = false

  constructor(url: string) {
    this.url = url
    // Simulate async connection
    setTimeout(() => {
      if (!this.closed && this.onopen) {
        this.onopen()
      }
    }, 0)
  }

  close() {
    this.closed = true
    this.readyState = 2
  }

  // Helper to simulate receiving a message
  _simulateMessage(data: unknown) {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data: JSON.stringify(data) }))
    }
  }

  // Helper to simulate an error
  _simulateError() {
    if (this.onerror) {
      this.onerror()
    }
  }
}

vi.stubGlobal('EventSource', MockEventSource)

describe('useSSE', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('connects to SSE endpoint on mount', async () => {
    const { result } = renderHook(() => useSSE({ baseUrl: 'http://localhost:3000' }))

    // Initially not connected
    expect(result.current.connected).toBe(false)

    // After onopen fires
    await act(async () => {
      vi.advanceTimersByTime(10)
    })

    expect(result.current.connected).toBe(true)
  })

  it('calls onEvent callback when message received', async () => {
    const onEvent = vi.fn()
    let eventSource: MockEventSource | null = null

    vi.stubGlobal('EventSource', class {
      constructor(url: string) {
        eventSource = new MockEventSource(url)
        return eventSource
      }
    })

    renderHook(() => useSSE({ baseUrl: 'http://localhost:3000', onEvent }))

    await act(async () => {
      vi.advanceTimersByTime(10)
    })

    // Simulate receiving a message
    act(() => {
      eventSource?._simulateMessage({ type: 'message', data: { content: 'test' } })
    })

    expect(onEvent).toHaveBeenCalledWith({ type: 'message', data: { content: 'test' } })
  })

  it('disconnect cleans up EventSource', async () => {
    const { result } = renderHook(() => useSSE({ baseUrl: 'http://localhost:3000' }))

    await act(async () => {
      vi.advanceTimersByTime(10)
    })

    expect(result.current.connected).toBe(true)

    act(() => {
      result.current.disconnect()
    })

    expect(result.current.connected).toBe(false)
  })

  it('reconnect creates new EventSource', async () => {
    const { result } = renderHook(() => useSSE({ baseUrl: 'http://localhost:3000' }))

    await act(async () => {
      vi.advanceTimersByTime(10)
    })

    expect(result.current.connected).toBe(true)

    act(() => {
      result.current.reconnect()
    })

    await act(async () => {
      vi.advanceTimersByTime(10)
    })

    expect(result.current.connected).toBe(true)
  })
})
