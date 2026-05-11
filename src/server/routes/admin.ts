import { Router } from 'express'
import { db } from '../db'
import { auditLog, user } from '../db/schema'
import { desc } from 'drizzle-orm'
import { requireAuth, requireAdmin } from '../middleware/require-auth'

const router = Router()
router.use(requireAuth, requireAdmin)

router.get('/audit-log', async (req, res) => {
  const limit = Math.min(parseInt(String(req.query.limit ?? '100'), 10) || 100, 500)
  const rows = await db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(limit)
  res.json(rows)
})

router.get('/users', async (_req, res) => {
  const rows = await db.select({
    id: user.id, email: user.email, name: user.name, role: user.role,
    status: user.status, createdAt: user.createdAt,
  }).from(user)
  res.json(rows)
})

export default router
