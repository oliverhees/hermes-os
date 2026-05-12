import { useEffect } from 'react'
import { useNavigate, useLocation } from '@tanstack/react-router'
import { useSetupStatus } from '@/lib/setup-status'
import { useSession } from '@/lib/auth-client'
import { BrailleSpinner } from '@/components/ui/braille-spinner'

export function AppGate({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { status, loading } = useSetupStatus()
  const session = useSession()

  const path = location.pathname

  useEffect(() => {
    if (loading || session.isPending) return

    const setupComplete = status?.completed === true
    const isSetupPath = path.startsWith('/setup')
    const isAuthPath = path === '/login' || path === '/login/2fa'

    if (status !== null && !setupComplete) {
      if (!isSetupPath) navigate({ to: '/setup' }, { replace: true })
      return
    }

    if (isSetupPath) {
      navigate({ to: session.data ? '/' : '/login' }, { replace: true })
      return
    }
    if (!session.data && !isAuthPath) {
      navigate({ to: '/login' }, { replace: true })
    }
  }, [loading, session.isPending, status?.completed, session.data, path, navigate])

  if (loading || session.isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-primary-50 dark:bg-zinc-950">
        <BrailleSpinner size={48} color="var(--color-primary-400)" />
      </div>
    )
  }

  return <>{children}</>
}
