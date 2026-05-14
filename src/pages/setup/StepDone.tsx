import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { StepCard } from '@/components/wizard/StepCard'
import { Button } from '@/components/ui/button'
import { FormError } from '@/components/wizard/FormError'
import { setupApi } from '@/lib/api'
import { useSetupStatus } from '@/lib/setup-status'
import { CheckmarkCircle02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'

export function StepDone() {
  const navigate = useNavigate()
  const { status, refresh } = useSetupStatus()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function finalize() {
    setError(null)
    setLoading(true)
    try {
      await setupApi.finalize()
      await refresh()
    } catch (err: any) {
      if (err.body?.error === 'setup_already_completed') {
        await refresh()
        return
      }
      setError(err.body?.error ?? err.message)
    } finally {
      setLoading(false)
    }
  }

  // Auto-finalize when this step is first rendered
  useEffect(() => {
    if (!status?.completed && status?.canFinalize) {
      finalize()
    }
  }, [])

  useEffect(() => {
    if (status?.completed) {
      // Hard reload so AppGate picks up fresh setup status instead of stale cached state
      const t = setTimeout(() => window.location.replace('/'), 2000)
      return () => clearTimeout(t)
    }
  }, [status?.completed])

  if (status?.completed) {
    return (
      <StepCard title="Setup complete">
        <div className="flex flex-col items-center gap-3 py-8">
          <HugeiconsIcon icon={CheckmarkCircle02Icon} size={48} className="text-green-600" />
          <p className="text-lg font-medium text-primary-900 dark:text-white">hermes-os is ready.</p>
          <p className="text-sm text-primary-500">Redirecting to dashboard…</p>
        </div>
      </StepCard>
    )
  }

  return (
    <StepCard
      title="Review and finalize"
      description="One last check before activating hermes-os."
      footer={
        <div className="flex justify-end">
          <Button onClick={finalize} disabled={loading || !status?.canFinalize}>
            {loading ? 'Finalizing...' : 'Finalize setup'}
          </Button>
        </div>
      }
    >
      <dl className="space-y-3 text-sm">
        <Row label="Domain" value={status?.domain ?? '—'} />
        <Row label="Vault" value={status?.vault ?? '—'} />
      </dl>

      {!status?.canFinalize && status?.blocker && (
        <FormError message={`Blocked: ${status.blocker}. Please go back and complete that step.`} />
      )}
      <FormError message={error} />
    </StepCard>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-2 border-b border-primary-100 dark:border-zinc-800 last:border-0">
      <dt className="text-primary-500">{label}</dt>
      <dd className="font-mono text-sm text-primary-900 dark:text-zinc-200">{value}</dd>
    </div>
  )
}
