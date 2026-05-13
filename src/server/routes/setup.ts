import { Router } from 'express'
import { setSystemConfig, getSystemConfig } from '../db/config'
import { canFinalizeSetup } from '../middleware/setup-gate'
import { isValidDomain, verifyDomainDns } from '../services/domain'
import { provisionForgejo, createStarterVault, vaultExists } from '../services/forgejo-provisioner'
import { audit } from '../db/audit'

const router = Router()

router.post('/domain', async (req, res) => {
  const { domain, skipDnsCheck } = req.body ?? {}
  if (!isValidDomain(domain)) {
    return res.status(400).json({ error: 'invalid_domain' })
  }

  if (!skipDnsCheck) {
    const expectedIp = process.env.PUBLIC_IP
    if (!expectedIp) {
      return res.status(500).json({ error: 'public_ip_not_configured' })
    }
    const dnsCheck = await verifyDomainDns(domain, expectedIp)
    if (!dnsCheck.ok) {
      return res.status(400).json({
        error: 'dns_mismatch',
        expected: expectedIp,
        actual: dnsCheck.actual,
        hint: `Set an A record: ${domain} → ${expectedIp}, then retry.`,
      })
    }
  }

  await setSystemConfig('domain', domain)
  await audit({ action: 'setup.domain_set', target: domain, req })

  res.json({ ok: true, domain, next: '/api/auth/sign-up/email' })
})

router.post('/probe-models', async (req, res) => {
  const { baseUrl, apiKey } = req.body ?? {}
  if (!baseUrl || typeof baseUrl !== 'string' || !/^https?:\/\//.test(baseUrl)) {
    return res.status(400).json({ error: 'invalid_base_url' })
  }

  const cleanUrl = baseUrl.replace(/\/v1\/?$/, '').replace(/\/$/, '')
  try {
    const response = await fetch(`${cleanUrl}/v1/models`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) {
      const detail = response.status === 401 || response.status === 403
        ? 'Authentication failed — check your API key'
        : `Server returned HTTP ${response.status}`
      return res.status(400).json({ error: 'probe_failed', status: response.status, detail })
    }
    const data = await response.json() as { data?: Array<{ id: string }> }
    const models = data.data?.map((m: { id: string }) => m.id) ?? []
    res.json({ ok: true, models })
  } catch (err: any) {
    res.status(400).json({ error: 'probe_failed', detail: err.message })
  }
})

