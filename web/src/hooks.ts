import { useCallback, useEffect, useState } from 'react'

export type ThemeMode = 'dark' | 'light' | 'system'

/** Theme with dark/light/system + persistence + live system-preference tracking. */
export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(() => {
    try {
      return (localStorage.getItem('thisdid-theme') as ThemeMode) || 'dark'
    } catch {
      return 'dark'
    }
  })
  const [systemDark, setSystemDark] = useState(true)

  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    setSystemDark(mql.matches)
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  const resolved: 'dark' | 'light' = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode

  const set = useCallback((m: ThemeMode) => {
    setMode(m)
    try {
      localStorage.setItem('thisdid-theme', m)
    } catch {
      /* ignore */
    }
  }, [])

  return { mode, resolved, set }
}

/** navigator.clipboard copy with a transient "copied" flag. */
export function useCopy(timeout = 1400) {
  const [copied, setCopied] = useState(false)
  const copy = useCallback(
    (text: string) => {
      try {
        void navigator.clipboard.writeText(text)
      } catch {
        /* ignore */
      }
      setCopied(true)
      const t = setTimeout(() => setCopied(false), timeout)
      return () => clearTimeout(t)
    },
    [timeout],
  )
  return { copied, copy }
}
