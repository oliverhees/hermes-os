import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { signIn } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormError } from '@/components/wizard/FormError'

export function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { data, error } = await signIn.email({ email, password })
      if (error) throw new Error(error.message ?? 'Sign-in failed')
      if ((data as any)?.twoFactorRedirect) {
        navigate({ to: '/login/2fa' })
        return
      }
      // Hard reload so the session cookie is picked up before AppGate fires
      window.location.replace('/')
    } catch (err: any) {
      setError(err.message ?? 'Sign-in failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-primary-50 dark:bg-zinc-950 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-zinc-900 p-8 shadow-xl shadow-primary-900/5 ring-1 ring-primary-200 dark:ring-zinc-800">
        <h1 className="text-2xl font-bold mb-6 text-primary-900 dark:text-white">Sign in to hermes-os</h1>
        <form onSubmit={submit} className="space-y-4">
          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <FormError message={error} />
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Signing in...' : 'Sign in'}
          </Button>
        </form>
      </div>
    </div>
  )
}
