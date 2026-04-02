import { MessagePrimitive } from '@assistant-ui/react'
import { MarkdownTextPrimitive } from '@assistant-ui/react-markdown'
import remarkGfm from 'remark-gfm'

export function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-start gap-3">
      {/* Avatar */}
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
        <svg
          className="w-5 h-5 text-gray-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
          />
        </svg>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 prose prose-sm max-w-none dark:prose-invert">
        <MarkdownTextPrimitive remarkPlugins={[remarkGfm]} />
      </div>
    </MessagePrimitive.Root>
  )
}
