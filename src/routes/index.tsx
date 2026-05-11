import { createFileRoute, redirect } from '@tanstack/react-router'
import { useEffect } from 'react'
import { Dashboard } from '@/pages/Dashboard'
import { useSetupStatus } from '@/lib/setup-status'
import { useSession } from '@/lib/auth-client'
import { BrailleSpinner } from '@/components/ui/braille-spinner'

export const Route = createFileRoute('/')({
  ssr: false,
  component: IndexRoute,
})

function IndexRoute() {
  const { status, loading } = useSetupStatus()
  const session = useSession()

  if (loading || session.isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-primary-50 dark:bg-zinc-950">
        <BrailleSpinner size={48} color="var(--color-primary-400)" />
      </div>
    )
  }

  if (!status?.completed) {
    throw redirect({ to: '/setup', replace: true })
  }

  if (!session.data) {
    throw redirect({ to: '/login', replace: true })
  }

  return <Dashboard />
}
