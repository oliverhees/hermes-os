import type { ReactNode } from 'react'
import { ProgressIndicator } from './ProgressIndicator'

export type WizardStep = {
  id: string
  label: string
  done: boolean
  current: boolean
}

interface WizardLayoutProps {
  steps: WizardStep[]
  children: ReactNode
}

export function WizardLayout({ steps, children }: WizardLayoutProps) {
  return (
    <div className="flex min-h-screen bg-primary-50 dark:bg-zinc-950">
      <aside className="w-72 border-r border-primary-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8 shrink-0">
        <h1 className="text-xl font-bold text-primary-900 dark:text-white mb-2">hermes-os</h1>
        <p className="text-sm text-primary-500 dark:text-zinc-400 mb-8">Initial setup</p>
        <ProgressIndicator steps={steps} />
      </aside>
      <main className="flex-1 p-12 overflow-y-auto">
        <div className="max-w-2xl mx-auto">{children}</div>
      </main>
    </div>
  )
}
