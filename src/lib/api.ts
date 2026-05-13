type Json = Record<string, unknown> | unknown[] | string | number | boolean | null

async function request<T = Json>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(res.status, body.error ?? res.statusText, body)
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T)
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body: Record<string, unknown> = {}
  ) {
    super(message)
  }
}

export const setupApi = {
  status: () => request<SetupStatus>('/api/setup/status'),
  bootstrap: () => request<{ domain: string | null; publicIp: string | null }>('/api/setup/bootstrap'),
  setDomain: (domain: string, skipDnsCheck = false) =>
    request<{ ok: true; domain: string }>('/api/setup/domain', {
      method: 'POST',
      body: JSON.stringify({ domain, skipDnsCheck }),
    }),
  probeModels: (baseUrl: string, apiKey: string) =>
    request<{ ok: true; models: string[] }>('/api/setup/probe-models', {
      method: 'POST',
      body: JSON.stringify({ baseUrl, apiKey }),
    }),
  setProvider: (provider: string, apiKey: string, model?: string, baseUrl?: string) =>
    request<{ ok: true }>('/api/setup/provider', {
      method: 'POST',
      body: JSON.stringify({ provider, apiKey, model, baseUrl }),
    }),
  setVault: (forgejoUrl: string, apiToken: string, vaultRepo?: string) =>
    request<{ ok: true }>('/api/setup/vault', {
      method: 'POST',
      body: JSON.stringify({ forgejoUrl, apiToken, vaultRepo }),
    }),
  provisionForgejo: () =>
    request<{ ok: true; url: string; adminUser: string; adminPassword: string; apiToken: string }>(
      '/api/setup/provision-forgejo',
      { method: 'POST' }
    ),
  createVault: (forgejoUrl: string, apiToken: string, repoName?: string) =>
    request<{ ok: true; repoUrl: string; repoName: string }>('/api/setup/create-vault', {
      method: 'POST',
      body: JSON.stringify({ forgejoUrl, apiToken, repoName }),
    }),
  checkVault: (forgejoUrl: string, apiToken: string, repoName: string) =>
    request<{ exists: boolean }>(
      `/api/setup/check-vault?${new URLSearchParams({ forgejoUrl, apiToken, repoName })}`,
    ),
  finalize: () =>
    request<{ ok: true; redirect: string }>('/api/setup/finalize', { method: 'POST' }),
  agentStatus: () =>
    request<{ running: boolean; status: string }>('/api/setup/agent-status'),
  startAgent: () =>
    request<{ ok: boolean; message: string }>('/api/setup/start-agent', { method: 'POST' }),
  configureAgent: (provider: string, apiKey?: string, model?: string, baseUrl?: string) =>
    request<{ ok: boolean; message: string }>('/api/setup/configure-agent', {
      method: 'POST',
      body: JSON.stringify({ provider, apiKey, model, baseUrl }),
    }),
}

export type SetupStatus = {
  completed: boolean
  canFinalize: boolean
  blocker: string | null
  domain: string | null
  provider: { provider: string; model: string | null } | null
  vault: string | null
}
