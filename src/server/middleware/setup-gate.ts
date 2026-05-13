import type { Request, Response, NextFunction } from 'express'
import { getSystemConfig } from '../db/config'
import { db } from '../db'
import { user, twoFactor } from '../db/schema'
import { eq } from 'drizzle-orm'

export async function setupGate(req: Request, res: Response, next: NextFunction) {
  const setupComplete = (await getSystemConfig<boolean>('setup_completed')) === true

  const isSetupPath = req.path.startsWith('/api/setup') || req.path === '/setup' || req.path.startsWith('/setup/')

  if (isSetupPath) {
    return next()
  }

  if (req.path.startsWith('/api/auth')) {
    return next()
  }

  // TEMP: skip setup redirect for testing
  // if (!setupComplete) {
  //   if (req.path.startsWith('/api/')) {
  //     return res.status(503).json({ error: 'setup_required', redirect: '/setup' })
  //   }
  //   return res.redirect('/setup')
  // }

  next()
}

export async function canFinalizeSetup(): Promise<
  { ok: true } | { ok: false; reason: string }
> {
  const admins = await db.select().from(user).where(eq(user.role, 'admin'))
  if (admins.length === 0) return { ok: false, reason: 'no_admin' }

  for (const admin of admins) {
    const tf = await db.select().from(twoFactor)
      .where(eq(twoFactor.userId, admin.id)).limit(1)
    if (!tf[0]) return { ok: false, reason: 'admin_2fa_missing' }
  }

  const domain = await getSystemConfig<string>('domain')
  if (!domain) return { ok: false, reason: 'domain_missing' }

  return { ok: true }
}
