import { createFileRoute } from '@tanstack/react-router'
import { SetupWizard } from '@/pages/setup/SetupWizard'

export const Route = createFileRoute('/setup')({
  component: SetupRoute,
})

function SetupRoute() {
  return <SetupWizard />
}
