import { randomBytes } from 'node:crypto'

const DOCKER_API = 'http://socket-proxy:2375/v1.41'
const FORGEJO_URL = 'http://forgejo:3000'
const FORGEJO_IMAGE = 'codeberg.org/forgejo/forgejo'
const FORGEJO_TAG = '8'
const CONTAINER_NAME = 'hermes-forgejo'
const VOLUME_NAME = 'hermes_forgejo_data'
const ADMIN_USER = 'hermesadmin'
const ADMIN_EMAIL = 'admin@hermesos.local'

const PASSWORD_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%'

export function generatePassword(): string {
  const bytes = randomBytes(16)
  const alphabetLen = PASSWORD_ALPHABET.length
  let out = ''
  for (let i = 0; i < 16; i++) {
    out += PASSWORD_ALPHABET[bytes[i] % alphabetLen]
  }
  return out
}

type ContainerInspect = {
  Id: string
  State: { Running: boolean }
}

type ExecCreateResponse = {
  Id: string
}

type ForgejoTokenResponse = {
  sha1: string
}

type ForgejoRepoResponse = {
  html_url: string
  name: string
}

async function drainStream(body: ReadableStream<Uint8Array> | null): Promise<void> {
  if (!body) return
  const reader = body.getReader()
  try {
    while (true) {
      const { done } = await reader.read()
      if (done) return
    }
  } finally {
    reader.releaseLock()
  }
}

async function pullImage(): Promise<void> {
  const fromImage = encodeURIComponent(`${FORGEJO_IMAGE}`)
  const res = await fetch(`${DOCKER_API}/images/create?fromImage=${fromImage}&tag=${FORGEJO_TAG}`, {
    method: 'POST',
  })
  // Drain the response stream so the pull completes (or returns immediately if cached).
  await drainStream(res.body)
}

async function createVolume(): Promise<void> {
  const res = await fetch(`${DOCKER_API}/volumes/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ Name: VOLUME_NAME }),
  })
  if (res.status === 409) return
  if (!res.ok && res.status !== 201) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Docker volume create failed (${res.status}): ${detail}`)
  }
}

async function inspectContainer(): Promise<ContainerInspect | null> {
  const res = await fetch(`${DOCKER_API}/containers/${CONTAINER_NAME}/json`)
  if (res.status === 404) return null
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Docker container inspect failed (${res.status}): ${detail}`)
  }
  return (await res.json()) as ContainerInspect
}

async function startContainerByName(): Promise<void> {
  const res = await fetch(`${DOCKER_API}/containers/${CONTAINER_NAME}/start`, {
    method: 'POST',
  })
  if (!res.ok && res.status !== 304) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Docker container start failed (${res.status}): ${detail}`)
  }
}

async function createAndStartContainer(): Promise<void> {
  const createBody = {
    Image: `${FORGEJO_IMAGE}:${FORGEJO_TAG}`,
    Hostname: 'forgejo',
    Env: [
      'USER_UID=1000',
      'USER_GID=1000',
      'FORGEJO__security__INSTALL_LOCK=true',
      'FORGEJO__database__DB_TYPE=sqlite3',
      'FORGEJO__server__HTTP_PORT=3000',
      'FORGEJO__server__DOMAIN=forgejo',
      'FORGEJO__server__ROOT_URL=http://forgejo:3000/',
    ],
    HostConfig: {
      NetworkMode: 'hermes-os_internal',
      Binds: [`${VOLUME_NAME}:/data`],
    },
  }

  const createRes = await fetch(
    `${DOCKER_API}/containers/create?name=${CONTAINER_NAME}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createBody),
    },
  )
  if (!createRes.ok) {
    const detail = await createRes.text().catch(() => '')
    throw new Error(`Docker container create failed (${createRes.status}): ${detail}`)
  }
  const created = (await createRes.json()) as { Id: string }

  const startRes = await fetch(`${DOCKER_API}/containers/${created.Id}/start`, {
    method: 'POST',
  })
  if (!startRes.ok && startRes.status !== 304) {
    const detail = await startRes.text().catch(() => '')
    throw new Error(`Docker container start failed (${startRes.status}): ${detail}`)
  }
}

async function waitForForgejoReady(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const res = await fetch(`${FORGEJO_URL}/api/healthz`, {
        signal: AbortSignal.timeout(1500),
      })
      if (res.status === 200) return
    } catch {
      // Ignore timeouts and connection errors during startup.
    }
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
  throw new Error('Forgejo did not start within 120s')
}

async function adminUserExists(): Promise<boolean> {
  const res = await fetch(`${FORGEJO_URL}/api/v1/users/${ADMIN_USER}`)
  return res.status === 200
}

async function createAdminUser(adminPassword: string): Promise<void> {
  const execCreateRes = await fetch(
    `${DOCKER_API}/containers/${CONTAINER_NAME}/exec`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        AttachStdout: true,
        AttachStderr: true,
        Cmd: [
          'forgejo',
          'admin',
          'user',
          'create',
          '--username',
          ADMIN_USER,
          '--password',
          adminPassword,
          '--email',
          ADMIN_EMAIL,
          '--admin',
          '--must-change-password=false',
        ],
      }),
    },
  )
  if (!execCreateRes.ok) {
    const detail = await execCreateRes.text().catch(() => '')
    throw new Error(`Docker exec create failed (${execCreateRes.status}): ${detail}`)
  }
  const exec = (await execCreateRes.json()) as ExecCreateResponse

  const execStartRes = await fetch(`${DOCKER_API}/exec/${exec.Id}/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ Detach: false }),
  })
  if (!execStartRes.ok) {
    const detail = await execStartRes.text().catch(() => '')
    throw new Error(`Docker exec start failed (${execStartRes.status}): ${detail}`)
  }
  await drainStream(execStartRes.body)
}

