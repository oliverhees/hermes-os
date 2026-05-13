import 'xterm/css/xterm.css'

import { useEffect, useRef, useState } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { StepCard } from '@/components/wizard/StepCard'
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

  // Step 1: Start wizard session on server
  useEffect(() => {
    setupApi.startAgentWizard()
      .then(({ sessionId }) => setSessionId(sessionId))
      .catch(err => {
        setError(err.body?.error ?? err.message)
        setPhase('error')
      })
  }, [])

  // Step 2: Init xterm + connect SSE once we have sessionId
  useEffect(() => {
    if (!sessionId || !termRef.current) return

    const term = new Terminal({
      fontFamily: '"Menlo", "Monaco", "Courier New", monospace',
      fontSize: 13,
      theme: {
        background: '#0f0f14',
        foreground: '#e2e2e9',
        cursor: '#7c7cdb',
        selectionBackground: '#3d3d5c',
      },
      cursorBlink: true,
      convertEol: true,
      scrollback: 1000,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(termRef.current)
    fit.fit()
    termInstance.current = term
    fitAddon.current = fit

    setPhase('running')

    // Resize observer
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

    // Keyboard input
    const inputDispose = term.onData(data => {
      fetch('/api/terminal-input', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ sessionId, data }),
      }).catch(() => undefined)
    })

    // SSE stream (attach to existing session)
    let aborted = false
    const controller = new AbortController()

    fetch('/api/terminal-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      signal: controller.signal,
      body: JSON.stringify({ sessionId, cols: 120, rows: 34 }),
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
              if (payload?.data !== undefined) {
                term.write(payload.data)
              }
            } catch { /* ignore parse errors */ }
          } else if (line.startsWith('event: exit')) {
            setPhase('done')
          } else if (line.startsWith('event: error')) {
            setPhase('done') // treat as done so user can proceed
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

  const footer = phase === 'done' ? (
    <div className="flex justify-end">
      <Button onClick={onNext}>Weiter →</Button>
    </div>
  ) : phase === 'error' ? (
    <div className="flex justify-between items-center">
      <button
        type="button"
        onClick={onNext}
        className="text-sm text-primary-500 hover:text-primary-700 dark:hover:text-zinc-300 underline"
      >
        Überspringen
      </button>
    </div>
  ) : (
    <div className="flex justify-between items-center text-sm text-primary-500">
      <span>Führe den Wizard durch und beende ihn mit „Done".</span>
      <button
        type="button"
        onClick={onNext}
        className="text-sm text-primary-500 hover:text-primary-700 dark:hover:text-zinc-300 underline"
      >
        Überspringen
      </button>
    </div>
  )

  return (
    <StepCard
      title="Hermes Agent einrichten"
      description={
        phase === 'starting' ? 'Wizard wird gestartet…'
        : phase === 'done' ? 'Setup abgeschlossen.'
        : 'Richte den Agent in diesem Terminal ein.'
      }
      footer={footer}
    >
      {phase === 'starting' && (
        <div className="flex items-center gap-3 py-8">
          <div className="animate-spin h-5 w-5 border-2 border-accent-500 border-t-transparent rounded-full" />
          <span className="text-sm text-primary-700 dark:text-zinc-300">Verbinde mit Agent…</span>
        </div>
      )}

      {phase === 'error' && !sessionId && (
        <FormError message={error} />
      )}

      <div
        ref={termRef}
        style={{ display: sessionId ? 'block' : 'none', height: '420px' }}
        className="rounded-lg overflow-hidden bg-[#0f0f14]"
      />

      {phase === 'done' && (
        <div className="flex items-center gap-2 mt-4 text-sm text-green-600 dark:text-green-400 font-medium">
          <span>✓</span>
          <span>Hermes Agent wurde eingerichtet.</span>
        </div>
      )}
    </StepCard>
  )
}
