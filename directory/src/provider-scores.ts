/**
 * Provider availability + RELIABILITY scores — the quality-over-time
 * composite the plan defines, fed by the phase-0 D1 rollups
 * (`provider_stats_hourly`) MERGED with the current partial hour's raw
 * events, so the 24h window really ends "now" instead of at the last
 * completed hour. D1-only, cached in `directory_store`.
 *
 * Reliability components (each 0–100, weights in parentheses; weights
 * redistribute proportionally when a component has no data):
 *   - success consistency (40): ok-ratio across probes AND routed
 *     resolutions over 30d — answering probes but failing real traffic
 *     scores accordingly.
 *   - stability (25): inverse flap rate from status transitions/day
 *     (first observations are never counted as flaps).
 *   - latency discipline (15): avg vs WORST HOURLY p95 dispersion — a
 *     deliberately conservative banding (a true window percentile would
 *     need raw-histogram merging; the name says what the number is).
 *   - throttle behavior (10): share of rate-limited probes (Godiddy's 429s
 *     count here, not as downtime).
 *   - verification agreement (10): compareCores match-rate when this
 *     provider served as the probation verifier.
 */
import { storeGet, storePut } from "./store";
import { PROVIDERS } from "./data/providers";
import { healthKeyProvider, hourStart } from "../../probe/src/rollup";
import type {
  Env,
  ProviderScoreTable,
  ProviderScores,
  ProviderWindow,
  ReliabilityScore,
} from "./types";
import { DAY_MS } from "../../probe/src/rollup";

const CACHE_KEY = "provider-scores";
const CACHE_TTL_MS = 5 * 60_000;
const NOW_WINDOW_MS = 15 * 60_000;
const HOUR_MS = 3600_000;

/** Mergeable accumulator — finalized into a ProviderWindow after merging. */
interface WindowAcc {
  probesTotal: number;
  probesOk: number;
  probesRateLimited: number;
  probesTimeout: number;
  latWeighted: number;
  latWeight: number;
  worstP95: number | null;
  resolutionsTotal: number;
  resolutionsOk: number;
  resLatWeighted: number;
  verificationMatch: number;
  verificationMismatch: number;
  statusTransitions: number;
}

const emptyAcc = (): WindowAcc => ({
  probesTotal: 0,
  probesOk: 0,
  probesRateLimited: 0,
  probesTimeout: 0,
  latWeighted: 0,
  latWeight: 0,
  worstP95: null,
  resolutionsTotal: 0,
  resolutionsOk: 0,
  resLatWeighted: 0,
  verificationMatch: 0,
  verificationMismatch: 0,
  statusTransitions: 0,
});

function mergeAcc(a: WindowAcc, b: WindowAcc): WindowAcc {
  return {
    probesTotal: a.probesTotal + b.probesTotal,
    probesOk: a.probesOk + b.probesOk,
    probesRateLimited: a.probesRateLimited + b.probesRateLimited,
    probesTimeout: a.probesTimeout + b.probesTimeout,
    latWeighted: a.latWeighted + b.latWeighted,
    latWeight: a.latWeight + b.latWeight,
    worstP95:
      a.worstP95 == null
        ? b.worstP95
        : b.worstP95 == null
          ? a.worstP95
          : Math.max(a.worstP95, b.worstP95),
    resolutionsTotal: a.resolutionsTotal + b.resolutionsTotal,
    resolutionsOk: a.resolutionsOk + b.resolutionsOk,
    resLatWeighted: a.resLatWeighted + b.resLatWeighted,
    verificationMatch: a.verificationMatch + b.verificationMatch,
    verificationMismatch: a.verificationMismatch + b.verificationMismatch,
    statusTransitions: a.statusTransitions + b.statusTransitions,
  };
}

function finalize(acc: WindowAcc): ProviderWindow {
  return {
    probesTotal: acc.probesTotal,
    probesOk: acc.probesOk,
    probesRateLimited: acc.probesRateLimited,
    probesTimeout: acc.probesTimeout,
    probeLatencyAvgMs:
      acc.latWeight > 0 ? Math.round(acc.latWeighted / acc.latWeight) : null,
    probeLatencyWorstP95Ms: acc.worstP95,
    resolutionsTotal: acc.resolutionsTotal,
    resolutionsOk: acc.resolutionsOk,
    resolutionLatencyAvgMs:
      acc.resolutionsTotal > 0
        ? Math.round(acc.resLatWeighted / acc.resolutionsTotal)
        : null,
    verificationMatch: acc.verificationMatch,
    verificationMismatch: acc.verificationMismatch,
    statusTransitions: acc.statusTransitions,
  };
}

