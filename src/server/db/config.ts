import { eq } from 'drizzle-orm'
import { db } from './index'
import { systemConfig } from './schema'
import { encrypt, decrypt, isEncrypted, type EncryptedBlob } from './encryption'

const ENCRYPTED_KEYS = new Set<string>([
  'llm_provider_api_key',
  'forgejo_api_token',
  'caddy_admin_token',
])

export async function getSystemConfig<T = unknown>(key: string): Promise<T | null> {
  const row = await db.select().from(systemConfig).where(eq(systemConfig.key, key)).limit(1)
  if (!row[0]) return null
  const v = row[0].value
  if (row[0].encrypted && isEncrypted(v)) {
    return JSON.parse(decrypt(v as EncryptedBlob)) as T
  }
  return v as T
}

export async function setSystemConfig(key: string, value: unknown): Promise<void> {
  const shouldEncrypt = ENCRYPTED_KEYS.has(key)
  const stored = shouldEncrypt ? encrypt(JSON.stringify(value)) : value
  await db.insert(systemConfig).values({
    key,
    value: stored as any,
    encrypted: shouldEncrypt,
  }).onConflictDoUpdate({
    target: systemConfig.key,
    set: { value: stored as any, encrypted: shouldEncrypt, updatedAt: new Date() },
  })
}

export async function deleteSystemConfig(key: string): Promise<void> {
  await db.delete(systemConfig).where(eq(systemConfig.key, key))
}
