/**
 * Stats-history rollups (directory phase 0) — the write side of durable
 * provider/method history. Runs on the probe worker's hourly housekeeping
 * tick, entirely off the resolution request path.
 *
 *   - `provider_stats_hourly`: provider × UTC hour — probe health, routed
 *     live traffic, verification agreement, and status-transition counts.
 *   - `method_stats_daily`: method × UTC day — popularity/availability
 *     history for the directory.
 *   - `provider_status_events`: appended by the probe round whenever the
 *     folded KV snapshot CHANGES a status — the snapshot is overwritten
 *     every round, so this journal is what preserves uptime intervals.
 *     First observations (from_status NULL) are journaled for uptime
 *     reconstruction but NEVER counted as flaps in the rollups.
 *
 * Everything is idempotent (INSERT OR REPLACE over full recomputation of a
 * window) and cursor-driven: `rollup_state` tracks the last fully processed
 * hour/day, so a missed tick self-heals and a fresh deployment backfills
 * automatically from the earliest raw rows, bounded per tick.
 */

export const HOUR_MS = 3600_000;
export const DAY_MS = 24 * HOUR_MS;
/** Bounded backfill per tick: ~one day of hours, ~one week of days. */
const MAX_HOURS_PER_TICK = 26;
const MAX_DAYS_PER_TICK = 8;

export const hourStart = (ts: number): number => ts - (ts % HOUR_MS);
export const dayStart = (ts: number): number => ts - (ts % DAY_MS);

/** Health keys map to the provider tags used in the D1 event logs. */
export function healthKeyProvider(healthKey: string): string {
  if (healthKey.startsWith("local:")) return "ThisDID";
  if (healthKey === "goplausible") return "GoPlausible";
  return healthKey; // godiddy | archon
}

export interface StatusMap {
  [healthKey: string]: string | undefined;
}

/** Status-change rows to journal for one probe round (pure, unit-tested). */
export function statusTransitions(
  prev: StatusMap,
  next: StatusMap,
  now: number,
): { ts: number; healthKey: string; from: string | null; to: string }[] {
  const rows: {
    ts: number;
    healthKey: string;
    from: string | null;
    to: string;
  }[] = [];
  for (const [healthKey, to] of Object.entries(next)) {
    if (!to) continue;
    const from = prev[healthKey] ?? null;
    if (from !== to) rows.push({ ts: now, healthKey, from, to });
  }
  return rows;
}

interface ProbeAggRow {
  provider: string;
  total: number;
  ok: number;
  rate_limited: number;
  timeouts: number;
  avg_ms: number | null;
}

interface LatencyRow {
  provider: string;
  duration_ms: number;
  rn: number;
  cnt: number;
}

interface ResolutionAggRow {
  provider: string | null;
  total: number;
  ok: number;
  avg_ms: number | null;
}

interface VerifierAggRow {
  verified_by: string | null;
  matches: number;
  mismatches: number;
}

interface TransitionAggRow {
  health_key: string;
  transitions: number;
}

export interface ProviderHourRow {
  provider: string;
  probesTotal: number;
  probesOk: number;
  probesRateLimited: number;
  probesTimeout: number;
  probeLatencyAvgMs: number | null;
  probeLatencyP95Ms: number | null;
  resolutionsTotal: number;
  resolutionsOk: number;
  resolutionLatencyAvgMs: number | null;
  verificationMatch: number;
  verificationMismatch: number;
  statusTransitions: number;
}

/** p95 per provider from ROW_NUMBER-windowed successful-probe latencies. */
export function p95FromWindow(rows: LatencyRow[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const row of rows) {
    if (row.rn === Math.max(1, Math.ceil(0.95 * row.cnt))) {
      out.set(row.provider, row.duration_ms);
    }
  }
  return out;
}

