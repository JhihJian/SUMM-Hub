import type { Session } from '../types'

interface SessionListProps {
  sessions: Session[]
  selectedId: string | null
  onSelect: (id: string) => void
  onNewSession: () => void
  isLoading?: boolean
}

export function SessionList({
  sessions,
  selectedId,
  onSelect,
  onNewSession,
  isLoading,
}: SessionListProps) {
  return (
    <div className="flex flex-col h-full bg-gray-50 border-r border-gray-200">
      {/* Header with New Session button */}
      <div className="p-4 border-b border-gray-200">
        <button
          onClick={onNewSession}
          disabled={isLoading}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          + New Session
        </button>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto">
        {sessions.length === 0 ? (
          <div className="p-4 text-center text-gray-500">
            No sessions yet. Create one to get started.
          </div>
        ) : (
          <ul className="divide-y divide-gray-200">
            {sessions.map((session) => (
              <li key={session.id}>
                <button
                  onClick={() => onSelect(session.id)}
                  className={`w-full px-4 py-3 text-left hover:bg-gray-100 transition-colors ${
                    selectedId === session.id ? 'bg-blue-50 border-l-4 border-blue-600' : ''
                  }`}
                >
                  <div className="text-sm font-medium text-gray-900 truncate">
                    {session.id}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {new Date(session.updatedAt).toLocaleDateString()}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Loading indicator */}
      {isLoading && (
        <div className="p-2 text-center text-sm text-gray-500">
          Loading...
        </div>
      )}
    </div>
  )
}
