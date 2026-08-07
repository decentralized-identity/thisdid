/**
 * thisdid-probe — connected sub-worker that health-checks every resolver route
 * with real canary DID resolutions on an effective 30-second cadence.
 *
 * Cloudflare cron granularity bottoms out at 1 minute, so the `* * * * *`
 * trigger runs one probe round immediately and a second after a 30s wall-clock
 * sleep. Each round:
 *   - fires all canaries in parallel (same 8s bound as live traffic),
 *   - appends one row per canary to the D1 `probes` table (NOT `resolutions` —
 *     probe traffic must never pollute user-facing analytics),
 *   - folds per-provider EWMAs into the `routing:health:v1` KV snapshot that
 *     the main resolver Worker reads.
 *
 * It is connected to the main Worker only through the shared D1 database and
 * STATS_KV namespace (same ids in wrangler.jsonc). It never sits on the request
 * path — if this Worker breaks, resolution and the UI are unaffected.
 */
import { resolveLocal } from '../../src/resolvers/local'
import { fetchUpstream } from '../../src/resolvers/upstream'
import { providerTag, type Step } from '../../src/resolvers/registry'
import { HEALTH_KEY, type HealthSnapshot, type ProviderHealth, type ProviderStatus } from '../../src/routing/health'

interface ProbeEnv {
  GODIDDY_RESOLVER: string
  ARCHON_RESOLVER: string
  GOPLAUSIBLE_RESOLVER: string
  /** Same secret as the main Worker (set separately: `wrangler secret put GODIDDY_API_KEY --config probe/wrangler.jsonc`). */
  GODIDDY_API_KEY?: string
  /** Gap between the two probe rounds within one cron tick, ms (default 30000; shrink in dev). */
  PROBE_SPACING_MS?: string
  DB?: D1Database
  STATS_KV?: KVNamespace
}

/** One canary per route a provider is authoritative for (mirrors the SPA examples). */
const CANARIES: { step: Step; did: string }[] = [
  { step: 'local', did: 'did:web:identity.foundation' },
  { step: 'godiddy', did: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK' },
  { step: 'goplausible', did: 'did:algo:uti7paasilrda3ishy5m7j7lnrx2aivqjwi7zkccgkvlmfd3vpr5pwsz4i' },
  { step: 'goplausible', did: 'did:nfd:goplausible.algo' },
  { step: 'archon', did: 'did:iden3:polygon:amoy:xC8VZLUUfo5p9DWUawReh7QSstmYN6zR7qsQhQCsw' },
]

/** Same wall-clock bound as a live routing step (STEP_TIMEOUT_MS in src/resolve.ts). */
const PROBE_TIMEOUT_MS = 8000
const DEFAULT_SPACING_MS = 30_000
const RETENTION_MS = 30 * 24 * 3600 * 1000

// Health-fold tuning: latency EWMA reacts in ~3 rounds, success rate in ~7;
// 3 all-canary-failed rounds (~90s) trips "down"; EWMA above 4s reads "degraded".
const EWMA_LATENCY = 0.3
const EWMA_SUCCESS = 0.15
const BREAKER_FAILS = 3
const DEGRADED_MS = 4000

interface ProbeResult {
  step: Step
  did: string
  ok: boolean
  ms: number
  error: string | null
}

function upstreamBase(step: Step, env: ProbeEnv): string {
  switch (step) {
    case 'godiddy':
      return env.GODIDDY_RESOLVER
    case 'archon':
      return env.ARCHON_RESOLVER
    case 'goplausible':
      return env.GOPLAUSIBLE_RESOLVER
    default:
      return ''
  }
}

/** Resolve one canary; ok means a usable DID document came back within the bound. */
async function probeOne(canary: { step: Step; did: string }, env: ProbeEnv): Promise<ProbeResult> {
  const started = Date.now()
  let error: string | null = null
  let ok = false
  try {
    const attempt = (async () => {
      if (canary.step === 'local') {
        const r = await resolveLocal(canary.did)
        return r.didDocument && !r.didResolutionMetadata.error ? r : null
      }
      const token = canary.step === 'godiddy' ? env.GODIDDY_API_KEY : undefined
      return fetchUpstream(canary.did, upstreamBase(canary.step, env), token)
    })()
    const hit = await Promise.race([
      attempt,
      new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), PROBE_TIMEOUT_MS)),
    ])
    if (hit === 'timeout') error = 'timeout'
    else if (!hit) error = 'miss'
    else ok = true
  } catch {
    error = 'error'
  }
  return { step: canary.step, did: canary.did, ok, ms: Date.now() - started, error }
}

