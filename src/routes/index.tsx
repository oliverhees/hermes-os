import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  ssr: false,
  beforeLoad: function redirectToSetup() {
    throw redirect({
      to: '/setup' as string,
      replace: true,
    })
  },
  component: function IndexRoute() {
    return null
  },
})