const clamp = (v: number): number => Math.max(0, Math.min(100, Math.round(v)));

/** ok-ratio across probes AND routed resolutions combined. */
export function successConsistency(w: ProviderWindow): number | null {
  const total = w.probesTotal + w.resolutionsTotal;
  if (total <= 0) return null;
  return clamp(((w.probesOk + w.resolutionsOk) / total) * 100);
}

/** 100 at ≤0.2 transitions/day, linearly down to 0 at ≥6/day. */
export function stabilityScore(
  transitions: number,
  days: number,
): number | null {
  if (days <= 0) return null;
  const perDay = transitions / days;
  if (perDay <= 0.2) return 100;
  return clamp(100 - ((perDay - 0.2) / 5.8) * 100);
}

/** Worst-hourly-p95 / avg dispersion: ≤2× → 100, ≥6× → 0, linear between. */
export function latencyDiscipline(
  avg: number | null,
  worstP95: number | null,
): number | null {
  if (avg == null || worstP95 == null || avg <= 0) return null;
  const ratio = worstP95 / avg;
  if (ratio <= 2) return 100;
  return clamp(100 - ((ratio - 2) / 4) * 100);
}

/** Share of rate-limited probes: 0% → 100, ≥20% → 0. */
export function throttleBehavior(w: ProviderWindow): number | null {
  if (w.probesTotal <= 0) return null;
  const share = w.probesRateLimited / w.probesTotal;
  return clamp(100 - (share / 0.2) * 100);
}

export function verificationAgreement(w: ProviderWindow): number | null {
  const total = w.verificationMatch + w.verificationMismatch;
  if (total <= 0) return null;
  return clamp((w.verificationMatch / total) * 100);
}

/** The weighted composite, redistributing weights over present components. */
export function reliability(w: ProviderWindow, days: number): ReliabilityScore {
  const components = {
    successConsistency: successConsistency(w),
    stability: stabilityScore(w.statusTransitions, days),
    latencyDiscipline: latencyDiscipline(
      w.probeLatencyAvgMs,
      w.probeLatencyWorstP95Ms,
    ),
    throttleBehavior: throttleBehavior(w),
    verificationAgreement: verificationAgreement(w),
  };
  const weights: [keyof typeof components, number][] = [
    ["successConsistency", 40],
    ["stability", 25],
    ["latencyDiscipline", 15],
    ["throttleBehavior", 10],
    ["verificationAgreement", 10],
  ];
  let sum = 0;
  let weightSum = 0;
  for (const [key, weight] of weights) {
    const value = components[key];
    if (value == null) continue;
    sum += value * weight;
    weightSum += weight;
  }
  return {
    score: weightSum > 0 ? Math.round(sum / weightSum) : null,
    components,
  };
}

export function availability(w: ProviderWindow): number | null {
  if (w.probesTotal <= 0) return null;
  return clamp((w.probesOk / w.probesTotal) * 100);
}

/**
 * up | degraded | down | unknown from the last ~15 min of raw probes
 * (3 rounds at the 5-min cadence). Ratio-based: ThisDID aggregates ~19
 * canaries per round, so one flaky public endpoint (≤10% of probes) must
 * not demote the whole fleet — that shows on the per-driver /status keys
 * instead.
 */
export function statusNowOf(total: number, ok: number): string {
  if (total <= 0) return "unknown";
  if (ok === 0) return "down";
  if (ok / total < 0.9) return "degraded";
  return "up";
}

interface HourlyRow {
  provider: string;
  probes_total: number;
  probes_ok: number;
  probes_rate_limited: number;
  probes_timeout: number;
  lat_weighted: number | null;
  lat_weight: number | null;
  p95_max: number | null;
  resolutions_total: number;
  resolutions_ok: number;
  res_lat_weighted: number | null;
  verification_match: number;
  verification_mismatch: number;
  status_transitions: number;
}

