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
  setDomain: (domain: string) =>
    request<{ ok: true; domain: string }>('/api/setup/domain', {
      method: 'POST',
      body: JSON.stringify({ domain }),
    }),
  setProvider: (provider: string, apiKey: string, model?: string) =>
    request<{ ok: true }>('/api/setup/provider', {
      method: 'POST',
      body: JSON.stringify({ provider, apiKey, model }),
    }),
  setVault: (forgejoUrl: string, apiToken: string) =>
    request<{ ok: true }>('/api/setup/vault', {
      method: 'POST',
      body: JSON.stringify({ forgejoUrl, apiToken }),
    }),
  finalize: () =>
    request<{ ok: true; redirect: string }>('/api/setup/finalize', { method: 'POST' }),
}

export type SetupStatus = {
  completed: boolean
  canFinalize: boolean
  blocker: string | null
  domain: string | null
  provider: { provider: string; model: string | null } | null
  vault: string | null
}
