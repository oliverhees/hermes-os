import { useEffect, useState } from 'react'
import { StepCard } from '@/components/wizard/StepCard'
import { Button } from '@/components/ui/button'
import { FormError } from '@/components/wizard/FormError'
import { setupApi } from '@/lib/api'
import { CheckmarkCircle02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'

interface StepDomainProps {
  onNext: () => void
}

export function StepDomain({ onNext }: StepDomainProps) {
  const [domain, setDomain] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setupApi.bootstrap()
      .then((data) => setDomain(data.domain || window.location.hostname))
      .catch(() => setDomain(window.location.hostname))
  }, [])

  async function confirm() {
    setError(null)
    setLoading(true)
    try {
      // skipDnsCheck=true: domain was already validated by the installer and
      // the user is actively browsing from this domain — re-checking from
      // inside the Docker container would fail due to Docker's internal DNS.
      await setupApi.setDomain(domain, true)
      onNext()
    } catch (err: any) {
      if (err.body?.error === 'setup_already_completed') { onNext(); return }
      setError(err.body?.hint || err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <StepCard
      title="Confirm your domain"
      description="This domain was detected during install and validated via DNS."
      footer={
        <div className="flex justify-end">
          <Button onClick={confirm} disabled={loading}>
            {loading ? 'Saving...' : 'Continue'}
          </Button>
        </div>
      }
    >
      <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 rounded-md">
        <HugeiconsIcon icon={CheckmarkCircle02Icon} size={20} className="text-green-600 shrink-0" />
        <div>
          <p className="font-medium text-primary-900 dark:text-white">{domain}</p>
          <p className="text-sm text-primary-500">DNS record verified during installation.</p>
        </div>
      </div>
      <FormError message={error} />
    </StepCard>
  )
}
