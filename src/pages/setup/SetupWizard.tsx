import { useState } from 'react'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { WizardLayout, type WizardStep } from '@/components/wizard/WizardLayout'
import { useSetupStatus } from '@/lib/setup-status'
import { useSession } from '@/lib/auth-client'
import { StepDomain } from './StepDomain'
import { StepAdmin } from './StepAdmin'
import { StepTwoFactor } from './StepTwoFactor'
import { StepVault } from './StepVault'
import { StepAgent } from './StepAgent'
import { StepAgentConfig } from './StepAgentConfig'
import { StepDone } from './StepDone'

export function SetupWizard() {
  const location = useLocation()
  const navigate = useNavigate()
  const { status, refresh } = useSetupStatus()
  const { data: session } = useSession()

  const currentStep = ((location.search as Record<string, string>).step) || 'domain'

  const steps: WizardStep[] = [
    { id: 'domain', label: 'Domain', done: !!status?.domain, current: currentStep === 'domain' },
    { id: 'admin', label: 'Admin Account', done: !!session?.user, current: currentStep === 'admin' },
    {
      id: 'two-factor',
      label: 'Two-Factor Auth',
      done: !!(session?.user as any)?.twoFactorEnabled,
      current: currentStep === 'two-factor',
    },
    { id: 'vault', label: 'Forgejo Vault', done: !!status?.vault, current: currentStep === 'vault' },
    { id: 'agent', label: 'Hermes Agent', done: ['agent-config', 'done'].includes(currentStep), current: currentStep === 'agent' },
    { id: 'agent-config', label: 'KI-Provider', done: currentStep === 'done', current: currentStep === 'agent-config' },
    { id: 'done', label: 'Finish', done: !!status?.completed, current: currentStep === 'done' },
  ]

  function navigateToStep(step: string) {
    refresh()
    navigate({ to: '/setup', search: { step } as any })
  }

  let content: React.ReactNode = null

  switch (currentStep) {
    case 'domain':
      content = <StepDomain onNext={() => navigateToStep('admin')} />
      break
    case 'admin':
      content = <StepAdmin onNext={() => navigateToStep('two-factor')} />
      break
    case 'two-factor':
      content = <StepTwoFactor onNext={() => navigateToStep('vault')} />
      break
    case 'vault':
      content = <StepVault onNext={() => navigateToStep('agent')} />
      break
    case 'agent':
      content = <StepAgent onNext={() => navigateToStep('agent-config')} />
      break
    case 'agent-config':
      content = <StepAgentConfig onNext={() => navigateToStep('done')} />
      break
    case 'done':
      content = <StepDone />
      break
    default:
      content = <StepDomain onNext={() => navigateToStep('admin')} />
  }

  return <WizardLayout steps={steps}>{content}</WizardLayout>
}
