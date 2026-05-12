import { createFileRoute, redirect } from '@tanstack/react-router'
import { SetupWizard } from '@/pages/setup/SetupWizard'

export const Route = createFileRoute('/setup')({
  ssr: false,
  beforeLoad: async function guardSetup() {
    try {
      const res = await fetch('/api/setup/status')
      if (res.ok) {
        const data = (await res.json()) as { completed: boolean }
        if (data.completed) {
          throw redirect({ to: '/chat', replace: true })
        }
      }
    } catch (err: any) {
      if (err?.isRedirect) throw err
    }
  },
  component: SetupRoute,
})

function SetupRoute() {
  return <SetupWizard />
}
