import { AlertCircleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'

export function FormError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div className="mt-3 flex items-start gap-2 rounded-md bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 p-3 text-sm text-red-700 dark:text-red-300">
      <HugeiconsIcon icon={AlertCircleIcon} size={16} className="shrink-0 mt-0.5" />
      <span>{message}</span>
    </div>
  )
}
