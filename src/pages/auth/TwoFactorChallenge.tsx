import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { twoFactor } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormError } from '@/components/wizard/FormError'

export function TwoFactorChallenge() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [useBackup, setUseBackup] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const fn = useBackup ? twoFactor.verifyBackupCode : twoFactor.verifyTotp
      const { error } = await fn({ code })
      if (error) throw new Error(error.message ?? 'Verification failed')
      // Hard reload so the session cookie is picked up before AppGate fires
      window.location.replace('/')
    } catch (err: any) {
      setError(err.message ?? 'Invalid code')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-primary-50 dark:bg-zinc-950 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-zinc-900 p-8 shadow-xl shadow-primary-900/5 ring-1 ring-primary-200 dark:ring-zinc-800">
        <h1 className="text-xl font-bold mb-2 text-primary-900 dark:text-white">
          Two-factor verification
        </h1>
        <p className="text-sm text-primary-500 mb-6">
          {useBackup
            ? 'Enter one of your backup codes.'
            : 'Open your authenticator app and enter the 6-digit code.'}
        </p>
        <form onSubmit={submit} className="space-y-4">
          <Input
            value={code}
            onChange={(e) =>
              setCode(useBackup ? e.target.value : e.target.value.replace(/\D/g, '').slice(0, 6))
            }
            inputMode={useBackup ? 'text' : 'numeric'}
            maxLength={useBackup ? 12 : 6}
            required
            autoFocus
            placeholder={useBackup ? 'Backup code' : '000000'}
            className={
              useBackup
                ? 'font-mono'
                : 'font-mono text-center text-2xl tracking-widest'
            }
          />
          <FormError message={error} />
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Verifying...' : 'Verify'}
          </Button>
          <button
            type="button"
            onClick={() => {
              setUseBackup(!useBackup)
              setCode('')
            }}
            className="w-full text-xs text-primary-500 hover:text-primary-700 dark:hover:text-zinc-300 underline"
          >
            {useBackup
              ? 'Use authenticator code instead'
              : 'Use a backup code instead'}
          </button>
        </form>
      </div>
    </div>
  )
}
