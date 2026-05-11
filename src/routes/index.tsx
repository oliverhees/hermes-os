import { createFileRoute, redirect } from '@tanstack/react-router'
import { Dashboard } from '@/pages/Dashboard'

export const Route = createFileRoute('/')({
  ssr: false,
  beforeLoad: function redirectToSetup() {
    throw redirect({
      to: '/setup' as string,
      replace: true,
    })
  },
  component: function IndexRoute() {
    return <Dashboard />
  },
})
