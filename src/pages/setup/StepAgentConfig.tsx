import { useState } from 'react'
import { StepCard } from '@/components/wizard/StepCard'
import { Button } from '@/components/ui/button'
import { FormError } from '@/components/wizard/FormError'
import { setupApi } from '@/lib/api'

interface StepAgentConfigProps {
  onNext: () => void
}

const PROVIDERS = [
  { id: 'anthropic', label: 'Anthropic', keyLabel: 'API Key (sk-ant-...)', placeholder: 'sk-ant-api03-...' },
  { id: 'openai', label: 'OpenAI', keyLabel: 'API Key (sk-...)', placeholder: 'sk-...' },
  { id: 'openrouter', label: 'OpenRouter', keyLabel: 'API Key', placeholder: 'sk-or-v1-...' },
  { id: 'google', label: 'Google Gemini', keyLabel: 'API Key', placeholder: 'AIzaSy...' },
  { id: 'ollama', label: 'Ollama', keyLabel: null, placeholder: null },
] as const

type ProviderId = (typeof PROVIDERS)[number]['id']

export function StepAgentConfig({ onNext }: StepAgentConfigProps) {
  const [provider, setProvider] = useState<ProviderId>('anthropic')
  const [apiKey, setApiKey] = useState('')
  const [ollamaUrl, setOllamaUrl] = useState('http://host.docker.internal:11434')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selected = PROVIDERS.find(p => p.id === provider)!
  const isValid = provider === 'ollama' ? ollamaUrl.length > 0 : apiKey.length >= 10

  async function save() {
    setError(null)
    setLoading(true)
    try {
      await setupApi.configureAgent(
        provider,
        provider !== 'ollama' ? apiKey : undefined,
        undefined,
        provider === 'ollama' ? ollamaUrl : undefined,
      )
      onNext()
    } catch (err: any) {
      setError(err.body?.error ?? err.body?.detail ?? err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <StepCard
      title="KI-Provider konfigurieren"
      description="Wähle den LLM-Anbieter für den Hermes Agent."
      footer={
        <div className="flex justify-between items-center">
          <button
            type="button"
            onClick={onNext}
            className="text-sm text-primary-500 hover:text-primary-700 dark:hover:text-zinc-300 underline"
          >
            Überspringen
          </button>
          <Button onClick={save} disabled={loading || !isValid}>
            {loading ? 'Wird konfiguriert…' : 'Speichern & weiter'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {PROVIDERS.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => setProvider(p.id)}
              className={`px-3 py-2 rounded-md border text-sm font-medium transition-colors ${
                provider === p.id
                  ? 'border-accent-500 bg-accent-50 dark:bg-accent-900/20 text-accent-700 dark:text-accent-400'
                  : 'border-primary-200 dark:border-zinc-700 text-primary-700 dark:text-zinc-300 hover:border-primary-400'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {provider !== 'ollama' && (
          <div className="space-y-1">
            <label className="block text-sm text-primary-600 dark:text-zinc-400">
              {selected.keyLabel}
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder={selected.placeholder ?? ''}
              autoComplete="off"
              className="w-full rounded-md border border-primary-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-accent-500"
            />
          </div>
        )}

        {provider === 'ollama' && (
          <div className="space-y-1">
            <label className="block text-sm text-primary-600 dark:text-zinc-400">Ollama URL</label>
            <input
              type="text"
              value={ollamaUrl}
              onChange={e => setOllamaUrl(e.target.value)}
              className="w-full rounded-md border border-primary-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-accent-500"
            />
          </div>
        )}

        <FormError message={error} />
      </div>
    </StepCard>
  )
}
