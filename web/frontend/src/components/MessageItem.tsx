import type { Message } from '../types'

interface MessageItemProps {
  message: Message
}

export function MessageItem({ message }: MessageItemProps) {
  const isUser = message.role === 'user'

  return (
    <div
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}
    >
      <div
        className={`max-w-[80%] px-4 py-2 rounded-lg ${
          isUser
            ? 'bg-blue-600 text-white'
            : 'bg-gray-200 text-gray-900'
        }`}
      >
        <div className="whitespace-pre-wrap break-words">
          {message.content}
        </div>
        <div
          className={`text-xs mt-1 ${
            isUser ? 'text-blue-200' : 'text-gray-500'
          }`}
        >
          {new Date(message.timestamp).toLocaleTimeString()}
        </div>
      </div>
    </div>
  )
}
