import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  ssr: false,
  beforeLoad: async function redirectToApp() {
    try {
      const res = await fetch('/api/setup/status')
      if (res.ok) {
        const data = (await res.json()) as { completed: boolean }
        if (!data.completed) {
          throw redirect({ to: '/setup', replace: true })
        }
      }
    } catch (err: any) {
      if (err?.isRedirect) throw err
      // Fetch failed — fall through to /chat (auth handles unauthenticated users)
    }
    throw redirect({ to: '/chat', replace: true })
  },
  component: function IndexRoute() {
    return null
  },
})
