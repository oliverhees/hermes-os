import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGO = 'aes-256-gcm'
const KEY_ENV = 'ENCRYPTION_KEY'

function getKey(): Buffer {
  const raw = process.env[KEY_ENV]
  if (!raw) throw new Error(`${KEY_ENV} env var is required (run scripts/init-encryption-key.sh)`)
  const buf = Buffer.from(raw, 'base64')
  if (buf.length !== 32) throw new Error(`${KEY_ENV} must be 32 bytes (base64-encoded)`)
  return buf
}

export type EncryptedBlob = {
  _enc: 'v1'
  iv: string
  data: string
  tag: string
}

export function isEncrypted(value: unknown): value is EncryptedBlob {
  return !!value && typeof value === 'object' && (value as any)._enc === 'v1'
}

export function encrypt(plaintext: string): EncryptedBlob {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGO, getKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return {
    _enc: 'v1',
    iv: iv.toString('base64'),
    data: ciphertext.toString('base64'),
    tag: tag.toString('base64'),
  }
}

export function decrypt(blob: EncryptedBlob): string {
  const iv = Buffer.from(blob.iv, 'base64')
  const data = Buffer.from(blob.data, 'base64')
  const tag = Buffer.from(blob.tag, 'base64')
  const decipher = createDecipheriv(ALGO, getKey(), iv)
  decipher.setAuthTag(tag)
  const plaintext = Buffer.concat([decipher.update(data), decipher.final()])
  return plaintext.toString('utf8')
}
