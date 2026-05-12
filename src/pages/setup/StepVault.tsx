import { useState, useEffect } from 'react'
import { StepCard } from '@/components/wizard/StepCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormError } from '@/components/wizard/FormError'
import { setupApi } from '@/lib/api'

interface StepVaultProps {
  onNext: () => void
}

type Screen =
  | 'forgejo-mode'
  | 'forgejo-connect'
  | 'forgejo-provision'
  | 'vault-mode'
  | 'vault-connect'
  | 'vault-create'

type ForgejoMode = 'existing' | 'new' | null
type VaultMode = 'existing' | 'create' | null

type ProvisionResult = {
  url: string
  adminUser: string
  adminPassword: string
  apiToken: string
}

type VaultResult = {
  repoUrl: string
  repoName: string
}

const FORGEJO_MODES: ReadonlyArray<{ id: Exclude<ForgejoMode, null>; label: string; description: string }> = [
  { id: 'existing', label: 'Bereits vorhanden', description: 'Bestehende Instanz verbinden' },
  { id: 'new', label: 'Neu aufsetzen', description: 'Forgejo in Docker starten' },
]

const VAULT_MODES: ReadonlyArray<{ id: Exclude<VaultMode, null>; label: string; description: string }> = [
  { id: 'existing', label: 'Vault existiert bereits', description: 'Repo-Name eingeben' },
  { id: 'create', label: 'Vault erstellen', description: 'Neues Repo anlegen' },
]

function Spinner() {
  return (
    <div
      className="animate-spin h-5 w-5 border-2 border-accent-500 border-t-transparent rounded-full"
      aria-label="Loading"
    />
  )
}

interface CopyButtonProps {
  text: string
}

function CopyButton({ text }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard not available — silently ignore
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="text-xs px-2 py-0.5 rounded border border-primary-200 dark:border-zinc-700 hover:border-primary-300 dark:hover:border-zinc-600 text-primary-700 dark:text-zinc-300"
    >
      {copied ? 'Kopiert!' : 'Kopieren'}
    </button>
  )
}

interface BackLinkProps {
  onClick: () => void
}

function BackLink({ onClick }: BackLinkProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-sm text-primary-500 hover:text-primary-700 dark:hover:text-zinc-300 mb-4"
    >
      ← Zurück
    </button>
  )
}

interface TileGridProps<T extends string> {
  options: ReadonlyArray<{ id: T; label: string; description: string }>
  onSelect: (id: T) => void
}

function TileGrid<T extends string>({ options, onSelect }: TileGridProps<T>) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onSelect(opt.id)}
          className="px-4 py-3 text-sm rounded-md border text-left transition-colors border-primary-200 dark:border-zinc-700 hover:border-primary-300 dark:hover:border-zinc-600"
        >
          <div className="font-medium text-primary-900 dark:text-zinc-200">{opt.label}</div>
          <div className="text-xs text-primary-500 dark:text-zinc-400 mt-0.5">{opt.description}</div>
        </button>
      ))}
    </div>
  )
}

