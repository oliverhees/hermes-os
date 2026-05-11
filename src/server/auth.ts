import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { twoFactor } from 'better-auth/plugins'
import { db } from './db'
import { user } from './db/schema'
import { getSystemConfig } from './db/config'
import { encrypt, decrypt, isEncrypted } from './db/encryption'
import { audit } from './db/audit'
import { count } from 'drizzle-orm'

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg' }),

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    requireEmailVerification: false,
  },

  plugins: [
    twoFactor({
      issuer: 'hermes-os',
      otpOptions: {
        digits: 6,
        period: 30,
      },
      schema: {
        twoFactor: {
          fields: {
            secret: {
              type: 'string',
              transform: {
                input: (val: string) => JSON.stringify(encrypt(val)),
                output: (val: string) => {
                  const parsed = JSON.parse(val)
                  if (isEncrypted(parsed)) return decrypt(parsed)
                  return val
                },
              },
            },
          },
        },
      },
    }),
  ],

  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 60 * 5 },
  },

  rateLimit: {
    window: 60,
    max: 100,
    customRules: {
      '/sign-in/email': { window: 60, max: 5 },
      '/sign-up/email': { window: 300, max: 3 },
      '/two-factor/verify-totp': { window: 60, max: 5 },
    },
  },

  advanced: {
    cookiePrefix: 'hermes-os',
    useSecureCookies: process.env.NODE_ENV === 'production',
    crossSubDomainCookies: { enabled: false },
  },

  trustedOrigins: async () => {
    const domain = await getSystemConfig<string>('domain')
    return domain ? [`https://${domain}`, `http://${domain}`] : []
  },

  databaseHooks: {
    user: {
      create: {
        before: async (newUser) => {
          const [{ value: existingCount }] = await db
            .select({ value: count() })
            .from(user)
          return {
            data: {
              ...newUser,
              role: existingCount === 0 ? 'admin' : 'user',
              status: 'active',
            },
          }
        },
        after: async (createdUser, ctx) => {
          await audit({
            userId: createdUser.id,
            action: 'auth.sign_up',
            metadata: { role: (createdUser as any).role, email: createdUser.email },
            req: ctx?.context?.request as any,
          })
        },
      },
    },
    session: {
      create: {
        after: async (createdSession, ctx) => {
          await audit({
            userId: createdSession.userId,
            action: 'auth.sign_in',
            req: ctx?.context?.request as any,
          })
        },
      },
    },
  },
})

export type Session = typeof auth.$Infer.Session
