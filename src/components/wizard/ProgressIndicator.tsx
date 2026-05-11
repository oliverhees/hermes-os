import type { WizardStep } from './WizardLayout'
import { CheckmarkCircle02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'

interface Props {
  steps: WizardStep[]
}

export function ProgressIndicator({ steps }: Props) {
  return (
    <ol className="space-y-3">
      {steps.map((step, i) => (
        <li key={step.id} className="flex items-center gap-3">
          <span
            className={[
              'w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold border shrink-0',
              step.done
                ? 'bg-green-600 text-white border-green-600'
                : step.current
                ? 'bg-accent-500 text-white border-accent-500'
                : 'bg-white text-primary-400 border-primary-200 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-500',
            ].join(' ')}
          >
            {step.done ? (
              <HugeiconsIcon icon={CheckmarkCircle02Icon} size={14} />
            ) : (
              i + 1
            )}
          </span>
          <span
            className={[
              'text-sm',
              step.current
                ? 'font-medium text-primary-900 dark:text-white'
                : 'text-primary-500 dark:text-zinc-500',
            ].join(' ')}
          >
            {step.label}
          </span>
        </li>
      ))}
    </ol>
  )
}