export function StepVault({ onNext }: StepVaultProps) {
  const [screen, setScreen] = useState<Screen>('forgejo-mode')
  const [forgejoMode, setForgejoMode] = useState<ForgejoMode>(null)
  const [vaultMode, setVaultMode] = useState<VaultMode>(null)

  const [forgejoUrl, setForgejoUrl] = useState('')
  const [apiToken, setApiToken] = useState('')
  const [vaultRepo, setVaultRepo] = useState('')

  const [provisionLoading, setProvisionLoading] = useState(false)
  const [provisionError, setProvisionError] = useState<string | null>(null)
  const [provisionResult, setProvisionResult] = useState<ProvisionResult | null>(null)
  const [provisionAttempt, setProvisionAttempt] = useState(0)

  const [vaultLoading, setVaultLoading] = useState(false)
  const [vaultError, setVaultError] = useState<string | null>(null)
  const [vaultResult, setVaultResult] = useState<VaultResult | null>(null)
  const [vaultAttempt, setVaultAttempt] = useState(0)

  const [saveLoading, setSaveLoading] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Auto-trigger Forgejo provisioning when entering screen 'forgejo-provision'
  useEffect(() => {
    if (screen !== 'forgejo-provision') return
    let cancelled = false
    setProvisionLoading(true)
    setProvisionError(null)
    setProvisionResult(null)
    ;(async () => {
      try {
        const result = await setupApi.provisionForgejo()
        if (cancelled) return
        setProvisionResult({
          url: result.url,
          adminUser: result.adminUser,
          adminPassword: result.adminPassword,
          apiToken: result.apiToken,
        })
        setForgejoUrl(result.url)
        setApiToken(result.apiToken)
      } catch (err) {
        if (cancelled) return
        setProvisionError(extractErrorMessage(err))
      } finally {
        if (!cancelled) setProvisionLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [screen, provisionAttempt])

  // Auto-trigger Vault creation when entering screen 'vault-create'
  useEffect(() => {
    if (screen !== 'vault-create') return
    let cancelled = false
    setVaultLoading(true)
    setVaultError(null)
    setVaultResult(null)
    setSaveError(null)
    ;(async () => {
      try {
        const result = await setupApi.createVault(forgejoUrl, apiToken)
        if (cancelled) return
        setVaultResult({ repoUrl: result.repoUrl, repoName: result.repoName })
        // After successful creation, save the vault config
        setSaveLoading(true)
        try {
          await setupApi.setVault(forgejoUrl, apiToken, result.repoName)
          if (cancelled) return
          onNext()
        } catch (saveErr) {
          if (cancelled) return
          setSaveError(extractErrorMessage(saveErr))
        } finally {
          if (!cancelled) setSaveLoading(false)
        }
      } catch (err) {
        if (cancelled) return
        setVaultError(extractErrorMessage(err))
      } finally {
        if (!cancelled) setVaultLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [screen, vaultAttempt, forgejoUrl, apiToken, onNext])

  function selectForgejoMode(id: Exclude<ForgejoMode, null>) {
    setForgejoMode(id)
    if (id === 'existing') {
      setScreen('forgejo-connect')
    } else {
      setScreen('forgejo-provision')
    }
  }

  function selectVaultMode(id: Exclude<VaultMode, null>) {
    setVaultMode(id)
    if (id === 'existing') {
      setScreen('vault-connect')
    } else {
      setScreen('vault-create')
    }
  }

  function goBackToForgejoMode() {
    setScreen('forgejo-mode')
    setProvisionError(null)
    setProvisionResult(null)
  }

  function goBackToPreviousForgejoScreen() {
    if (forgejoMode === 'new') {
      setScreen('forgejo-provision')
    } else {
      setScreen('forgejo-connect')
    }
  }

  function submitForgejoConnect(e: React.FormEvent) {
    e.preventDefault()
    if (!forgejoUrl.trim() || apiToken.trim().length < 20) return
    setScreen('vault-mode')
  }

  async function submitVaultConnect(e: React.FormEvent) {
    e.preventDefault()
    setSaveError(null)
    setSaveLoading(true)
    try {
      await setupApi.setVault(forgejoUrl, apiToken, vaultRepo.trim() || undefined)
      onNext()
    } catch (err) {
      setSaveError(extractErrorMessage(err))
    } finally {
      setSaveLoading(false)
    }
  }

  function retryProvision() {
    setProvisionAttempt((n) => n + 1)
  }

  function retryVaultCreate() {
    setVaultAttempt((n) => n + 1)
  }

  async function retrySaveAfterCreate() {
    if (!vaultResult) return
    setSaveError(null)
    setSaveLoading(true)
    try {
      await setupApi.setVault(forgejoUrl, apiToken, vaultResult.repoName)
      onNext()
    } catch (err) {
      setSaveError(extractErrorMessage(err))
    } finally {
      setSaveLoading(false)
    }
  }

  if (screen === 'forgejo-mode') {
    return (
      <StepCard
        title="Forgejo Vault verbinden"
        description="Wähle wie du deine Forgejo-Instanz einrichtest."
      >
        <TileGrid options={FORGEJO_MODES} onSelect={selectForgejoMode} />
      </StepCard>
    )
  }

  if (screen === 'forgejo-connect') {
    const canSubmit = forgejoUrl.trim().length > 0 && apiToken.trim().length >= 20
    return (
      <StepCard title="Forgejo verbinden" description="">
        <BackLink onClick={goBackToForgejoMode} />
        <form onSubmit={submitForgejoConnect} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5 text-primary-900 dark:text-zinc-300">
              Forgejo URL
            </label>
            <Input
              type="url"
              value={forgejoUrl}
              onChange={(e) => setForgejoUrl(e.target.value)}
              placeholder="https://git.example.com"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5 text-primary-900 dark:text-zinc-300">
              API Token
            </label>
            <Input
              type="password"
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              placeholder="forgejo_pat_..."
              required
              minLength={20}
            />
            <p className="text-xs text-primary-500 mt-1">
              Token benötigt <code className="bg-primary-100 dark:bg-zinc-800 px-1 rounded">write:repository</code> +{' '}
              <code className="bg-primary-100 dark:bg-zinc-800 px-1 rounded">write:user</code> Scopes. Wird verschlüsselt
              gespeichert.
            </p>
          </div>
          <div className="flex justify-end pt-4">
            <Button type="submit" disabled={!canSubmit}>
              Weiter →
            </Button>
          </div>
        </form>
      </StepCard>
    )
  }

  if (screen === 'forgejo-provision') {
    return (
      <StepCard title="Forgejo wird aufgesetzt…" description="">
        {!provisionLoading && <BackLink onClick={goBackToForgejoMode} />}

        {provisionLoading && (
          <div className="flex items-center gap-3 py-4">
            <Spinner />
            <span className="text-sm text-primary-700 dark:text-zinc-300">
              Forgejo wird aufgesetzt… (kann ~60 Sekunden dauern)
            </span>
          </div>
        )}

        {!provisionLoading && provisionError && (
          <div className="space-y-4">
            <FormError message={provisionError} />
            <div className="flex items-center gap-3">
              <Button type="button" onClick={retryProvision}>
                Erneut versuchen
              </Button>
            </div>
          </div>
        )}

        {!provisionLoading && !provisionError && provisionResult && (
          <div className="space-y-4">
            <div className="text-sm text-green-600 dark:text-green-400 font-medium">✓ Forgejo läuft</div>
            <div className="rounded-md border border-primary-200 dark:border-zinc-700 bg-primary-50 dark:bg-zinc-900/50 p-4 font-mono text-sm space-y-2">
              <div className="grid grid-cols-[100px_1fr_auto] items-center gap-2">
                <span className="text-primary-500">URL:</span>
                <span className="text-primary-900 dark:text-zinc-200 break-all">{provisionResult.url}</span>
                <span />
              </div>
              <div className="grid grid-cols-[100px_1fr_auto] items-center gap-2">
                <span className="text-primary-500">Admin:</span>
                <span className="text-primary-900 dark:text-zinc-200">{provisionResult.adminUser}</span>
                <span />
              </div>
              <div className="grid grid-cols-[100px_1fr_auto] items-center gap-2">
                <span className="text-primary-500">Passwort:</span>
                <span className="text-primary-900 dark:text-zinc-200 break-all">{provisionResult.adminPassword}</span>
                <CopyButton text={provisionResult.adminPassword} />
              </div>
              <div className="grid grid-cols-[100px_1fr_auto] items-center gap-2">
                <span className="text-primary-500">Token:</span>
                <span className="text-green-600 dark:text-green-400">Gespeichert ✓</span>
                <span />
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <Button type="button" onClick={() => setScreen('vault-mode')}>
                Weiter →
              </Button>
            </div>
          </div>
        )}
      </StepCard>
    )
  }

  if (screen === 'vault-mode') {
    return (
      <StepCard title="Starter Vault" description="Hast du bereits ein Vault-Repo auf Forgejo?">
        <BackLink onClick={goBackToPreviousForgejoScreen} />
        <TileGrid options={VAULT_MODES} onSelect={selectVaultMode} />
      </StepCard>
    )
  }

  if (screen === 'vault-connect') {
    return (
      <StepCard title="Vault verbinden" description="">
        <BackLink onClick={() => setScreen('vault-mode')} />
        <form onSubmit={submitVaultConnect} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5 text-primary-900 dark:text-zinc-300">
              Vault Repo Name
            </label>
            <Input
              value={vaultRepo}
              onChange={(e) => setVaultRepo(e.target.value)}
              placeholder="hermes-starter-vault"
            />
            <p className="text-xs text-primary-500 mt-1">Name des Repos auf Forgejo.</p>
          </div>
          <FormError message={saveError} />
          <div className="flex justify-end pt-4">
            <Button type="submit" disabled={saveLoading}>
              {saveLoading ? 'Speichern…' : 'Speichern und fortfahren'}
            </Button>
          </div>
        </form>
      </StepCard>
    )
  }

  if (screen === 'vault-create') {
    return (
      <StepCard title="Starter Vault wird erstellt…" description="">
        {!vaultLoading && (vaultError || saveError) && (
          <BackLink onClick={() => setScreen('vault-mode')} />
        )}

        {vaultLoading && (
          <div className="flex items-center gap-3 py-4">
            <Spinner />
            <span className="text-sm text-primary-700 dark:text-zinc-300">Repo wird angelegt…</span>
          </div>
        )}

        {!vaultLoading && vaultError && (
          <div className="space-y-4">
            <FormError message={vaultError} />
            <div className="flex items-center gap-3">
              <Button type="button" onClick={retryVaultCreate}>
                Erneut versuchen
              </Button>
            </div>
          </div>
        )}

        {!vaultLoading && !vaultError && vaultResult && (
          <div className="space-y-4">
            <div className="text-sm text-green-600 dark:text-green-400 font-medium">
              ✓ Vault erstellt: {vaultResult.repoName}
            </div>

            {saveLoading && (
              <div className="flex items-center gap-3 py-2">
                <Spinner />
                <span className="text-sm text-primary-700 dark:text-zinc-300">Konfiguration wird gespeichert…</span>
              </div>
            )}

            {saveError && (
              <div className="space-y-3">
                <FormError message={saveError} />
                <Button type="button" onClick={retrySaveAfterCreate} disabled={saveLoading}>
                  Erneut versuchen
                </Button>
              </div>
            )}
          </div>
        )}
      </StepCard>
    )
  }

  return null
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
