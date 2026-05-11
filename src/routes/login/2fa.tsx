import { createFileRoute } from '@tanstack/react-router'
import { TwoFactorChallenge } from '@/pages/auth/TwoFactorChallenge'

export const Route = createFileRoute('/login/2fa')({
  component: TwoFactorChallengeRoute,
})

function TwoFactorChallengeRoute() {
  return <TwoFactorChallenge />
}
