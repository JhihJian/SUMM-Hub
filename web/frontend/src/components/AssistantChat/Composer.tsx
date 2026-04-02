import { ComposerPrimitive } from '@assistant-ui/react'

interface SummComposerProps {
  placeholder?: string
}

export function SummComposer({
  placeholder = 'Type a message...',
}: SummComposerProps) {
  return (
    <div className="border-t border-gray-200 bg-white p-4">
      <ComposerPrimitive.Root className="flex items-end gap-2 mx-auto max-w-3xl">
        <ComposerPrimitive.Input
          placeholder={placeholder}
          className="flex-1 resize-none border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
          rows={1}
        />
        <ComposerPrimitive.Send className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          Send
        </ComposerPrimitive.Send>
        <ComposerPrimitive.Cancel className="hidden px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          Cancel
        </ComposerPrimitive.Cancel>
      </ComposerPrimitive.Root>
      <p className="text-xs text-gray-500 mt-1 text-center">
        Press Enter to send, Shift+Enter for new line
      </p>
    </div>
  )
}
