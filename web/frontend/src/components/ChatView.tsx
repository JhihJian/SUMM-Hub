import type { Message } from '../types'
import { MessageList } from './MessageList'
import { ChatInput } from './ChatInput'

interface ChatViewProps {
  messages: Message[] | null
  onSendMessage: (content: string) => void
  isLoading?: boolean
  isDisabled?: boolean
  placeholder?: string
}

export function ChatView({
  messages,
  onSendMessage,
  isLoading = false,
  isDisabled = false,
  placeholder = 'Type a message...',
}: ChatViewProps) {
  // No session selected - show empty state
  if (messages === null) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50 text-gray-500">
        <p>Select a session or create a new one to start chatting.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Messages area */}
      <MessageList
        messages={messages}
        isLoading={isLoading}
      />

      {/* Input area */}
      <ChatInput
        onSend={onSendMessage}
        disabled={isDisabled || isLoading}
        placeholder={placeholder}
      />
    </div>
  )
}
