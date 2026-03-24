import { useEffect, useRef } from 'react'
import type { Message } from '../types'
import { MessageItem } from './MessageItem'

interface MessageListProps {
  messages: Message[]
  isLoading?: boolean
}

export function MessageList({ messages, isLoading }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const prevLengthRef = useRef(0)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > prevLengthRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
    prevLengthRef.current = messages.length
  }, [messages.length])

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto p-4 bg-white"
    >
      {messages.length === 0 ? (
        <div className="h-full flex items-center justify-center text-gray-500">
          <p>No messages yet. Start a conversation!</p>
        </div>
      ) : (
        <>
          {messages.map((message) => (
            <MessageItem key={message.id} message={message} />
          ))}
          {isLoading && (
            <div className="flex justify-start mb-4">
              <div className="bg-gray-200 text-gray-900 px-4 py-2 rounded-lg">
                <div className="flex items-center space-x-2">
                  <div className="animate-pulse">●</div>
                  <div className="animate-pulse delay-75">●</div>
                  <div className="animate-pulse delay-150">●</div>
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </>
      )}
    </div>
  )
}