async function createApiToken(adminPassword: string): Promise<string> {
  const basicAuth = Buffer.from(`${ADMIN_USER}:${adminPassword}`).toString('base64')
  const res = await fetch(`${FORGEJO_URL}/api/v1/users/${ADMIN_USER}/tokens`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: `hermes-wizard-${Date.now()}` }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Forgejo token create failed (${res.status}): ${detail}`)
  }
  const data = (await res.json()) as ForgejoTokenResponse
  return data.sha1
}

export async function provisionForgejo(): Promise<{
  url: string
  adminUser: string
  adminPassword: string
  apiToken: string
}> {
  const adminPassword = generatePassword()

  try {
    await pullImage()
    await createVolume()

    const existing = await inspectContainer()
    let needsReadyWait = true

    if (existing && existing.State.Running) {
      // Already running — skip the readiness wait and go straight to admin check.
      needsReadyWait = false
    } else if (existing) {
      await startContainerByName()
    } else {
      await createAndStartContainer()
    }

    if (needsReadyWait) {
      await waitForForgejoReady()
    }

    if (!(await adminUserExists())) {
      await createAdminUser(adminPassword)
    }

    const apiToken = await createApiToken(adminPassword)

    return {
      url: FORGEJO_URL,
      adminUser: ADMIN_USER,
      adminPassword,
      apiToken,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Forgejo provisioning failed: ${message}`)
  }
}

async function getAuthenticatedUser(forgejoUrl: string, apiToken: string): Promise<string> {
  const res = await fetch(`${forgejoUrl}/api/v1/user`, {
    headers: { Authorization: `token ${apiToken}` },
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Forgejo user lookup failed (${res.status}): ${detail}`)
  }
  const data = (await res.json()) as { login: string }
  return data.login
}

export async function vaultExists(forgejoUrl: string, apiToken: string, repoName: string): Promise<boolean> {
  const username = await getAuthenticatedUser(forgejoUrl, apiToken)
  const res = await fetch(`${forgejoUrl}/api/v1/repos/${username}/${repoName}`, {
    headers: { Authorization: `token ${apiToken}` },
  })
  return res.status === 200
}

export async function createStarterVault(
  forgejoUrl: string,
  apiToken: string,
  repoName = 'paione-vault',
): Promise<{ repoUrl: string; repoName: string }> {
  const username = await getAuthenticatedUser(forgejoUrl, apiToken)

  const existsRes = await fetch(`${forgejoUrl}/api/v1/repos/${username}/${repoName}`, {
    headers: { Authorization: `token ${apiToken}` },
  })
  if (existsRes.status === 200) {
    const data = (await existsRes.json()) as ForgejoRepoResponse
    return { repoUrl: data.html_url, repoName: data.name }
  }

  const migrateRes = await fetch(`${forgejoUrl}/api/v1/repos/migrate`, {
    method: 'POST',
    headers: {
      Authorization: `token ${apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      clone_addr: 'https://github.com/oliverhees/paione-vault',
      repo_name: repoName,
      repo_owner: username,
      mirror: false,
      private: false,
      description: 'Hermes OS starter vault',
    }),
  })

  if (!migrateRes.ok) {
    const detail = await migrateRes.text().catch(() => '')
    throw new Error(`Forgejo migrate failed (${migrateRes.status}): ${detail}`)
  }

  const data = (await migrateRes.json()) as ForgejoRepoResponse
  return { repoUrl: data.html_url, repoName: data.name }
}
