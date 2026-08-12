/**
 * Resolver health snapshot — written by the `thisdid-probe` sub-worker (see
 * probe/), read by this Worker (`/status` today; the rules-based router next).
 * The two Workers are connected through the shared STATS_KV namespace: the
 * probe worker folds each probe round into this snapshot, the resolver only
 * ever reads it. Reading is fail-open: any error or staleness yields `null`,
 * which callers must treat as "no health data" — never as "everything down".
 */
export const HEALTH_KEY = "routing:health:v2";

/** A snapshot older than this is treated as absent (probe worker down or not deployed). */
export const HEALTH_STALE_MS = 10 * 60 * 1000;

export type ProviderStatus = "up" | "degraded" | "down";

export interface ProviderHealth {
  status: ProviderStatus;
  /** EWMA of successful canary latency, ms (null until the first success). */
  ewmaMs: number | null;
  /** Rolling success rate 0..1 (EWMA over probe rounds). */
  successRate: number | null;
  /** Consecutive rounds in which every canary for this provider failed. */
  consecutiveFails: number;
  lastOkTs: number | null;
  lastProbeTs: number;
}

export interface HealthSnapshot {
  v: 2;
  updatedTs: number;
  /** Upstream step keys plus method-specific driver keys such as `local:key`. */
  providers: Record<string, ProviderHealth | undefined>;
}

/** Shared, non-request-scoped read-through cache (same pattern as the local Resolver singleton). */
let cache: { snap: HealthSnapshot | null; fetchedTs: number } | null = null;
const CACHE_MS = 15_000;

/**
 * Read the probe worker's health snapshot. Cached per isolate for 15s so the
 * steady-state per-request cost is zero KV reads. Never throws.
 */
export async function getHealth(env: {
  STATS_KV?: KVNamespace;
}): Promise<HealthSnapshot | null> {
  const now = Date.now();
  if (cache && now - cache.fetchedTs < CACHE_MS) return cache.snap;
  let snap: HealthSnapshot | null = null;
  try {
    const raw = env.STATS_KV ? await env.STATS_KV.get(HEALTH_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw) as HealthSnapshot;
      if (parsed?.v === 2 && now - parsed.updatedTs < HEALTH_STALE_MS)
        snap = parsed;
    }
  } catch {
    snap = null;
  }
  cache = { snap, fetchedTs: now };
  return snap;
}
