import { useCallback, useEffect, useRef, useState } from 'react'
import { Header } from './components/Header'
import { Hero } from './components/Hero'
import { Results } from './components/Results'
import { HowItWorks, Methods, ResolverProviders, NetworkCTA, Footer } from './components/Sections'
import { LiveStats } from './components/LiveStats'
import { ScanModal } from './components/ScanModal'
import { resolveDid, validateDid, type ResolveOk } from './lib/api'
import { fetchStats, type LiveStatsData } from './lib/stats'
import { useCopy, useTheme } from './hooks'

const ERROR_COPY: Record<string, string> = {
  invalidDid: 'That doesn’t look like a DID. Format: did:<method>:<id>',
  notFound: 'No DID document was found for this identifier.',
  unsupportedDidMethod: 'That DID method isn’t supported yet — try another.',
  representationNotSupported: 'This DID could not be represented as JSON-LD.',
}

export function App() {
  const { mode, resolved, set: setMode } = useTheme()
  const { copied, copy } = useCopy()

  const [query, setQuery] = useState('')
  const [resolving, setResolving] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [result, setResult] = useState<ResolveOk | null>(null)
  const [tab, setTab] = useState<'overview' | 'json'>('overview')
  const [scan, setScan] = useState(false)
  const [stats, setStats] = useState<LiveStatsData | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const focusSearch = useCallback(() => {
    setTimeout(() => inputRef.current?.focus(), 120)
  }, [])

  const runResolve = useCallback(async (value: string) => {
    const did = value.trim()
    const invalid = validateDid(did)
    if (invalid) {
      setError(invalid)
      return
    }
    setQuery(did)
    setError('')
    setResult(null)
    setResolving(true)
    setProgress(8)
    if (progressTimer.current) clearInterval(progressTimer.current)
    progressTimer.current = setInterval(() => {
      setProgress((p) => Math.min(92, p + 8 + Math.random() * 14))
    }, 120)

    try {
      const outcome = await resolveDid(did)
      if (progressTimer.current) clearInterval(progressTimer.current)
      setProgress(100)
      if (!outcome.ok) {
        setError(ERROR_COPY[outcome.error] ?? `Resolution failed (${outcome.error}).`)
        setResolving(false)
        return
      }
      setResult(outcome)
      setTab('overview')
      setResolving(false)
      setTimeout(() => {
        const el = resultsRef.current
        if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 74, behavior: 'smooth' })
      }, 60)
    } catch {
      if (progressTimer.current) clearInterval(progressTimer.current)
      setResolving(false)
      setError('Could not reach the resolver. Check your connection and try again.')
    }
  }, [])

  // Resolve a `/did:...` deep link on first load.
  useEffect(() => {
    const path = decodeURIComponent(window.location.pathname.replace(/^\//, ''))
    if (path.toLowerCase().startsWith('did:')) void runResolve(path)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => () => {
    if (progressTimer.current) clearInterval(progressTimer.current)
  }, [])

  // Live all-time stats for the KPI strip and the routing animation (polled).
  useEffect(() => {
    let alive = true
    const load = () => void fetchStats().then((s) => alive && s && setStats(s))
    load()
    const id = setInterval(load, 20000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  return (
    <div
      data-theme={resolved}
      style={{
        minHeight: '100vh',
        background:
          'radial-gradient(1200px 600px at 78% -8%, var(--glow), transparent 60%), radial-gradient(900px 500px at 0% 12%, rgba(181,135,240,0.08), transparent 55%), var(--bg)',
        color: 'var(--text)',
        position: 'relative',
        overflowX: 'hidden',
      }}
    >
      <Header mode={mode} setMode={setMode} onScan={() => setScan(true)} />
      {scan && (
        <ScanModal
          onClose={() => setScan(false)}
          onResolve={(did) => {
            setScan(false)
            void runResolve(did)
          }}
        />
      )}

      <Hero
        query={query}
        setQuery={(v) => {
          setQuery(v)
          setError('')
        }}
        onResolve={() => void runResolve(query)}
        onExample={(did) => void runResolve(did)}
        resolving={resolving}
        progress={progress}
        error={error}
        inputRef={inputRef}
        dark={resolved === 'dark'}
        stats={stats}
      />

      <LiveStats stats={stats} />

      <div ref={resultsRef} />
      {result && <Results view={result.view} tab={tab} setTab={setTab} copy={copy} copied={copied} />}

      <HowItWorks />
      <Methods onResolve={(did) => void runResolve(did)} />
      <ResolverProviders />
      <NetworkCTA onResolveCta={focusSearch} />
      <Footer />
    </div>
  )
}