/** Merge the per-hour aggregates into one row per provider (pure, tested). */
export function mergeHourly(
  probeAgg: ProbeAggRow[],
  p95: Map<string, number>,
  resolutionAgg: ResolutionAggRow[],
  verifierAgg: VerifierAggRow[],
  transitionAgg: TransitionAggRow[],
): ProviderHourRow[] {
  const rows = new Map<string, ProviderHourRow>();
  const get = (provider: string): ProviderHourRow => {
    let row = rows.get(provider);
    if (!row) {
      row = {
        provider,
        probesTotal: 0,
        probesOk: 0,
        probesRateLimited: 0,
        probesTimeout: 0,
        probeLatencyAvgMs: null,
        probeLatencyP95Ms: null,
        resolutionsTotal: 0,
        resolutionsOk: 0,
        resolutionLatencyAvgMs: null,
        verificationMatch: 0,
        verificationMismatch: 0,
        statusTransitions: 0,
      };
      rows.set(provider, row);
    }
    return row;
  };
  for (const agg of probeAgg) {
    const row = get(agg.provider);
    row.probesTotal = agg.total;
    row.probesOk = agg.ok;
    row.probesRateLimited = agg.rate_limited;
    row.probesTimeout = agg.timeouts;
    row.probeLatencyAvgMs = agg.avg_ms == null ? null : Math.round(agg.avg_ms);
    row.probeLatencyP95Ms = p95.get(agg.provider) ?? null;
  }
  for (const agg of resolutionAgg) {
    if (!agg.provider) continue;
    const row = get(agg.provider);
    row.resolutionsTotal = agg.total;
    row.resolutionsOk = agg.ok;
    row.resolutionLatencyAvgMs =
      agg.avg_ms == null ? null : Math.round(agg.avg_ms);
  }
  for (const agg of verifierAgg) {
    if (!agg.verified_by) continue;
    const row = get(agg.verified_by);
    row.verificationMatch = agg.matches;
    row.verificationMismatch = agg.mismatches;
  }
  for (const agg of transitionAgg) {
    const row = get(healthKeyProvider(agg.health_key));
    row.statusTransitions += agg.transitions;
  }
  return [...rows.values()];
}

let rollupSchemaReady = false;

/** Self-create the rollup tables (mirrors migrations/0004_stats_rollups.sql). */
export async function ensureRollupSchema(db: D1Database): Promise<void> {
  if (rollupSchemaReady) return;
  const statements = [
    `CREATE TABLE IF NOT EXISTS provider_stats_hourly (
      hour_ts INTEGER NOT NULL,
      provider TEXT NOT NULL,
      probes_total INTEGER NOT NULL DEFAULT 0,
      probes_ok INTEGER NOT NULL DEFAULT 0,
      probes_rate_limited INTEGER NOT NULL DEFAULT 0,
      probes_timeout INTEGER NOT NULL DEFAULT 0,
      probe_latency_avg_ms INTEGER,
      probe_latency_p95_ms INTEGER,
      resolutions_total INTEGER NOT NULL DEFAULT 0,
      resolutions_ok INTEGER NOT NULL DEFAULT 0,
      resolution_latency_avg_ms INTEGER,
      verification_match INTEGER NOT NULL DEFAULT 0,
      verification_mismatch INTEGER NOT NULL DEFAULT 0,
      status_transitions INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (hour_ts, provider)
    )`,
    "CREATE INDEX IF NOT EXISTS idx_psh_provider ON provider_stats_hourly (provider, hour_ts)",
    `CREATE TABLE IF NOT EXISTS method_stats_daily (
      day_ts INTEGER NOT NULL,
      method TEXT NOT NULL,
      resolutions_total INTEGER NOT NULL DEFAULT 0,
      resolutions_ok INTEGER NOT NULL DEFAULT 0,
      latency_avg_ms INTEGER,
      local_total INTEGER NOT NULL DEFAULT 0,
      verification_match INTEGER NOT NULL DEFAULT 0,
      verification_mismatch INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (day_ts, method)
    )`,
    "CREATE INDEX IF NOT EXISTS idx_msd_method ON method_stats_daily (method, day_ts)",
    `CREATE TABLE IF NOT EXISTS provider_status_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      health_key TEXT NOT NULL,
      from_status TEXT,
      to_status TEXT NOT NULL
    )`,
    "CREATE INDEX IF NOT EXISTS idx_pse_key_ts ON provider_status_events (health_key, ts)",
    `CREATE TABLE IF NOT EXISTS rollup_state (
      key TEXT PRIMARY KEY,
      value INTEGER NOT NULL
    )`,
  ];
  for (const sql of statements) await db.prepare(sql).run();
  rollupSchemaReady = true;
}

