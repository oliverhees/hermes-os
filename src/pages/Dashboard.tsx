import { useSession, signOut } from '@/lib/auth-client'
import { useNavigate } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'

export function Dashboard() {
  const { data: session } = useSession()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate({ to: '/login' })
  }

  return (
    <div className="min-h-screen bg-primary-50 dark:bg-zinc-950 p-8">
      <div className="max-w-5xl mx-auto">
        <header className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-primary-900 dark:text-white">hermes-os</h1>
          <div className="flex items-center gap-3">
            <span className="text-sm text-primary-500">{session?.user?.email}</span>
            <Button variant="ghost" onClick={handleSignOut}>
              Sign out
            </Button>
          </div>
        </header>

        <div className="rounded-xl bg-white dark:bg-zinc-900 shadow-sm border border-primary-200 dark:border-zinc-800 p-8">
          <h2 className="text-xl font-semibold mb-2 text-primary-900 dark:text-white">
            Welcome, {session?.user?.name}
          </h2>
          <p className="text-primary-500 mb-6">Your hermes-os instance is up and running.</p>

          <div className="p-6 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-md">
            <h3 className="font-medium mb-2 text-primary-900 dark:text-white">Provision your first agent</h3>
            <p className="text-sm text-primary-600 dark:text-zinc-400 mb-3">
              Spin up a dedicated hermes-agent container for yourself.
            </p>
            <Button disabled>Coming soon — Phase 3</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
