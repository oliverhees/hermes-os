import { useState } from 'react'
import { StepCard } from '@/components/wizard/StepCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormError } from '@/components/wizard/FormError'
import { setupApi } from '@/lib/api'

interface StepVaultProps {
  onNext: () => void
}

export function StepVault({ onNext }: StepVaultProps) {
  const [forgejoUrl, setForgejoUrl] = useState('')
  const [apiToken, setApiToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await setupApi.setVault(forgejoUrl, apiToken)
      onNext()
    } catch (err: any) {
      setError(err.body?.error ?? err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <StepCard
      title="Connect your Forgejo vault"
      description="Your knowledge vault repos will be cloned and synced from this Forgejo instance."
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1.5 text-primary-900 dark:text-zinc-300">
            Forgejo URL
          </label>
          <Input
            type="url"
            value={forgejoUrl}
            onChange={(e) => setForgejoUrl(e.target.value)}
            placeholder="https://git.example.com"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5 text-primary-900 dark:text-zinc-300">
            API Token
          </label>
          <Input
            type="password"
            value={apiToken}
            onChange={(e) => setApiToken(e.target.value)}
            placeholder="forgejo_pat_..."
            required
            minLength={20}
          />
          <p className="text-xs text-primary-500 mt-1">
            Token needs <code className="bg-primary-100 dark:bg-zinc-800 px-1 rounded">repo</code> +{' '}
            <code className="bg-primary-100 dark:bg-zinc-800 px-1 rounded">user:read</code> scopes. Stored encrypted.
          </p>
        </div>
        <FormError message={error} />
        <div className="flex justify-end pt-4">
          <Button type="submit" disabled={loading}>
            {loading ? 'Saving...' : 'Save and finalize'}
          </Button>
        </div>
      </form>
    </StepCard>
  )
}
