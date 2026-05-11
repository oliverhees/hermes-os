export type ThemeMode = 'light' | 'dark'

const STORAGE_KEY = 'hermes-theme-mode'
const DEFAULT_MODE: ThemeMode = 'dark'

export function getThemeMode(): ThemeMode {
  if (typeof window === 'undefined') return DEFAULT_MODE
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored === 'light' || stored === 'dark' ? stored : DEFAULT_MODE
}

export function setThemeMode(mode: ThemeMode): void {
  const root = document.documentElement
  root.setAttribute('data-theme', mode)
  root.classList.remove('light', 'dark', 'system')
  root.classList.add(mode)
  root.style.setProperty('color-scheme', mode)
  localStorage.setItem(STORAGE_KEY, mode)
}

export function toggleTheme(): ThemeMode {
  const next = getThemeMode() === 'dark' ? 'light' : 'dark'
  setThemeMode(next)
  return next
}
