import { db } from './index'
import { auditLog } from './schema'
import type { Request } from 'express'

export type AuditAction =
  | 'setup.domain_set'
  | 'setup.provider_configured'
  | 'setup.vault_configured'
  | 'setup.finalized'
  | 'auth.sign_up'
  | 'auth.sign_in'
  | 'auth.sign_out'
  | 'auth.failed_login'
  | 'auth.two_factor_enabled'
  | 'auth.two_factor_disabled'
  | 'auth.password_changed'
  | 'user.created'
  | 'user.suspended'
  | 'user.deleted'
  | 'container.created'
  | 'container.deleted'
  | 'admin.config_changed'

export async function audit(opts: {
  userId?: string | null
  action: AuditAction
  target?: string
  metadata?: Record<string, unknown>
  req?: Request
}) {
  await db.insert(auditLog).values({
    userId: opts.userId ?? null,
    action: opts.action,
    target: opts.target ?? null,
    metadata: opts.metadata ?? null,
    ipAddress: opts.req?.ip ?? null,
    userAgent: opts.req?.headers?.['user-agent']?.toString() ?? null,
  })
}
