import { useEffect, useRef, useState, useCallback } from 'react'
import type { SSEEvent } from '../types'

interface UseSSEOptions {
  baseUrl?: string
  onEvent?: (event: SSEEvent) => void
  reconnectInterval?: number
  maxReconnectAttempts?: number
  heartbeatTimeout?: number
}

interface UseSSEReturn {
  connected: boolean
  error: Error | null
  disconnect: () => void
  reconnect: () => void
}

export function useSSE(options: UseSSEOptions = {}): UseSSEReturn {
  const {
    baseUrl = '',
    onEvent,
    reconnectInterval = 1000,
    maxReconnectAttempts = 10,
    heartbeatTimeout = 90000, // 90 seconds
  } = options

  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const lastHeartbeatRef = useRef<number>(Date.now())
  const heartbeatCheckRef = useRef<NodeJS.Timeout | null>(null)
  // Store onEvent in a ref to avoid reconnection loop
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
  }, [])

  const clearHeartbeatCheck = useCallback(() => {
    if (heartbeatCheckRef.current) {
      clearInterval(heartbeatCheckRef.current)
      heartbeatCheckRef.current = null
    }
  }, [])

  const disconnect = useCallback(() => {
    clearReconnectTimeout()
    clearHeartbeatCheck()

    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }

    setConnected(false)
    reconnectAttemptsRef.current = 0
  }, [clearReconnectTimeout, clearHeartbeatCheck])

  const connect = useCallback(() => {
    // Don't connect if already connected
    if (eventSourceRef.current) {
      return
    }

    const eventSource = new EventSource(`${baseUrl}/api/events`)
    eventSourceRef.current = eventSource

    eventSource.onopen = () => {
      setConnected(true)
      setError(null)
      reconnectAttemptsRef.current = 0
      lastHeartbeatRef.current = Date.now()
    }

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as SSEEvent

        // Update heartbeat timestamp for any event
        lastHeartbeatRef.current = Date.now()

        // Handle connection-changed event
        if (data.type === 'connection-changed') {
          setConnected(data.data.connected)
        }

        // Handle heartbeat event
        if (data.type === 'heartbeat') {
          // Just update the heartbeat timestamp
          return
        }

        // Call the onEvent callback using ref
        if (onEventRef.current) {
          onEventRef.current(data)
        }
      } catch (e) {
        console.error('Failed to parse SSE event:', e)
      }
    }

    eventSource.onerror = () => {
      setConnected(false)
      setError(new Error('SSE connection error'))

      // Attempt reconnect
      if (reconnectAttemptsRef.current < maxReconnectAttempts) {
        reconnectAttemptsRef.current++
        const delay = reconnectInterval * Math.pow(2, Math.min(reconnectAttemptsRef.current - 1, 5))

        reconnectTimeoutRef.current = setTimeout(() => {
          disconnect()
          connect()
        }, delay)
      }
    }

    // Start heartbeat check
    heartbeatCheckRef.current = setInterval(() => {
      const now = Date.now()
      if (now - lastHeartbeatRef.current > heartbeatTimeout) {
        console.warn('SSE heartbeat timeout, reconnecting...')
        disconnect()
        connect()
      }
    }, 10000) // Check every 10 seconds
  }, [baseUrl, reconnectInterval, maxReconnectAttempts, heartbeatTimeout, disconnect])

  const reconnect = useCallback(() => {
    disconnect()
    setError(null)
    connect()
  }, [disconnect, connect])

  useEffect(() => {
    connect()
    return () => {
      disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only run once on mount

  return { connected, error, disconnect, reconnect }
}
