import { useState, useEffect, useCallback } from 'react'
import { StepCard } from '@/components/wizard/StepCard'
import { Button } from '@/components/ui/button'
import { FormError } from '@/components/wizard/FormError'
import { setupApi } from '@/lib/api'

interface StepAgentProps {
  onNext: () => void
}

type Screen = 'checking' | 'running' | 'offline' | 'installing' | 'error'

function Spinner() {
  return (
    <div
      className="animate-spin h-5 w-5 border-2 border-accent-500 border-t-transparent rounded-full"
      aria-label="Loading"
    />
  )
}

export function StepAgent({ onNext }: StepAgentProps) {
  const [screen, setScreen] = useState<Screen>('checking')
  const [error, setError] = useState<string | null>(null)
  const [installMessage, setInstallMessage] = useState<string | null>(null)

  const checkStatus = useCallback(async () => {
    setScreen('checking')
    setError(null)
    try {
      const result = await setupApi.agentStatus()
      setScreen(result.running ? 'running' : 'offline')
    } catch {
      setScreen('offline')
    }
  }, [])

  useEffect(() => {
    checkStatus()
  }, [checkStatus])

  async function install() {
    setScreen('installing')
    setError(null)
    setInstallMessage(null)
    try {
      const result = await setupApi.startAgent()
      setInstallMessage(result.message)
      // Wait briefly then re-check health
      await new Promise((r) => setTimeout(r, 3000))
      const status = await setupApi.agentStatus()
      if (status.running) {
        setScreen('running')
      } else {
        setError('Agent wurde gestartet, antwortet aber noch nicht. Bitte warten und erneut prüfen.')
        setScreen('error')
      }
    } catch (err) {
      setError(extractErrorMessage(err))
      setScreen('error')
    }
  }

  if (screen === 'checking') {
    return (
      <StepCard title="Hermes Agent" description="Verbindung wird geprüft…">
        <div className="flex items-center gap-3 py-4">
          <Spinner />
          <span className="text-sm text-primary-700 dark:text-zinc-300">Hermes Agent wird gesucht…</span>
        </div>
      </StepCard>
    )
  }

  if (screen === 'running') {
    return (
      <StepCard
        title="Hermes Agent"
        description="Der Agent ist erreichbar und bereit."
      >
        <div className="space-y-6">
          <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 font-medium">
            <span>✓</span>
            <span>Hermes Agent verbunden</span>
          </div>
          <div className="flex justify-end">
            <Button type="button" onClick={onNext}>
              Weiter →
            </Button>
          </div>
        </div>
      </StepCard>
    )
  }

  if (screen === 'offline') {
    return (
      <StepCard
        title="Hermes Agent"
        description="Der Agent-Container wurde nicht gefunden oder läuft nicht."
      >
        <div className="space-y-6">
          <div className="rounded-md border border-primary-200 dark:border-zinc-700 bg-primary-50 dark:bg-zinc-900/50 p-4 text-sm space-y-2 text-primary-700 dark:text-zinc-300">
            <p>
              Hermes Agent wird als Docker Container installiert. Er läuft isoliert neben Hermes OS und
              verwaltet KI-Agenten-Aufgaben.
            </p>
            <p className="text-xs text-primary-500 dark:text-zinc-400">
              Image: <code className="bg-primary-100 dark:bg-zinc-800 px-1 rounded">nousresearch/hermes-agent:latest</code>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button type="button" onClick={install}>
              Agent installieren
            </Button>
            <button
              type="button"
              onClick={onNext}
              className="text-sm text-primary-500 hover:text-primary-700 dark:hover:text-zinc-300 underline"
            >
              Überspringen
            </button>
          </div>
        </div>
      </StepCard>
    )
  }

  if (screen === 'installing') {
    return (
      <StepCard title="Hermes Agent wird installiert…" description="">
        <div className="space-y-4">
          <div className="flex items-center gap-3 py-4">
            <Spinner />
            <span className="text-sm text-primary-700 dark:text-zinc-300">
              {installMessage ?? 'Docker Image wird geladen… (kann einige Minuten dauern)'}
            </span>
          </div>
        </div>
      </StepCard>
    )
  }

  // error screen
  return (
    <StepCard title="Hermes Agent" description="">
      <div className="space-y-4">
        <FormError message={error} />
        <div className="flex items-center gap-3">
          <Button type="button" onClick={checkStatus}>
            Erneut prüfen
          </Button>
          <Button type="button" variant="outline" onClick={install}>
            Erneut installieren
          </Button>
          <button
            type="button"
            onClick={onNext}
            className="text-sm text-primary-500 hover:text-primary-700 dark:hover:text-zinc-300 underline"
          >
            Überspringen
          </button>
        </div>
      </div>
    </StepCard>
  )
}

function extractErrorMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { body?: { error?: unknown; detail?: unknown }; message?: unknown }
    if (e.body && typeof e.body === 'object') {
      if (typeof e.body.detail === 'string') return e.body.detail
      if (typeof e.body.error === 'string') return e.body.error
    }
    if (typeof e.message === 'string') return e.message
  }
  return String(err)
}
