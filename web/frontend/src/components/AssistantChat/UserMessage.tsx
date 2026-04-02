import { MessagePrimitive } from '@assistant-ui/react'

export function UserMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-end gap-3">
      <div className="flex flex-col items-end max-w-[80%]">
        <div className="bg-blue-600 text-white px-4 py-2 rounded-2xl rounded-br-sm">
          <MessagePrimitive.Content />
        </div>
      </div>
    </MessagePrimitive.Root>
  )
}
