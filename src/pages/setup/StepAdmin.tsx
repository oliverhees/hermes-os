import { useState } from 'react'
import { StepCard } from '@/components/wizard/StepCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormError } from '@/components/wizard/FormError'
import { signUp } from '@/lib/auth-client'

interface StepAdminProps {
  onNext: () => void
}

export function StepAdmin({ onNext }: StepAdminProps) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { error: signUpError } = await signUp.email({ email, password, name })
      if (signUpError) {
        setError(signUpError.message ?? 'Sign-up failed')
        return
      }
      onNext()
    } catch (err: any) {
      setError(err.message ?? 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <StepCard
      title="Create your admin account"
      description="This is the first user — it will automatically receive the admin role."
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1.5 text-primary-900 dark:text-zinc-300">
            Name
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
            placeholder="Your name"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5 text-primary-900 dark:text-zinc-300">
            Email
          </label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5 text-primary-900 dark:text-zinc-300">
            Password
          </label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={12}
            placeholder="Minimum 12 characters"
          />
          <p className="text-xs text-primary-500 mt-1">Minimum 12 characters. We use Argon2id.</p>
        </div>
        <FormError message={error} />
        <div className="flex justify-end pt-4">
          <Button type="submit" disabled={loading}>
            {loading ? 'Creating account...' : 'Create account'}
          </Button>
        </div>
      </form>
    </StepCard>
  )
}
