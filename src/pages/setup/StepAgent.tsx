import { useState, useEffect, useCallback, useRef } from 'react'
import { StepCard } from '@/components/wizard/StepCard'
import { Button } from '@/components/ui/button'
import { setupApi } from '@/lib/api'

interface StepAgentProps {
  onNext: () => void
}

type Phase = 'checking' | 'running' | 'offline' | 'installing' | 'waiting' | 'error'

interface LogEntry {
  ts: string
  msg: string
  type: 'info' | 'success' | 'error' | 'warn'
}

function Spinner() {
  return (
    <div className="animate-spin h-4 w-4 border-2 border-accent-500 border-t-transparent rounded-full shrink-0" />
  )
}

function nowTs() {
  return new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

const POLL_INTERVAL = 5000
const POLL_TIMEOUT = 120_000

export function StepAgent({ onNext }: StepAgentProps) {
  const [phase, setPhase] = useState<Phase>('checking')
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const deadlineRef = useRef<number>(0)
  const logRef = useRef<HTMLDivElement>(null)

  const addLog = useCallback((msg: string, type: LogEntry['type'] = 'info') => {
    setLogs(prev => [...prev, { ts: nowTs(), msg, type }])
    setTimeout(() => logRef.current?.scrollTo({ top: 99999, behavior: 'smooth' }), 50)
  }, [])

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }, [])

  const startPolling = useCallback(() => {
    stopPolling()
    deadlineRef.current = Date.now() + POLL_TIMEOUT
    addLog('Warte auf Agent-API (max. 2 Min)…', 'info')

    pollRef.current = setInterval(async () => {
      if (Date.now() > deadlineRef.current) {
        stopPolling()
        addLog('Timeout — Agent antwortet nach 2 Minuten nicht.', 'error')
        setErrorMsg('Agent-Container läuft, aber API antwortet nicht. Evtl. braucht er länger zum Starten.')
        setPhase('error')
        return
      }
      try {
        const result = await setupApi.agentStatus()
        if (result.running) {
          stopPolling()
          addLog('Agent erreichbar ✓', 'success')
          setPhase('running')
        } else {
          const elapsed = Math.round((Date.now() - (deadlineRef.current - POLL_TIMEOUT)) / 1000)
          addLog(`Noch nicht bereit… (${elapsed}s vergangen)`, 'warn')
        }
      } catch {
        addLog('Prüfung fehlgeschlagen, versuche erneut…', 'warn')
      }
    }, POLL_INTERVAL)
  }, [addLog, stopPolling])

  const checkOnce = useCallback(async () => {
    setPhase('checking')
    try {
      const result = await setupApi.agentStatus()
      if (result.running) {
        addLog('Agent bereits erreichbar ✓', 'success')
        setPhase('running')
      } else {
        setPhase('offline')
      }
    } catch {
      setPhase('offline')
    }
  }, [addLog])

  useEffect(() => {
    checkOnce()
    return stopPolling
  }, [checkOnce, stopPolling])

  async function install() {
    setPhase('installing')
    setErrorMsg(null)
    setLogs([])
    addLog('Starte Installation…', 'info')
    addLog('Docker Image wird heruntergeladen: nousresearch/hermes-agent:latest', 'info')
    addLog('Das kann 2–5 Minuten dauern — bitte nicht schließen.', 'warn')
    try {
      const result = await setupApi.startAgent()
      addLog(result.message ?? 'Container erstellt und gestartet', 'info')
      setPhase('waiting')
      startPolling()
    } catch (err: any) {
      const msg = err?.body?.detail ?? err?.body?.error ?? err?.message ?? 'Unbekannter Fehler'
      addLog(`Fehler: ${msg}`, 'error')
      setErrorMsg(msg)
      setPhase('error')
    }
  }

  function retry() {
    stopPolling()
    setLogs([])
    setErrorMsg(null)
    checkOnce()
  }

  const logColors: Record<LogEntry['type'], string> = {
    info: 'text-zinc-400',
    success: 'text-green-400',
    error: 'text-red-400',
    warn: 'text-yellow-400',
  }

  const LogPanel = logs.length > 0 && (
    <div
      ref={logRef}
      className="mt-4 rounded-lg bg-zinc-950 border border-zinc-800 p-3 font-mono text-xs max-h-48 overflow-y-auto space-y-0.5"
    >
      {logs.map((e, i) => (
        <div key={i} className={`flex gap-2 ${logColors[e.type]}`}>
          <span className="text-zinc-600 shrink-0">{e.ts}</span>
          <span>{e.msg}</span>
        </div>
      ))}
    </div>
  )

  if (phase === 'checking') {
    return (
      <StepCard title="Hermes Agent" description="Verbindung wird geprüft…">
        <div className="flex items-center gap-3 py-4">
          <Spinner />
          <span className="text-sm text-zinc-300">Suche nach laufendem Agent…</span>
        </div>
      </StepCard>
    )
  }

  if (phase === 'running') {
    return (
      <StepCard title="Hermes Agent" description="Agent ist erreichbar und bereit.">
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-green-500 font-medium">
            <span>✓</span>
            <span>Hermes Agent verbunden</span>
          </div>
          {LogPanel}
          <div className="flex justify-end pt-2">
            <Button onClick={onNext}>Weiter →</Button>
          </div>
        </div>
      </StepCard>
    )
  }

  if (phase === 'offline') {
    return (
      <StepCard
        title="Hermes Agent"
        description="Agent-Container nicht gefunden. Jetzt installieren."
      >
        <div className="space-y-4">
          <div className="rounded-md border border-zinc-700 bg-zinc-900/50 p-4 text-sm text-zinc-300 space-y-1.5">
            <p>Hermes Agent läuft als eigener Docker-Container und verwaltet KI-Aufgaben.</p>
            <p className="text-xs text-zinc-500">
              Image: <code className="bg-zinc-800 px-1 rounded">nousresearch/hermes-agent:latest</code>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={install}>Agent installieren</Button>
            <button onClick={onNext} className="text-sm text-zinc-500 hover:text-zinc-300 underline">
              Überspringen
            </button>
          </div>
        </div>
      </StepCard>
    )
  }

  if (phase === 'installing' || phase === 'waiting') {
    return (
      <StepCard
        title="Hermes Agent wird installiert…"
        description={phase === 'installing' ? 'Image wird heruntergeladen…' : 'Container gestartet, warte auf API…'}
      >
        <div className="space-y-2">
          <div className="flex items-center gap-3 py-2">
            <Spinner />
            <span className="text-sm text-zinc-300">
              {phase === 'installing'
                ? 'Docker Image wird geladen (kann 2–5 Min dauern)…'
                : 'Agent startet, automatische Prüfung alle 5 Sekunden…'}
            </span>
          </div>
          {LogPanel}
        </div>
      </StepCard>
    )
  }

  return (
    <StepCard title="Hermes Agent" description="Fehler bei der Installation.">
      <div className="space-y-4">
        {errorMsg && (
          <div className="rounded-md border border-red-800 bg-red-950/30 p-3 text-sm text-red-400">
            {errorMsg}
          </div>
        )}
        {LogPanel}
        <div className="flex items-center gap-3 pt-2">
          <Button onClick={retry}>Erneut prüfen</Button>
          <Button variant="outline" onClick={install}>Erneut installieren</Button>
          <button onClick={onNext} className="text-sm text-zinc-500 hover:text-zinc-300 underline">
            Überspringen
          </button>
        </div>
      </div>
    </StepCard>
  )
}
