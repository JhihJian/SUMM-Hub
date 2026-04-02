import { useCallback, useMemo } from 'react'
import {
  useExternalMessageConverter,
  useExternalStoreRuntime,
  type AppendMessage,
  type ThreadMessageLike,
} from '@assistant-ui/react'
import type { Message } from '../types'

/**
 * Convert our Message format to assistant-ui ThreadMessageLike
 */
function toThreadMessageLike(message: Message): ThreadMessageLike {
  if (message.role === 'user') {
    return {
      role: 'user',
      id: message.id,
      createdAt: new Date(message.timestamp),
      content: [{ type: 'text', text: message.content }],
    }
  }

  return {
    role: 'assistant',
    id: message.id,
    createdAt: new Date(message.timestamp),
    content: [{ type: 'text', text: message.content }],
  }
}

type TextMessagePart = { type: 'text'; text: string }

function getTextFromParts(parts: readonly { type: string }[] | undefined): string {
  if (!parts) return ''

  return parts
    .filter((part): part is TextMessagePart => part.type === 'text' && typeof (part as TextMessagePart).text === 'string')
    .map((part) => part.text)
    .join('\n')
    .trim()
}

function extractMessageContent(message: AppendMessage): string {
  if (message.role !== 'user') return ''
  return getTextFromParts(message.content)
}

interface UseSummRuntimeOptions {
  messages: Message[]
  isDisabled?: boolean
  isRunning?: boolean
  onSendMessage: (content: string) => Promise<void>
  onCancel?: () => void
}

/**
 * Create an assistant-ui runtime adapter for SUMM-Hub messages
 */
export function useSummRuntime({
  messages,
  isDisabled = false,
  isRunning = false,
  onSendMessage,
  onCancel,
}: UseSummRuntimeOptions) {
  // Convert messages using the cached converter hook
  const convertedMessages = useExternalMessageConverter<Message>({
    callback: toThreadMessageLike,
    messages,
    isRunning,
  })

  // Handle new message
  const onNew = useCallback(async (message: AppendMessage) => {
    const text = extractMessageContent(message)
    if (text) {
      await onSendMessage(text)
    }
  }, [onSendMessage])

  // Handle cancel
  const onCancelCallback = useCallback(async () => {
    onCancel?.()
  }, [onCancel])

  // Create adapter
  const adapter = useMemo(
    () => ({
      isDisabled,
      isRunning,
      messages: convertedMessages,
      onNew,
      onCancel: onCancelCallback,
    }),
    [convertedMessages, isDisabled, isRunning, onNew, onCancelCallback]
  )

  return useExternalStoreRuntime(adapter)
}
