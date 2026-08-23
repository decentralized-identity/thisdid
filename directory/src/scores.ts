/**
 * Live method scores, computed from the shared D1 (phase-0 rollups + the raw
 * logs for today's partial day) and cached read-through in the D1
 * `directory_store` table so directory traffic never hammers the event logs.
 *
 *   - popularity: 0–100, log-scaled against the busiest method over 30 days —
 *     a method with 1% of the leader's volume still lands mid-scale, which
 *     reads better than a linear cliff for long-tail methods.
 *   - availability: 0–100 success ratio over 7 days of real traffic.
 *   - canary24h: probe canary ok-ratio for edge methods (keyless truth even
 *     when a method has no user traffic).
 *
 * Honesty rule: no traffic → null score, rendered as "no data", never 0 or a
 * fabricated number.
 */
import { storeGet, storePut } from "./store";
import type { Env, MethodScores, ScoreTable } from "./types";
import { DAY_MS } from "../../probe/src/rollup";

const CACHE_KEY = "scores";
const CACHE_TTL_MS = 5 * 60_000;

interface WindowRow {
  method: string | null;
  total: number;
  ok: number;
}

interface CanaryRow {
  method: string | null;
  total: number;
  ok: number;
}

export function logScaledPopularity(count: number, max: number): number | null {
  if (count <= 0 || max <= 0) return null;
  const score = Math.round((Math.log1p(count) / Math.log1p(max)) * 100);
  return Math.max(1, Math.min(100, score));
}

export function ratioScore(ok: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((ok / total) * 100);
}

/** Assemble per-method scores from the window aggregates (pure, tested). */
interface VerificationRow {
  method: string | null;
  matches: number;
  mismatches: number;
}

export function buildScores(
  rows24h: WindowRow[],
  rows7d: WindowRow[],
  rows30d: WindowRow[],
  canaries: CanaryRow[],
  computedAt: number,
  verifications: VerificationRow[] = [],
): ScoreTable {
  const methods: Record<string, MethodScores> = {};
  const ensure = (method: string): MethodScores =>
    (methods[method] ??= {
      resolutions24h: 0,
      resolutions7d: 0,
      resolutions30d: 0,
      popularity: null,
      availability: null,
      canary24h: null,
      verificationMatch30d: 0,
      verificationMismatch30d: 0,
    });
  for (const row of rows24h) {
    if (row.method) ensure(row.method).resolutions24h = row.total;
  }
  for (const row of rows7d) {
    if (!row.method) continue;
    const entry = ensure(row.method);
    entry.resolutions7d = row.total;
    entry.availability = ratioScore(row.ok, row.total);
  }
  const max30d = Math.max(0, ...rows30d.map((r) => r.total));
  for (const row of rows30d) {
    if (!row.method) continue;
    const entry = ensure(row.method);
    entry.resolutions30d = row.total;
    entry.popularity = logScaledPopularity(row.total, max30d);
  }
  for (const row of canaries) {
    if (row.method)
      ensure(row.method).canary24h = ratioScore(row.ok, row.total);
  }
  for (const row of verifications) {
    if (!row.method) continue;
    const entry = ensure(row.method);
    entry.verificationMatch30d = row.matches;
    entry.verificationMismatch30d = row.mismatches;
  }
  return { computedAt, methods };
}

async function queryWindow(
  db: D1Database,
  sinceTs: number,
): Promise<WindowRow[]> {
  const res = await db
    .prepare(
      `SELECT method, COUNT(*) AS total, SUM(success) AS ok
       FROM resolutions WHERE ts >= ? GROUP BY method`,
    )
    .bind(sinceTs)
    .all<WindowRow>();
  return res.results ?? [];
}

/**
 * Longer windows read the phase-0 daily rollups (cheap) and add today's
 * partial day from the raw log, so numbers are current to the minute.
 */
async function queryRollupWindow(
  db: D1Database,
  sinceDayTs: number,
  todayRows: WindowRow[],
): Promise<WindowRow[]> {
  const res = await db
    .prepare(
      `SELECT method, SUM(resolutions_total) AS total, SUM(resolutions_ok) AS ok
       FROM method_stats_daily WHERE day_ts >= ? GROUP BY method`,
    )
    .bind(sinceDayTs)
    .all<WindowRow>();
  const merged = new Map<string, WindowRow>();
  for (const row of res.results ?? []) {
    if (row.method) merged.set(row.method, { ...row });
  }
  for (const row of todayRows) {
    if (!row.method) continue;
    const prev = merged.get(row.method);
    if (prev) {
      prev.total += row.total;
      prev.ok += row.ok;
    } else {
      merged.set(row.method, { ...row });
    }
  }
  return [...merged.values()];
}

/** Compute (or serve cached) scores for every method with any signal. */
export async function getScores(env: Env, now: number): Promise<ScoreTable> {
  try {
    const raw = await storeGet(env, CACHE_KEY);
    if (raw) {
      const cached = JSON.parse(raw) as ScoreTable;
      if (now - cached.computedAt < CACHE_TTL_MS) return cached;
    }
  } catch {
    // recompute
  }
  const empty: ScoreTable = { computedAt: now, methods: {} };
  if (!env.DB) return empty;
  try {
    const db = env.DB;
    const today = now - (now % DAY_MS);
    const [rows24h, todayRows, canaries] = await Promise.all([
      queryWindow(db, now - DAY_MS),
      queryWindow(db, today),
      db
        .prepare(
          `SELECT method, COUNT(*) AS total, SUM(success) AS ok
           FROM probes WHERE ts >= ? AND step = 'local' GROUP BY method`,
        )
        .bind(now - DAY_MS)
        .all<CanaryRow>()
        .then((r) => r.results ?? []),
    ]);
    const [rows7d, rows30d, verifications] = await Promise.all([
      queryRollupWindow(db, today - 7 * DAY_MS, todayRows),
      queryRollupWindow(db, today - 30 * DAY_MS, todayRows),
      db
        .prepare(
          `SELECT method, SUM(verification_match) AS matches,
             SUM(verification_mismatch) AS mismatches
           FROM method_stats_daily WHERE day_ts >= ? GROUP BY method`,
        )
        .bind(today - 30 * DAY_MS)
        .all<{ method: string | null; matches: number; mismatches: number }>()
        .then((r) => r.results ?? []),
    ]);
    const table = buildScores(
      rows24h,
      rows7d,
      rows30d,
      canaries,
      now,
      verifications,
    );
    try {
      await storePut(env, CACHE_KEY, JSON.stringify(table), now);
    } catch {
      // cache write is best-effort
    }
    return table;
  } catch (err) {
    console.error(
      JSON.stringify({ event: "directory.scores_error", error: String(err) }),
    );
    return empty;
  }
}