async function cursor(db: D1Database, key: string): Promise<number | null> {
  const row = await db
    .prepare("SELECT value FROM rollup_state WHERE key = ?")
    .bind(key)
    .first<{ value: number }>();
  return row?.value ?? null;
}

async function setCursor(
  db: D1Database,
  key: string,
  value: number,
): Promise<void> {
  await db
    .prepare("INSERT OR REPLACE INTO rollup_state (key, value) VALUES (?, ?)")
    .bind(key, value)
    .run();
}

/** Earliest raw event across both logs — the natural backfill start. */
async function earliestRawTs(db: D1Database): Promise<number | null> {
  const row = await db
    .prepare(
      `SELECT MIN(ts) AS ts FROM (
        SELECT MIN(ts) AS ts FROM probes
        UNION ALL
        SELECT MIN(ts) AS ts FROM resolutions
      ) WHERE ts IS NOT NULL`,
    )
    .first<{ ts: number | null }>();
  return row?.ts ?? null;
}

async function rollupOneHour(db: D1Database, hourTs: number): Promise<void> {
  const end = hourTs + HOUR_MS;
  const [probeAgg, latencies, resolutionAgg, verifierAgg, transitionAgg] =
    await Promise.all([
      db
        .prepare(
          `SELECT provider, COUNT(*) AS total, SUM(success) AS ok,
             SUM(CASE WHEN error = 'rateLimited' THEN 1 ELSE 0 END) AS rate_limited,
             SUM(CASE WHEN error = 'timeout' THEN 1 ELSE 0 END) AS timeouts,
             AVG(CASE WHEN success = 1 THEN duration_ms END) AS avg_ms
           FROM probes WHERE ts >= ? AND ts < ? GROUP BY provider`,
        )
        .bind(hourTs, end)
        .all<ProbeAggRow>(),
      db
        .prepare(
          `SELECT provider, duration_ms,
             ROW_NUMBER() OVER (PARTITION BY provider ORDER BY duration_ms) AS rn,
             COUNT(*) OVER (PARTITION BY provider) AS cnt
           FROM probes WHERE ts >= ? AND ts < ? AND success = 1`,
        )
        .bind(hourTs, end)
        .all<LatencyRow>(),
      db
        .prepare(
          `SELECT provider, COUNT(*) AS total, SUM(success) AS ok,
             AVG(duration_ms) AS avg_ms
           FROM resolutions WHERE ts >= ? AND ts < ? GROUP BY provider`,
        )
        .bind(hourTs, end)
        .all<ResolutionAggRow>(),
      db
        .prepare(
          `SELECT verified_by,
             SUM(CASE WHEN verification = 'match' THEN 1 ELSE 0 END) AS matches,
             SUM(CASE WHEN verification = 'mismatch' THEN 1 ELSE 0 END) AS mismatches
           FROM resolutions WHERE ts >= ? AND ts < ? AND verified_by IS NOT NULL
           GROUP BY verified_by`,
        )
        .bind(hourTs, end)
        .all<VerifierAggRow>(),
      db
        .prepare(
          `SELECT health_key, COUNT(*) AS transitions
           FROM provider_status_events
           WHERE ts >= ? AND ts < ? AND from_status IS NOT NULL
           GROUP BY health_key`,
        )
        .bind(hourTs, end)
        .all<TransitionAggRow>(),
    ]);

  const rows = mergeHourly(
    probeAgg.results ?? [],
    p95FromWindow(latencies.results ?? []),
    resolutionAgg.results ?? [],
    verifierAgg.results ?? [],
    transitionAgg.results ?? [],
  );
  if (!rows.length) return;
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO provider_stats_hourly
       (hour_ts, provider, probes_total, probes_ok, probes_rate_limited,
        probes_timeout, probe_latency_avg_ms, probe_latency_p95_ms,
        resolutions_total, resolutions_ok, resolution_latency_avg_ms,
        verification_match, verification_mismatch, status_transitions)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  await db.batch(
    rows.map((r) =>
      stmt.bind(
        hourTs,
        r.provider,
        r.probesTotal,
        r.probesOk,
        r.probesRateLimited,
        r.probesTimeout,
        r.probeLatencyAvgMs,
        r.probeLatencyP95Ms,
        r.resolutionsTotal,
        r.resolutionsOk,
        r.resolutionLatencyAvgMs,
        r.verificationMatch,
        r.verificationMismatch,
        r.statusTransitions,
      ),
    ),
  );
}

