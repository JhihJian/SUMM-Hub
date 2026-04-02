import { AssistantRuntimeProvider } from '@assistant-ui/react'
import { useSummRuntime } from '../../lib/assistant-runtime'
import { SummThread } from './Thread'
import { SummComposer } from './Composer'
import type { Message } from '../../types'

interface AssistantChatProps {
  messages: Message[]
  isDisabled?: boolean
  isRunning?: boolean
  onSendMessage: (content: string) => Promise<void>
  onCancel?: () => void
  placeholder?: string
}

export function AssistantChat({
  messages,
  isDisabled = false,
  isRunning = false,
  onSendMessage,
  onCancel,
  placeholder = 'Type a message...',
}: AssistantChatProps) {
  const runtime = useSummRuntime({
    messages,
    isDisabled,
    isRunning,
    onSendMessage,
    onCancel,
  })

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="flex flex-col h-full bg-white">
        <SummThread />
        <SummComposer placeholder={placeholder} />
      </div>
    </AssistantRuntimeProvider>
  )
}
