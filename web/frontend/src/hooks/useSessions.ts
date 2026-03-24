import { useState, useCallback, useEffect } from 'react'
import type { Session, Message, SSEEvent } from '../types'
import { apiClient } from '../api/client'

interface UseSessionsOptions {
  autoLoad?: boolean
}

interface UseSessionsReturn {
  sessions: Session[]
  currentSessionId: string | null
  currentSession: Session | null
  messages: Map<string, Message[]>
  isLoading: boolean
  error: Error | null
  loadSessions: () => Promise<void>
  createSession: () => Promise<Session>
  selectSession: (id: string) => void
  sendMessage: (content: string) => Promise<void>
  handleSSEEvent: (event: SSEEvent) => void
}

export function useSessions(options: UseSessionsOptions = {}): UseSessionsReturn {
  const { autoLoad = true } = options

  const [sessions, setSessions] = useState<Session[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Map<string, Message[]>>(new Map())
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  // Load all sessions
  const loadSessions = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await apiClient.getSessions()
      setSessions(response.sessions)
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Failed to load sessions'))
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Create a new session
  const createSession = useCallback(async () => {
    setError(null)

    try {
      const response = await apiClient.createSession()
      const session = response.session

      setSessions(prev => [session, ...prev])
      setMessages(prev => new Map(prev).set(session.id, []))
      setCurrentSessionId(session.id)

      return session
    } catch (e) {
      const err = e instanceof Error ? e : new Error('Failed to create session')
      setError(err)
      throw err
    }
  }, [])

  // Select a session
  const selectSession = useCallback((id: string) => {
    setCurrentSessionId(id)
  }, [])

  // Send a message to the current session
  const sendMessage = useCallback(async (content: string) => {
    if (!currentSessionId) {
      throw new Error('No session selected')
    }

    setError(null)

    // Optimistic update - add user message immediately
    const tempMessage: Message = {
      id: `temp-${Date.now()}`,
      sessionId: currentSessionId,
      role: 'user',
      content,
      timestamp: Date.now(),
    }

    setMessages(prev => {
      const newMap = new Map(prev)
      const sessionMessages = newMap.get(currentSessionId) || []
      newMap.set(currentSessionId, [...sessionMessages, tempMessage])
      return newMap
    })

    try {
      await apiClient.sendMessage(currentSessionId, content)
    } catch (e) {
      // Rollback optimistic update on error
      setMessages(prev => {
        const newMap = new Map(prev)
        const sessionMessages = newMap.get(currentSessionId) || []
        newMap.set(currentSessionId, sessionMessages.filter(m => m.id !== tempMessage.id))
        return newMap
      })

      const err = e instanceof Error ? e : new Error('Failed to send message')
      setError(err)
      throw err
    }
  }, [currentSessionId])

  // Handle SSE events
  const handleSSEEvent = useCallback((event: SSEEvent) => {
    switch (event.type) {
      case 'message':
        // Add assistant message
        setMessages(prev => {
          const sessionId = event.data.sessionId
          const newMap = new Map(prev)
          const sessionMessages = newMap.get(sessionId) || []
          newMap.set(sessionId, [...sessionMessages, event.data])
          return newMap
        })
        break

      case 'session-created':
        // Add new session to list
        setSessions(prev => {
          if (prev.some(s => s.id === event.data.id)) {
            return prev
          }
          return [event.data, ...prev]
        })
        break

      case 'error':
        // Handle error event
        console.error('Session error:', event.data)
        break
    }
  }, [])

  // Auto-load sessions on mount
  useEffect(() => {
    if (autoLoad) {
      loadSessions()
    }
  }, [autoLoad, loadSessions])

  const currentSession = currentSessionId
    ? sessions.find(s => s.id === currentSessionId) || null
    : null

  return {
    sessions,
    currentSessionId,
    currentSession,
    messages,
    isLoading,
    error,
    loadSessions,
    createSession,
    selectSession,
    sendMessage,
    handleSSEEvent,
  }
}