/** Completed-hour rollups from an hour-aligned boundary (inclusive). */
async function rolledWindow(
  db: D1Database,
  sinceHourTs: number,
): Promise<Map<string, WindowAcc>> {
  const res = await db
    .prepare(
      `SELECT provider,
         SUM(probes_total) AS probes_total,
         SUM(probes_ok) AS probes_ok,
         SUM(probes_rate_limited) AS probes_rate_limited,
         SUM(probes_timeout) AS probes_timeout,
         SUM(probe_latency_avg_ms * probes_ok) AS lat_weighted,
         SUM(CASE WHEN probe_latency_avg_ms IS NOT NULL THEN probes_ok ELSE 0 END) AS lat_weight,
         MAX(probe_latency_p95_ms) AS p95_max,
         SUM(resolutions_total) AS resolutions_total,
         SUM(resolutions_ok) AS resolutions_ok,
         SUM(resolution_latency_avg_ms * resolutions_total) AS res_lat_weighted,
         SUM(verification_match) AS verification_match,
         SUM(verification_mismatch) AS verification_mismatch,
         SUM(status_transitions) AS status_transitions
       FROM provider_stats_hourly WHERE hour_ts >= ? GROUP BY provider`,
    )
    .bind(sinceHourTs)
    .all<HourlyRow>();
  const out = new Map<string, WindowAcc>();
  for (const row of res.results ?? []) {
    out.set(row.provider, {
      probesTotal: row.probes_total ?? 0,
      probesOk: row.probes_ok ?? 0,
      probesRateLimited: row.probes_rate_limited ?? 0,
      probesTimeout: row.probes_timeout ?? 0,
      latWeighted: row.lat_weighted ?? 0,
      latWeight: row.lat_weight ?? 0,
      worstP95: row.p95_max ?? null,
      resolutionsTotal: row.resolutions_total ?? 0,
      resolutionsOk: row.resolutions_ok ?? 0,
      resLatWeighted: row.res_lat_weighted ?? 0,
      verificationMatch: row.verification_match ?? 0,
      verificationMismatch: row.verification_mismatch ?? 0,
      statusTransitions: row.status_transitions ?? 0,
    });
  }
  return out;
}

/**
 * The current PARTIAL hour, aggregated from the raw logs — the rollup for
 * this hour does not exist yet, and without it every window would end at
 * the last completed hour.
 */
async function partialHour(
  db: D1Database,
  now: number,
): Promise<Map<string, WindowAcc>> {
  const since = hourStart(now);
  const [probes, resolutions, verifications, transitions] = await Promise.all([
    db
      .prepare(
        `SELECT provider, COUNT(*) AS total, SUM(success) AS ok,
           SUM(CASE WHEN error = 'rateLimited' THEN 1 ELSE 0 END) AS rate_limited,
           SUM(CASE WHEN error = 'timeout' THEN 1 ELSE 0 END) AS timeouts,
           SUM(CASE WHEN success = 1 THEN duration_ms ELSE 0 END) AS lat_sum,
           SUM(success) AS lat_weight
         FROM probes WHERE ts >= ? GROUP BY provider`,
      )
      .bind(since)
      .all<{
        provider: string;
        total: number;
        ok: number;
        rate_limited: number;
        timeouts: number;
        lat_sum: number | null;
        lat_weight: number | null;
      }>()
      .then((r) => r.results ?? []),
    db
      .prepare(
        `SELECT provider, COUNT(*) AS total, SUM(success) AS ok,
           SUM(duration_ms) AS lat_sum
         FROM resolutions WHERE ts >= ? GROUP BY provider`,
      )
      .bind(since)
      .all<{
        provider: string | null;
        total: number;
        ok: number;
        lat_sum: number | null;
      }>()
      .then((r) => r.results ?? []),
    db
      .prepare(
        `SELECT verified_by,
           SUM(CASE WHEN verification = 'match' THEN 1 ELSE 0 END) AS matches,
           SUM(CASE WHEN verification = 'mismatch' THEN 1 ELSE 0 END) AS mismatches
         FROM resolutions WHERE ts >= ? AND verified_by IS NOT NULL
         GROUP BY verified_by`,
      )
      .bind(since)
      .all<{
        verified_by: string | null;
        matches: number;
        mismatches: number;
      }>()
      .then((r) => r.results ?? []),
    db
      .prepare(
        `SELECT health_key, COUNT(*) AS transitions
         FROM provider_status_events
         WHERE ts >= ? AND from_status IS NOT NULL
         GROUP BY health_key`,
      )
      .bind(since)
      .all<{ health_key: string; transitions: number }>()
      .then((r) => r.results ?? []),
  ]);

  const out = new Map<string, WindowAcc>();
  const get = (provider: string): WindowAcc => {
    let acc = out.get(provider);
    if (!acc) {
      acc = emptyAcc();
      out.set(provider, acc);
    }
    return acc;
  };
  for (const row of probes) {
    const acc = get(row.provider);
    acc.probesTotal = row.total;
    acc.probesOk = row.ok ?? 0;
    acc.probesRateLimited = row.rate_limited ?? 0;
    acc.probesTimeout = row.timeouts ?? 0;
    acc.latWeighted = row.lat_sum ?? 0;
    acc.latWeight = row.lat_weight ?? 0;
  }
  for (const row of resolutions) {
    if (!row.provider) continue;
    const acc = get(row.provider);
    acc.resolutionsTotal = row.total;
    acc.resolutionsOk = row.ok ?? 0;
    acc.resLatWeighted = row.lat_sum ?? 0;
  }
  for (const row of verifications) {
    if (!row.verified_by) continue;
    const acc = get(row.verified_by);
    acc.verificationMatch = row.matches ?? 0;
    acc.verificationMismatch = row.mismatches ?? 0;
  }
  for (const row of transitions) {
    get(healthKeyProvider(row.health_key)).statusTransitions +=
      row.transitions ?? 0;
  }
  return out;
}

