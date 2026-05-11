import { useEffect, useState } from 'react'
import { setupApi, type SetupStatus } from './api'

export function useSetupStatus() {
  const [status, setStatus] = useState<SetupStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const refresh = async () => {
    try {
      setLoading(true)
      const s = await setupApi.status()
      setStatus(s)
      setError(null)
    } catch (err) {
      setError(err as Error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  return { status, loading, error, refresh }
}
