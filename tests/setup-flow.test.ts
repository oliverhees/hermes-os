import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import { app } from '../server-entry'
import { db } from '../src/server/db'
import { user, systemConfig } from '../src/server/db/schema'

describe('Setup flow', () => {
  beforeAll(async () => {
    await db.delete(user)
    await db.delete(systemConfig)
  })

  it('rejects finalize without admin', async () => {
    const res = await request(app).post('/api/setup/finalize')
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('no_admin')
  })

  it('rejects finalize without 2fa', async () => {
    await request(app).post('/api/setup/domain').send({ domain: 'test.local', skipDnsCheck: true })
    await request(app).post('/api/auth/sign-up/email').send({
      email: 'admin@test.local', password: 'verysecurepassword123', name: 'Admin',
    })
    await request(app).post('/api/setup/provider').send({
      provider: 'anthropic', apiKey: 'sk-ant-test-1234567890abcdef',
    })
    const res = await request(app).post('/api/setup/finalize')
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('admin_2fa_missing')
  })
})