function windowOf(
  rolled: Map<string, WindowAcc>,
  partial: Map<string, WindowAcc>,
  tag: string,
): ProviderWindow {
  const a = rolled.get(tag) ?? emptyAcc();
  const b = partial.get(tag) ?? emptyAcc();
  return finalize(mergeAcc(a, b));
}

/** Compute (or serve cached) scores for every configured provider. */
export async function getProviderScores(
  env: Env,
  now: number,
): Promise<ProviderScoreTable> {
  try {
    const raw = await storeGet(env, CACHE_KEY);
    if (raw) {
      const cached = JSON.parse(raw) as ProviderScoreTable;
      if (
        typeof cached?.computedAt === "number" &&
        cached.providers &&
        typeof cached.providers === "object" &&
        now - cached.computedAt < CACHE_TTL_MS
      ) {
        return cached;
      }
    }
  } catch {
    // recompute
  }
  const empty: ProviderScoreTable = { computedAt: now, providers: {} };
  if (!env.DB) return empty;
  try {
    const db = env.DB;
    // Hour-aligned boundaries: N-1 completed hours from the rollups plus the
    // current partial hour from raw events ≈ a window that truly ends now.
    const currentHour = hourStart(now);
    const [h24, d7, d30, partial, nowRows] = await Promise.all([
      rolledWindow(db, currentHour - DAY_MS + HOUR_MS),
      rolledWindow(db, currentHour - 7 * DAY_MS + HOUR_MS),
      rolledWindow(db, currentHour - 30 * DAY_MS + HOUR_MS),
      partialHour(db, now),
      db
        .prepare(
          `SELECT provider, COUNT(*) AS total, SUM(success) AS ok
           FROM probes WHERE ts >= ? GROUP BY provider`,
        )
        .bind(now - NOW_WINDOW_MS)
        .all<{ provider: string; total: number; ok: number }>()
        .then((r) => r.results ?? []),
    ]);
    const nowByTag = new Map(nowRows.map((r) => [r.provider, r]));
    const providers: Record<string, ProviderScores> = {};
    const w7ByTag = new Map(
      PROVIDERS.map((p) => [p.tag, windowOf(d7, partial, p.tag)]),
    );
    const share7dTotal = [...w7ByTag.values()].reduce(
      (a, w) => a + w.resolutionsTotal,
      0,
    );
    for (const provider of PROVIDERS) {
      const w24 = windowOf(h24, partial, provider.tag);
      const w7 = w7ByTag.get(provider.tag)!;
      const w30 = windowOf(d30, partial, provider.tag);
      const nowRow = nowByTag.get(provider.tag);
      providers[provider.id] = {
        statusNow: statusNowOf(nowRow?.total ?? 0, nowRow?.ok ?? 0),
        availability24h: availability(w24),
        availability7d: availability(w7),
        reliability: reliability(w30, 30),
        share7d:
          share7dTotal > 0
            ? Math.round((w7.resolutionsTotal / share7dTotal) * 100)
            : null,
        windows: { h24: w24, d7: w7, d30: w30 },
      };
    }
    const table: ProviderScoreTable = { computedAt: now, providers };
    try {
      await storePut(env, CACHE_KEY, JSON.stringify(table), now);
    } catch {
      // cache write is best-effort
    }
    return table;
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "directory.provider_scores_error",
        error: String(err),
      }),
    );
    return empty;
  }
}
