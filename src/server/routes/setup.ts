import { Router } from 'express'
import { setSystemConfig, getSystemConfig } from '../db/config'
import { canFinalizeSetup } from '../middleware/setup-gate'
import { isValidDomain, verifyDomainDns } from '../services/domain'
import { provisionForgejo, createStarterVault, vaultExists } from '../services/forgejo-provisioner'
import { audit } from '../db/audit'
import { createTerminalSession } from '../terminal-sessions'

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

// POST /api/setup/configure-agent
// Schreibt .env in hermes-agent Container via Docker exec, startet Agent neu
router.post('/configure-agent', async (req, res) => {
  const { provider, apiKey, model, baseUrl } = req.body ?? {}
  const allowed = ['anthropic', 'openai', 'openrouter', 'google', 'ollama']
  if (!allowed.includes(provider)) {
    return res.status(400).json({ error: 'invalid_provider' })
  }
  const needsKey = provider !== 'ollama'
  if (needsKey && (!apiKey || typeof apiKey !== 'string' || apiKey.length < 10)) {
    return res.status(400).json({ error: 'invalid_api_key' })
  }

  const dockerHost = process.env.DOCKER_HOST?.replace('tcp://', 'http://') || 'http://socket-proxy:2375'

  try {
    // Container finden
    const listRes = await fetch(
      `${dockerHost}/containers/json?all=1&filters=${encodeURIComponent(JSON.stringify({ name: ['hermes-agent'] }))}`,
      { signal: AbortSignal.timeout(10000) }
    )
    const containers = await listRes.json() as Array<{ Id: string; State: string; Names: string[] }>
    const existing = containers.find(c => c.Names.some(n => n.includes('hermes-agent')))
    if (!existing) {
      return res.status(400).json({ error: 'agent_not_installed' })
    }

    // .env-Inhalt aufbauen
    const keyVarMap: Record<string, string> = {
      anthropic: 'ANTHROPIC_API_KEY',
      openai: 'OPENAI_API_KEY',
      openrouter: 'OPENROUTER_API_KEY',
      google: 'GOOGLE_API_KEY',
    }
    const envLines = [`HERMES_INFERENCE_PROVIDER=${provider}`]
    if (keyVarMap[provider] && apiKey) envLines.push(`${keyVarMap[provider]}=${apiKey}`)
    if (model) envLines.push(`HERMES_MODEL=${model}`)
    if (provider === 'ollama' && baseUrl) envLines.push(`OLLAMA_BASE_URL=${baseUrl}`)

    // Base64 encoding für sicheres Schreiben via exec
    const envContentB64 = Buffer.from(envLines.join('\n')).toString('base64')

    // Exec erstellen: .env schreiben
    const execCreateRes = await fetch(`${dockerHost}/containers/${existing.Id}/exec`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        Cmd: ['sh', '-c', `echo ${envContentB64} | base64 -d > /opt/data/.env`],
        AttachStdout: true,
        AttachStderr: true,
      }),
      signal: AbortSignal.timeout(10000),
    })
    if (!execCreateRes.ok) {
      throw new Error(`Exec erstellen fehlgeschlagen: HTTP ${execCreateRes.status}`)
    }
    const { Id: execId } = await execCreateRes.json() as { Id: string }

    // Exec ausführen
    await fetch(`${dockerHost}/exec/${execId}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Detach: false }),
      signal: AbortSignal.timeout(15000),
    })

    // Container neustarten
    await fetch(`${dockerHost}/containers/${existing.Id}/restart?t=5`, {
      method: 'POST',
      signal: AbortSignal.timeout(30000),
    })

    await audit({ action: 'setup.agent_configured', target: provider, req })
    res.json({ ok: true, message: `Agent mit Provider "${provider}" konfiguriert` })
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message ?? 'Unbekannter Fehler' })
  }
})

// POST /api/setup/agent-wizard
// Startet eine TTY-Session mit "hermes setup" im hermes-agent Container.
// Gibt sessionId zurück; Client verbindet sich dann via /api/terminal-stream (attach).
router.post('/agent-wizard', async (req, res) => {
  const dockerHost = process.env.DOCKER_HOST?.replace('tcp://', 'http://') || 'http://socket-proxy:2375'

  try {
    // Container finden
    const listRes = await fetch(
      `${dockerHost}/containers/json?all=0&filters=${encodeURIComponent(JSON.stringify({ name: ['hermes-agent'] }))}`,
      { signal: AbortSignal.timeout(8000) }
    )
    const containers = await listRes.json() as Array<{ Id: string; Names: string[] }>
    const found = containers.find(c => c.Names.some(n => n.includes('hermes-agent')))
    if (!found) {
      return res.status(400).json({ error: 'agent_not_installed' })
    }

    const containerName = found.Names[0]?.replace(/^\//, '') ?? found.Id.slice(0, 12)

    // DOCKER_HOST auf Unix-Socket setzen: docker exec -it braucht direkte Socket-Verbindung
    // (der socket-proxy unterstützt kein TTY-Hijacking für interaktive Exec-Sessions)
    const session = createTerminalSession({
      command: ['docker', 'exec', '-it', containerName, 'hermes', 'setup'],
      cols: 120,
      rows: 34,
      env: { DOCKER_HOST: 'unix:///var/run/docker.sock' },
    })

    res.json({ sessionId: session.id, containerName })
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'Unbekannter Fehler' })
  }
})

export default router
