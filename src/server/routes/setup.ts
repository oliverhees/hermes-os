import { Router } from 'express'
import { setSystemConfig, getSystemConfig } from '../db/config'
import { canFinalizeSetup } from '../middleware/setup-gate'
import { isValidDomain, verifyDomainDns } from '../services/domain'
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

router.post('/provider', async (req, res) => {
  const { provider, apiKey, model } = req.body ?? {}
  const allowed = ['anthropic', 'openai', 'openrouter', 'google', 'ollama']
  if (!allowed.includes(provider)) {
    return res.status(400).json({ error: 'invalid_provider' })
  }
  if (provider !== 'ollama' && (!apiKey || typeof apiKey !== 'string' || apiKey.length < 20)) {
    return res.status(400).json({ error: 'invalid_api_key' })
  }

  await setSystemConfig('llm_provider', { provider, model: model ?? null })
  await setSystemConfig('llm_provider_api_key', apiKey ?? null)
  await audit({ action: 'setup.provider_configured', target: provider, req })

  res.json({ ok: true, next: '/api/setup/vault' })
})

router.post('/vault', async (req, res) => {
  const { forgejoUrl, apiToken } = req.body ?? {}
  if (!forgejoUrl || !/^https?:\/\//.test(forgejoUrl)) {
    return res.status(400).json({ error: 'invalid_forgejo_url' })
  }
  if (!apiToken || typeof apiToken !== 'string' || apiToken.length < 20) {
    return res.status(400).json({ error: 'invalid_api_token' })
  }

  await setSystemConfig('vault_forgejo_url', forgejoUrl)
  await setSystemConfig('forgejo_api_token', apiToken)
  await audit({ action: 'setup.vault_configured', target: forgejoUrl, req })

  res.json({ ok: true, next: '/api/setup/finalize' })
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

export default router