router.post('/provider', async (req, res) => {
  const { provider, apiKey, model, baseUrl } = req.body ?? {}
  const allowed = ['anthropic', 'openai', 'openrouter', 'google', 'ollama', 'custom']
  if (!allowed.includes(provider)) {
    return res.status(400).json({ error: 'invalid_provider' })
  }
  const needsKey = provider !== 'ollama' && provider !== 'custom'
  if (needsKey && (!apiKey || typeof apiKey !== 'string' || apiKey.length < 20)) {
    return res.status(400).json({ error: 'invalid_api_key' })
  }
  if (provider === 'custom' && (!baseUrl || typeof baseUrl !== 'string' || !/^https?:\/\//.test(baseUrl))) {
    return res.status(400).json({ error: 'invalid_base_url' })
  }

  await setSystemConfig('llm_provider', { provider, model: model ?? null, baseUrl: baseUrl ?? null })
  await setSystemConfig('llm_provider_api_key', apiKey ?? null)
  await audit({ action: 'setup.provider_configured', target: provider, req })

  res.json({ ok: true, next: '/api/setup/vault' })
})

router.post('/vault', async (req, res) => {
  const { forgejoUrl, apiToken, vaultRepo } = req.body ?? {}
  if (!forgejoUrl || !/^https?:\/\//.test(forgejoUrl)) {
    return res.status(400).json({ error: 'invalid_forgejo_url' })
  }
  if (!apiToken || typeof apiToken !== 'string' || apiToken.length < 20) {
    return res.status(400).json({ error: 'invalid_api_token' })
  }

  await setSystemConfig('vault_forgejo_url', forgejoUrl)
  await setSystemConfig('forgejo_api_token', apiToken)
  await setSystemConfig('vault_repo', vaultRepo ?? null)
  await audit({ action: 'setup.vault_configured', target: forgejoUrl, req })

  res.json({ ok: true, next: '/api/setup/finalize' })
})

router.post('/provision-forgejo', async (req, res) => {
  try {
    const result = await provisionForgejo()
    res.json({ ok: true, ...result })
  } catch (err: any) {
    res.status(500).json({ error: 'provision_failed', detail: err.message })
  }
})

router.get('/check-vault', async (req, res) => {
  const { forgejoUrl, apiToken, repoName } = req.query as Record<string, string>
  if (!forgejoUrl || !apiToken || !repoName) {
    return res.status(400).json({ error: 'missing_fields' })
  }
  try {
    const exists = await vaultExists(forgejoUrl, apiToken, repoName)
    res.json({ exists })
  } catch (err: any) {
    res.status(400).json({ error: 'check_failed', detail: err.message })
  }
})

router.post('/create-vault', async (req, res) => {
  const { forgejoUrl, apiToken, repoName } = req.body ?? {}
  if (!forgejoUrl || !apiToken) {
    return res.status(400).json({ error: 'missing_fields' })
  }
  try {
    const result = await createStarterVault(forgejoUrl, apiToken, repoName)
    res.json({ ok: true, ...result })
  } catch (err: any) {
    res.status(400).json({ error: 'vault_creation_failed', detail: err.message })
  }
})

router.post('/finalize', async (req, res) => {
  const check = await canFinalizeSetup()
  if (!check.ok) {
    return res.status(400).json({ error: check.reason })
  }

  await setSystemConfig('setup_completed', true)
  await audit({ action: 'setup.finalized', req })

  res.json({ ok: true, redirect: '/' })
})

router.get('/bootstrap', (_req, res) => {
  res.json({
    domain: process.env.DOMAIN ?? null,
    publicIp: process.env.PUBLIC_IP ?? null,
  })
})

router.get('/status', async (_req, res) => {
  const domain = await getSystemConfig<string>('domain')
  const provider = await getSystemConfig('llm_provider')
  const vault = await getSystemConfig('vault_forgejo_url')
  const completed = (await getSystemConfig<boolean>('setup_completed')) === true
  const check = await canFinalizeSetup()
  res.json({
    completed,
    canFinalize: check.ok,
    blocker: check.ok ? null : (check as any).reason,
    domain,
    provider,
    vault,
  })
})

// GET /api/setup/agent-status
// Prüft ob hermes-agent erreichbar ist via health-endpoint
router.get('/agent-status', async (req, res) => {
  try {
    const agentUrl = process.env.HERMES_API_URL || 'http://hermes-agent:8642'
    const token = process.env.HERMES_API_TOKEN || ''
    const headers: Record<string, string> = {}
    if (token) headers['Authorization'] = `Bearer ${token}`

    const r = await fetch(`${agentUrl}/health`, { signal: AbortSignal.timeout(5000), headers })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const data = await r.json() as { status?: string }
    res.json({ running: true, status: data.status ?? 'ok' })
  } catch {
    res.json({ running: false, status: 'unreachable' })
  }
})

// POST /api/setup/start-agent
// Versucht den hermes-agent Container via Docker-API zu starten
router.post('/start-agent', async (req, res) => {
  const dockerHost = process.env.DOCKER_HOST?.replace('tcp://', 'http://') || 'http://socket-proxy:2375'
  const agentKey = process.env.HERMES_API_TOKEN || ''
  const containerName = 'hermes-os-hermes-agent-1'

  try {
    // 1. Prüfe ob Container existiert
    const listRes = await fetch(
      `${dockerHost}/containers/json?all=1&filters=${encodeURIComponent(JSON.stringify({ name: [containerName] }))}`,
      { signal: AbortSignal.timeout(10000) }
    )
    const containers = await listRes.json() as Array<{ Id: string; State: string; Names: string[] }>
    const existing = containers.find(c => c.Names.some(n => n.includes('hermes-agent')))

    if (existing) {
      if (existing.State === 'running') {
        return res.json({ ok: true, message: 'Agent läuft bereits' })
      }
      // Container existiert aber läuft nicht → starten
      const startRes = await fetch(`${dockerHost}/containers/${existing.Id}/start`, {
        method: 'POST',
        signal: AbortSignal.timeout(15000),
      })
      if (!startRes.ok && startRes.status !== 304) {
        throw new Error(`Start fehlgeschlagen: HTTP ${startRes.status}`)
      }
      return res.json({ ok: true, message: 'Agent gestartet' })
    }

    // 2. Container existiert nicht → Image pullen + Container erstellen
    // Image pull (streaming response, warten bis fertig)
    await fetch(
      `${dockerHost}/images/create?fromImage=nousresearch%2Fhermes-agent&tag=latest`,
      { method: 'POST', signal: AbortSignal.timeout(300000) }
    )

    // Container erstellen
    const createBody = {
      Image: 'nousresearch/hermes-agent:latest',
      Cmd: ['gateway', 'run'],
      AttachStdin: true,
      OpenStdin: true,
      Tty: true,
      Env: [
        'API_SERVER_ENABLED=true',
        'API_SERVER_HOST=0.0.0.0',
        ...(agentKey ? [`API_SERVER_KEY=${agentKey}`] : []),
      ],
      HostConfig: {
        Binds: ['hermes_agent_data:/opt/data'],
        NetworkMode: 'hermes-os_internal',
        RestartPolicy: { Name: 'unless-stopped' },
      },
    }
    const createRes = await fetch(`${dockerHost}/containers/create?name=${containerName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createBody),
      signal: AbortSignal.timeout(30000),
    })
    if (!createRes.ok) {
      const err = await createRes.text()
      throw new Error(`Container erstellen fehlgeschlagen: ${err}`)
    }
    const { Id } = await createRes.json() as { Id: string }

    // Starten
    await fetch(`${dockerHost}/containers/${Id}/start`, {
      method: 'POST',
      signal: AbortSignal.timeout(15000),
    })

    await setSystemConfig('agent_installed', true)
    res.json({ ok: true, message: 'Agent installiert und gestartet' })
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message ?? 'Unbekannter Fehler' })
  }
})

export default router
