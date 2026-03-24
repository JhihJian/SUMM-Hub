import { useCallback, useEffect } from 'react'
import { SessionList } from './components/SessionList'
import { ChatView } from './components/ChatView'
import { useSSE } from './hooks/useSSE'
import { useSessions } from './hooks/useSessions'
import type { SSEEvent } from './types'

function App() {
  // Session state management
  const {
    sessions,
    currentSessionId,
    currentSession,
    messages,
    isLoading: isSessionsLoading,
    createSession,
    selectSession,
    sendMessage,
    handleSSEEvent,
    loadSessions,
  } = useSessions()

  // SSE connection
  const { connected: sseConnected, error: sseError } = useSSE({
    onEvent: (event: unknown) => {
      handleSSEEvent(event as SSEEvent)
    },
  })

  // Load sessions on mount
  useEffect(() => {
    loadSessions()
  }, [loadSessions])

  // Handle new session creation
  const handleNewSession = useCallback(async () => {
    await createSession()
  }, [createSession])

  // Handle session selection
  const handleSelectSession = useCallback((id: string) => {
    selectSession(id)
  }, [selectSession])

  // Handle message send
  const handleSendMessage = useCallback(async (content: string) => {
    try {
      await sendMessage(content)
    } catch (error) {
      console.error('Failed to send message:', error)
    }
  }, [sendMessage])

  // Get messages for current session
  const currentMessages = currentSessionId ? messages.get(currentSessionId) ?? [] : null

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Left sidebar - Session list */}
      <div className="w-64 flex-shrink-0">
        <SessionList
          sessions={sessions}
          selectedId={currentSessionId}
          onSelect={handleSelectSession}
          onNewSession={handleNewSession}
          isLoading={isSessionsLoading}
        />
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col">
        {/* Connection status bar */}
        <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div
              className={`w-2 h-2 rounded-full ${
                sseConnected ? 'bg-green-500' : 'bg-red-500'
              }`}
            />
            <span className="text-sm text-gray-600">
              {sseConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          {currentSession && (
            <span className="text-sm text-gray-500">
              {currentSession.id}
            </span>
          )}
        </div>

        {/* Error banner */}
        {sseError && (
          <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-red-700 text-sm">
            {sseError.message}
          </div>
        )}

        {/* Chat view */}
        <div className="flex-1 overflow-hidden">
          <ChatView
            messages={currentMessages}
            onSendMessage={handleSendMessage}
            isDisabled={!sseConnected}
          />
        </div>
      </div>
    </div>
  )
}

export default App
