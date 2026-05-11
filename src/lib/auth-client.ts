import { createAuthClient } from 'better-auth/react'
import { twoFactorClient } from 'better-auth/plugins/two-factor'

export const authClient = createAuthClient({
  baseURL: typeof window !== 'undefined' ? window.location.origin : '',
  plugins: [twoFactorClient()],
})

export const { signIn, signUp, signOut, useSession, twoFactor } = authClient
