import { useState } from 'react'
import { StepCard } from '@/components/wizard/StepCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormError } from '@/components/wizard/FormError'
import { twoFactor } from '@/lib/auth-client'
import { Shield01Icon, SecurityWarningIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'

interface StepTwoFactorProps {
  onNext: () => void
}

type Phase = 'init' | 'verify' | 'done'

export function StepTwoFactor({ onNext }: StepTwoFactorProps) {
  const [phase, setPhase] = useState<Phase>('init')
  const [password, setPassword] = useState('')
  const [totpUri, setTotpUri] = useState<string | null>(null)
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function enable(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { data, error } = await twoFactor.enable({ password })
      if (error) throw new Error(error.message)
      setTotpUri(data?.totpURI ?? null)
      setBackupCodes(data?.backupCodes ?? [])
      setPhase('verify')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { error } = await twoFactor.verifyTotp({ code })
      if (error) throw new Error(error.message)
      setPhase('done')
      setTimeout(onNext, 1500)
    } catch (err: any) {
      setError(err.message ?? 'Invalid code')
    } finally {
      setLoading(false)
    }
  }

  if (phase === 'done') {
    return (
      <StepCard title="Two-factor authentication enabled">
        <div className="flex items-center gap-3 text-green-700 dark:text-green-400">
          <HugeiconsIcon icon={Shield01Icon} size={24} />
          <span>Verified. Continuing to LLM provider setup…</span>
        </div>
      </StepCard>
    )
  }

  if (phase === 'verify') {
    return (
      <StepCard
        title="Scan with your authenticator app"
        description="Use Google Authenticator, 1Password, Authy, Aegis, or any TOTP app."
      >
        {totpUri && (
          <div className="flex flex-col items-center gap-4 mb-6">
            <div className="p-4 bg-white rounded-md border border-primary-200 dark:border-zinc-700">
              <QRCodeDisplay value={totpUri} />
            </div>
            <details className="text-xs text-primary-500">
              <summary className="cursor-pointer hover:text-primary-700">Can't scan? Show secret manually</summary>
              <code className="block mt-2 p-2 bg-primary-100 dark:bg-zinc-800 rounded text-[10px] break-all">
                {totpUri}
              </code>
            </details>
          </div>
        )}

        {backupCodes.length > 0 && (
          <div className="mb-6 p-4 bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-300 dark:border-yellow-900 rounded-md">
            <div className="flex items-start gap-2 mb-2">
              <HugeiconsIcon icon={SecurityWarningIcon} size={16} className="text-yellow-600 shrink-0 mt-0.5" />
              <p className="text-sm font-medium">Save these backup codes</p>
            </div>
            <p className="text-xs text-primary-600 dark:text-zinc-400 mb-2">
              You'll need them if you lose access to your authenticator. Each works once.
            </p>
            <ul className="grid grid-cols-2 gap-1 font-mono text-xs">
              {backupCodes.map((c) => (
                <li key={c} className="px-2 py-1 bg-white dark:bg-zinc-900 rounded">
                  {c}
                </li>
              ))}
            </ul>
          </div>
        )}

        <form onSubmit={verify} className="space-y-3">
          <label className="block text-sm font-medium text-primary-900 dark:text-zinc-300">
            Enter the 6-digit code
          </label>
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            required
            autoFocus
            className="font-mono text-center text-2xl tracking-widest"
            placeholder="000000"
          />
          <FormError message={error} />
          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={loading || code.length !== 6}>
              {loading ? 'Verifying...' : 'Verify and continue'}
            </Button>
          </div>
        </form>
      </StepCard>
    )
  }

  return (
    <StepCard
      title="Enable two-factor authentication"
      description="Required for the admin account. Cannot be skipped."
    >
      <form onSubmit={enable} className="space-y-4">
        <p className="text-sm text-primary-600 dark:text-zinc-400">
          Confirm your password to start the 2FA enrollment.
        </p>
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Your password"
          required
          autoFocus
        />
        <FormError message={error} />
        <div className="flex justify-end pt-2">
          <Button type="submit" disabled={loading}>
            {loading ? 'Starting enrollment...' : 'Start enrollment'}
          </Button>
        </div>
      </form>
    </StepCard>
  )
}

function QRCodeDisplay({ value }: { value: string }) {
  const [qrUrl, setQrUrl] = useState<string | null>(null)

  useState(() => {
    const url = new URL('https://api.qrserver.com/v1/create-qr-code/')
    url.searchParams.set('data', value)
    url.searchParams.set('size', '200x200')
    url.searchParams.set('margin', '10')
    setQrUrl(url.toString())
  })

  if (!qrUrl) return null

  return <img src={qrUrl} alt="QR Code for TOTP" width={200} height={200} className="block" />
}
