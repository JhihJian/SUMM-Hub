import { useEffect, useRef, useState } from 'react'
import { ThreadPrimitive } from '@assistant-ui/react'
import { UserMessage } from './UserMessage'
import { AssistantMessage } from './AssistantMessage'

// Message components mapping
const MESSAGE_COMPONENTS = {
  UserMessage,
  AssistantMessage,
}

export function SummThread() {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true)
  const autoScrollEnabledRef = useRef(autoScrollEnabled)

  // Keep refs in sync
  useEffect(() => {
    autoScrollEnabledRef.current = autoScrollEnabled
  }, [autoScrollEnabled])

  // Track scroll position to toggle autoScroll
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const THRESHOLD_PX = 120

    const handleScroll = () => {
      const distanceFromBottom =
        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight
      const isNearBottom = distanceFromBottom < THRESHOLD_PX

      if (isNearBottom !== autoScrollEnabledRef.current) {
        setAutoScrollEnabled(isNearBottom)
      }
    }

    viewport.addEventListener('scroll', handleScroll, { passive: true })
    return () => viewport.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col relative">
      <ThreadPrimitive.Viewport
        ref={viewportRef}
        autoScroll={autoScrollEnabled}
        className="flex-1 overflow-y-auto overflow-x-hidden px-4"
      >
        <div className="mx-auto max-w-3xl py-4">
          <div className="flex flex-col gap-4">
            <ThreadPrimitive.Messages components={MESSAGE_COMPONENTS} />
          </div>
        </div>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  )
}