interface MethodDayRow {
  method: string | null;
  total: number;
  ok: number;
  avg_ms: number | null;
  local_total: number;
  matches: number;
  mismatches: number;
}

async function rollupOneDay(db: D1Database, dayTs: number): Promise<void> {
  const end = dayTs + DAY_MS;
  const agg = await db
    .prepare(
      `SELECT method, COUNT(*) AS total, SUM(success) AS ok,
         AVG(duration_ms) AS avg_ms,
         SUM(CASE WHEN route = 'local' THEN 1 ELSE 0 END) AS local_total,
         SUM(CASE WHEN verification = 'match' THEN 1 ELSE 0 END) AS matches,
         SUM(CASE WHEN verification = 'mismatch' THEN 1 ELSE 0 END) AS mismatches
       FROM resolutions WHERE ts >= ? AND ts < ? GROUP BY method`,
    )
    .bind(dayTs, end)
    .all<MethodDayRow>();
  const rows = (agg.results ?? []).filter((r) => r.method);
  if (!rows.length) return;
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO method_stats_daily
       (day_ts, method, resolutions_total, resolutions_ok, latency_avg_ms,
        local_total, verification_match, verification_mismatch)
     VALUES (?,?,?,?,?,?,?,?)`,
  );
  await db.batch(
    rows.map((r) =>
      stmt.bind(
        dayTs,
        r.method,
        r.total,
        r.ok,
        r.avg_ms == null ? null : Math.round(r.avg_ms),
        r.local_total,
        r.matches,
        r.mismatches,
      ),
    ),
  );
}

/**
 * Advance both rollups to the last completed hour/day, bounded per tick.
 * The last processed window is recomputed once more on the next tick so
 * stragglers written via waitUntil after the boundary are still captured.
 */
export async function runRollups(db: D1Database, now: number): Promise<void> {
  await ensureRollupSchema(db);

  const currentHour = hourStart(now);
  let hourCursor = await cursor(db, "hourly_cursor");
  if (hourCursor === null) {
    const earliest = await earliestRawTs(db);
    if (earliest !== null) hourCursor = hourStart(earliest) - HOUR_MS;
  }
  if (hourCursor !== null) {
    let processed = 0;
    for (
      let hour = hourCursor;
      hour < currentHour && processed < MAX_HOURS_PER_TICK;
      hour += HOUR_MS, processed++
    ) {
      await rollupOneHour(db, hour);
      await setCursor(db, "hourly_cursor", hour);
    }
  }

  const currentDay = dayStart(now);
  let dayCursor = await cursor(db, "daily_cursor");
  if (dayCursor === null) {
    const earliest = await earliestRawTs(db);
    if (earliest !== null) dayCursor = dayStart(earliest) - DAY_MS;
  }
  if (dayCursor !== null) {
    let processed = 0;
    for (
      let day = dayCursor;
      day < currentDay && processed < MAX_DAYS_PER_TICK;
      day += DAY_MS, processed++
    ) {
      await rollupOneDay(db, day);
      await setCursor(db, "daily_cursor", day);
    }
  }
}

/** Journal status changes from one probe round (called after the KV fold). */
export async function recordStatusTransitions(
  db: D1Database,
  prev: StatusMap,
  next: StatusMap,
  now: number,
): Promise<void> {
  const rows = statusTransitions(prev, next, now);
  if (!rows.length) return;
  await ensureRollupSchema(db);
  const stmt = db.prepare(
    "INSERT INTO provider_status_events (ts, health_key, from_status, to_status) VALUES (?,?,?,?)",
  );
  await db.batch(rows.map((r) => stmt.bind(r.ts, r.healthKey, r.from, r.to)));
}
