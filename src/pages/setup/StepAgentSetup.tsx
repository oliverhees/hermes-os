import 'xterm/css/xterm.css'

import { useEffect, useRef, useState } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { Button } from '@/components/ui/button'
import { FormError } from '@/components/wizard/FormError'
import { setupApi } from '@/lib/api'

interface StepAgentSetupProps {
  onNext: () => void
}

type Phase = 'starting' | 'running' | 'done' | 'error'

export function StepAgentSetup({ onNext }: StepAgentSetupProps) {
  const [phase, setPhase] = useState<Phase>('starting')
  const [error, setError] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const termRef = useRef<HTMLDivElement>(null)
  const termInstance = useRef<Terminal | null>(null)
  const fitAddon = useRef<FitAddon | null>(null)
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null)

  useEffect(() => {
    setupApi.startAgentWizard()
      .then(({ sessionId }) => setSessionId(sessionId))
      .catch(err => {
        setError(err.body?.error ?? err.message)
        setPhase('error')
      })
  }, [])

  useEffect(() => {
    if (!sessionId || !termRef.current) return

    const term = new Terminal({
      fontFamily: '"Menlo", "Monaco", "Courier New", monospace',
      fontSize: 14,
      theme: {
        background: '#0a0a0f',
        foreground: '#e2e2e9',
        cursor: '#7c7cdb',
        selectionBackground: '#3d3d5c',
      },
      cursorBlink: true,
      convertEol: true,
      scrollback: 2000,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(termRef.current)
    fit.fit()
    termInstance.current = term
    fitAddon.current = fit

    setPhase('running')

    const observer = new ResizeObserver(() => {
      fit.fit()
      const dims = fit.proposeDimensions()
      if (!dims || !sessionId) return
      fetch('/api/terminal-resize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ sessionId, cols: dims.cols, rows: dims.rows }),
      }).catch(() => undefined)
    })
    observer.observe(termRef.current)

    const inputDispose = term.onData(data => {
      fetch('/api/terminal-input', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ sessionId, data }),
      }).catch(() => undefined)
    })

    let aborted = false
    const controller = new AbortController()

    fetch('/api/terminal-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      signal: controller.signal,
      body: JSON.stringify({ sessionId, cols: 180, rows: 48 }),
    }).then(async res => {
      if (!res.ok || !res.body) {
        setError('Stream konnte nicht gestartet werden')
        setPhase('error')
        return
      }

      const reader = res.body.getReader()
      readerRef.current = reader
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done || aborted) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const payload = JSON.parse(line.slice(6))
              if (payload?.data !== undefined) term.write(payload.data)
            } catch { /* ignore */ }
          } else if (line.startsWith('event: exit') || line.startsWith('event: error')) {
            setPhase('done')
          }
        }
      }
    }).catch(err => {
      if (!aborted) {
        setError(err.message)
        setPhase('error')
      }
    })

    return () => {
      aborted = true
      controller.abort()
      observer.disconnect()
      inputDispose.dispose()
      readerRef.current?.cancel().catch(() => undefined)
      term.dispose()
      fetch('/api/terminal-close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ sessionId }),
      }).catch(() => undefined)
    }
  }, [sessionId])

  return (
    <div className="flex flex-col flex-1 h-full gap-4">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-xl font-semibold text-primary-900 dark:text-white">Hermes Agent einrichten</h2>
          <p className="text-sm text-primary-500 dark:text-zinc-400 mt-0.5">
            {phase === 'starting' && 'Verbinde mit Agent…'}
            {phase === 'running' && 'Führe den Wizard durch und beende ihn mit „Done".'}
            {phase === 'done' && 'Setup abgeschlossen.'}
            {phase === 'error' && 'Fehler beim Starten des Wizards.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {phase === 'done' && (
            <span className="text-sm text-green-500 font-medium">✓ Abgeschlossen</span>
          )}
          {phase === 'done' ? (
            <Button onClick={onNext}>Weiter →</Button>
          ) : (
            <button
              type="button"
              onClick={onNext}
              className="text-sm text-primary-400 hover:text-primary-600 dark:hover:text-zinc-300 underline"
            >
              Überspringen
            </button>
          )}
        </div>
      </div>

      {/* Error state */}
      {phase === 'error' && !sessionId && (
        <FormError message={error} />
      )}

      {/* Terminal */}
      <div
        className="rounded-xl overflow-hidden bg-[#0a0a0f] border border-zinc-800 flex-1"
        style={{ minHeight: 0 }}
      >
        {phase === 'starting' && (
          <div className="flex items-center gap-3 p-8">
            <div className="animate-spin h-5 w-5 border-2 border-accent-500 border-t-transparent rounded-full" />
            <span className="text-sm text-zinc-400">Verbinde mit Agent…</span>
          </div>
        )}
        <div
          ref={termRef}
          style={{ display: sessionId ? 'block' : 'none', height: '100%', width: '100%' }}
        />
      </div>
    </div>
  )
}