/** Fold one round of results into the previous snapshot (EWMAs + breaker). */
function fold(prev: HealthSnapshot | null, results: ProbeResult[], now: number): HealthSnapshot {
  const providers: HealthSnapshot['providers'] = { ...(prev?.providers ?? {}) }
  const steps = [...new Set(results.map((r) => r.step))]
  for (const step of steps) {
    const rs = results.filter((r) => r.step === step)
    const oks = rs.filter((r) => r.ok)
    const roundOk = oks.length > 0
    const p = providers[step]

    const okAvg = oks.length ? oks.reduce((a, r) => a + r.ms, 0) / oks.length : null
    const ewmaMs =
      okAvg == null
        ? (p?.ewmaMs ?? null)
        : p?.ewmaMs == null
          ? Math.round(okAvg)
          : Math.round(EWMA_LATENCY * okAvg + (1 - EWMA_LATENCY) * p.ewmaMs)

    const roundRate = rs.length ? oks.length / rs.length : 0
    const successRate =
      p?.successRate == null
        ? roundRate
        : Math.round((EWMA_SUCCESS * roundRate + (1 - EWMA_SUCCESS) * p.successRate) * 1000) / 1000

    const consecutiveFails = roundOk ? 0 : (p?.consecutiveFails ?? 0) + 1
    const status: ProviderStatus =
      consecutiveFails >= BREAKER_FAILS
        ? 'down'
        : !roundOk || oks.length < rs.length || (ewmaMs != null && ewmaMs > DEGRADED_MS)
          ? 'degraded'
          : 'up'

    const health: ProviderHealth = {
      status,
      ewmaMs,
      successRate,
      consecutiveFails,
      lastOkTs: roundOk ? now : (p?.lastOkTs ?? null),
      lastProbeTs: now,
    }
    providers[step] = health
  }
  return { v: 1, updatedTs: now, providers }
}

let schemaReady = false

/** Self-create the probes table (mirrors migrations/0002_probes.sql, same pattern as analytics). */
async function ensureSchema(db: D1Database): Promise<void> {
  if (schemaReady) return
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS probes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        provider TEXT NOT NULL,
        step TEXT NOT NULL,
        did TEXT NOT NULL,
        method TEXT,
        success INTEGER,
        duration_ms INTEGER,
        error TEXT
      )`,
    )
    .run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_probes_ts ON probes (ts)').run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_probes_provider_ts ON probes (provider, ts)').run()
  schemaReady = true
}

/** One probe round: fire all canaries, fold into the KV snapshot, log rows to D1. */
async function runRound(env: ProbeEnv): Promise<void> {
  const now = Date.now()
  const results = await Promise.all(CANARIES.map((c) => probeOne(c, env)))

  // Snapshot first — it is what routing decisions will read.
  if (env.STATS_KV) {
    try {
      const raw = await env.STATS_KV.get(HEALTH_KEY)
      const prev = raw ? (JSON.parse(raw) as HealthSnapshot) : null
      await env.STATS_KV.put(HEALTH_KEY, JSON.stringify(fold(prev, results, now)))
    } catch (err) {
      console.error(JSON.stringify({ event: 'probe.snapshot_error', error: String(err) }))
    }
  }

  if (env.DB) {
    try {
      await ensureSchema(env.DB)
      const stmt = env.DB.prepare(
        'INSERT INTO probes (ts, provider, step, did, method, success, duration_ms, error) VALUES (?,?,?,?,?,?,?,?)',
      )
      await env.DB.batch(
        results.map((r) =>
          stmt.bind(now, providerTag(r.step), r.step, r.did, r.did.split(':')[1] ?? '', r.ok ? 1 : 0, r.ms, r.error),
        ),
      )
    } catch (err) {
      console.error(JSON.stringify({ event: 'probe.d1_error', error: String(err) }))
    }
  }

  console.log(
    JSON.stringify({
      event: 'probe.round',
      results: results.map((r) => ({ step: r.step, ok: r.ok, ms: r.ms, error: r.error })),
    }),
  )
}

async function prune(env: ProbeEnv): Promise<void> {
  if (!env.DB) return
  try {
    await ensureSchema(env.DB)
    await env.DB.prepare('DELETE FROM probes WHERE ts < ?').bind(Date.now() - RETENTION_MS).run()
  } catch (err) {
    console.error(JSON.stringify({ event: 'probe.prune_error', error: String(err) }))
  }
}

export default {
  async scheduled(ctrl, env, ctx) {
    await runRound(env)
    const spacing = Number(env.PROBE_SPACING_MS) || DEFAULT_SPACING_MS
    await new Promise((resolve) => setTimeout(resolve, spacing))
    await runRound(env)
    // Housekeeping once an hour, off the round path.
    if (new Date(ctrl.scheduledTime).getUTCMinutes() === 0) ctx.waitUntil(prune(env))
  },
} satisfies ExportedHandler<ProbeEnv>
