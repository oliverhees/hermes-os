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
  { id: 'custom', label: 'Custom (OpenAI-compatible)' },
] as const

type ProviderId = typeof PROVIDERS[number]['id']

export function StepProvider({ onNext }: StepProviderProps) {
  const [provider, setProviderState] = useState<ProviderId>('anthropic')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [availableModels, setAvailableModels] = useState<string[] | null>(null)
  const [probeLoading, setProbeLoading] = useState(false)
  const [probeError, setProbeError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function selectProvider(id: ProviderId) {
    setProviderState(id)
    setAvailableModels(null)
    setProbeError(null)
    setModel('')
  }

  async function probeModels() {
    setProbeError(null)
    setProbeLoading(true)
    setAvailableModels(null)
    setModel('')
    try {
      const result = await setupApi.probeModels(baseUrl, apiKey)
      setAvailableModels(result.models)
    } catch (err: any) {
      setProbeError(err.body?.detail ?? err.body?.error ?? err.message)
    } finally {
      setProbeLoading(false)
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (provider === 'custom' && !availableModels) {
      setError('Please test the connection first.')
      return
    }
    setLoading(true)
    try {
      await setupApi.setProvider(
        provider,
        apiKey,
        model || undefined,
        provider === 'custom' ? baseUrl : undefined,
      )
      onNext()
    } catch (err: any) {
      setError(err.body?.error ?? err.message)
    } finally {
      setLoading(false)
    }
  }

  const isCustom = provider === 'custom'
  const needsApiKey = provider !== 'ollama'

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
                onClick={() => selectProvider(p.id)}
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

        {isCustom && (
          <div>
            <label className="block text-sm font-medium mb-1.5 text-primary-900 dark:text-zinc-300">
              Base URL
            </label>
            <Input
              value={baseUrl}
              onChange={(e) => { setBaseUrl(e.target.value); setAvailableModels(null) }}
              placeholder="https://api.trooper.ai"
              required
            />
          </div>
        )}

        {needsApiKey && (
          <div>
            <label className="block text-sm font-medium mb-1.5 text-primary-900 dark:text-zinc-300">
              API Key{isCustom ? ' (optional)' : ''}
            </label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => { setApiKey(e.target.value); if (isCustom) setAvailableModels(null) }}
              placeholder={
                provider === 'anthropic' ? 'sk-ant-...' :
                provider === 'openrouter' ? 'sk-or-...' :
                isCustom ? 'Bearer token (if required)' :
                'sk-...'
              }
              required={!isCustom}
              minLength={isCustom ? undefined : 20}
            />
          </div>
        )}

        {isCustom && (
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={probeModels}
              disabled={probeLoading || !baseUrl}
            >
              {probeLoading ? 'Testing…' : 'Test & fetch models'}
            </Button>
            {availableModels && (
              <span className="text-sm text-green-600 dark:text-green-400">
                ✓ {availableModels.length} model{availableModels.length !== 1 ? 's' : ''} found
              </span>
            )}
          </div>
        )}

        {probeError && <FormError message={probeError} />}

        {isCustom && availableModels ? (
          <div>
            <label className="block text-sm font-medium mb-1.5 text-primary-900 dark:text-zinc-300">
              Model
            </label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              required
              className="w-full rounded-md border border-primary-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm"
            >
              <option value="">Select a model…</option>
              {availableModels.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        ) : !isCustom ? (
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
        ) : null}

        <FormError message={error} />

        <div className="flex justify-end pt-4">
          <Button type="submit" disabled={loading}>
            {loading ? 'Saving…' : 'Save and continue'}
          </Button>
        </div>
      </form>
    </StepCard>
  )
}
