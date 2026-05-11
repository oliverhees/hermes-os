import type { ReactNode } from 'react'

interface Props {
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
}

export function StepCard({ title, description, children, footer }: Props) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-sm border border-primary-200 dark:border-zinc-800">
      <div className="px-8 py-6 border-b border-primary-200 dark:border-zinc-800">
        <h2 className="text-xl font-semibold text-primary-900 dark:text-white">{title}</h2>
        {description && (
          <p className="mt-1 text-sm text-primary-500 dark:text-zinc-400">{description}</p>
        )}
      </div>
      <div className="px-8 py-6">{children}</div>
      {footer && (
        <div className="px-8 py-4 bg-primary-50 dark:bg-zinc-900/50 border-t border-primary-200 dark:border-zinc-800 rounded-b-lg">
          {footer}
        </div>
      )}
    </div>
  )
}
