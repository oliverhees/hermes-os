import { useState } from 'react'
import { StepCard } from '@/components/wizard/StepCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormError } from '@/components/wizard/FormError'
import { setupApi } from '@/lib/api'

interface StepProviderProps {
  onNext: () => void
}

const PROVIDERS = [
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'openrouter', label: 'OpenRouter' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'google', label: 'Google AI' },
  { id: 'ollama', label: 'Ollama (local)' },
] as const

export function StepProvider({ onNext }: StepProviderProps) {
  const [provider, setProvider] = useState<typeof PROVIDERS[number]['id']>('anthropic')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await setupApi.setProvider(provider, apiKey, model || undefined)
      onNext()
    } catch (err: any) {
      setError(err.body?.error ?? err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <StepCard
      title="Connect your LLM provider"
      description="The API key is encrypted (AES-256-GCM) before it's stored."
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2 text-primary-900 dark:text-zinc-300">
            Provider
          </label>
          <div className="grid grid-cols-2 gap-2">
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setProvider(p.id)}
                className={[
                  'px-4 py-3 text-sm rounded-md border text-left transition-colors',
                  provider === p.id
                    ? 'border-accent-500 bg-accent-50 dark:bg-accent-950/40 text-accent-700 dark:text-accent-300'
                    : 'border-primary-200 dark:border-zinc-700 hover:border-primary-300 dark:hover:border-zinc-600',
                ].join(' ')}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {provider !== 'ollama' && (
          <div>
            <label className="block text-sm font-medium mb-1.5 text-primary-900 dark:text-zinc-300">
              API Key
            </label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={provider === 'anthropic' ? 'sk-ant-...' : provider === 'openrouter' ? 'sk-or-...' : 'sk-...'}
              required
              minLength={20}
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-1.5 text-primary-900 dark:text-zinc-300">
            Model (optional)
          </label>
          <Input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="e.g. claude-sonnet-4-5 or gpt-4o"
          />
          <p className="text-xs text-primary-500 mt-1">Leave blank to use the provider default.</p>
        </div>

        <FormError message={error} />

        <div className="flex justify-end pt-4">
          <Button type="submit" disabled={loading}>
            {loading ? 'Saving...' : 'Save and continue'}
          </Button>
        </div>
      </form>
    </StepCard>
  )
}
