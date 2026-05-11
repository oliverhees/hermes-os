import type { Request, Response, NextFunction } from 'express'
import { auth } from '../auth'

declare global {
  namespace Express {
    interface Request {
      authUser?: {
        id: string
        email: string
        role: 'admin' | 'user'
      }
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const session = await auth.api.getSession({ headers: req.headers as any })
  if (!session?.user) {
    return res.status(401).json({ error: 'unauthenticated' })
  }
  req.authUser = {
    id: session.user.id,
    email: session.user.email,
    role: (session.user as any).role,
  }
  next()
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.authUser?.role !== 'admin') {
    return res.status(403).json({ error: 'admin_required' })
  }
  next()
}
