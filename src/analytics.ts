/**
 * Resolution analytics.
 *
 *  - D1 (`env.DB`)      → authoritative event log: one row per resolution request.
 *                         All dashboard aggregates are SQL over this table.
 *  - KV (`env.STATS_KV`) → read-through cache of the unfiltered summaries
 *                         (`analytics:sum:<range>`, 60s TTL). The probe sub-worker
 *                         also shares this namespace for `routing:health:v2`.
 *
 * GDPR: we store no IP, no cookies and no user-agent — only coarse `cf.country`,
 * the requested DID (the resource, like a URL in a server log), and timing.
 *
 * Recording is fire-and-forget (via ctx.waitUntil) and never throws into the
 * resolution path — analytics must not break resolution.
 */
import type { Env } from "./types";

export interface ResolutionEvent {
  did: string;
  method: string;
  route: string | null;
  provider: string | null;
  resolver: string | null;
  via: string | null;
  network: string | null;
  durationMs: number;
  success: boolean;
  error: string | null;
  chain: string | null;
  country: string | null;
  colo: string | null;
  /** Probation double-check outcome (`match` | `mismatch` | `unchecked`) or null. */
  verification: string | null;
  /** Analytics tag of the verifying upstream, when double-checked. */
  verifiedBy: string | null;
  ts: number;
}

export type TimeRange = "hourly" | "day" | "week" | "month" | "ytd" | "all";
export type Bucket = "hour" | "day" | "week" | "month";

export interface StatsFilter {
  range: TimeRange;
  country?: string;
  method?: string;
}

export interface Count {
  key: string;
  count: number;
}
export interface ProviderLatency {
  key: string;
  count: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
}
export interface VerificationCount {
  key: string;
  match: number;
  mismatch: number;
  unverified: number;
}
export interface TimelinePoint {
  t: string;
  count: number;
  success: number;
  errors: number;
}
export interface RecentRow {
  id: number;
  ts: number;
  did: string;
  method: string;
  provider: string | null;
  resolver: string | null;
  route: string | null;
  country: string | null;
  durationMs: number;
  success: boolean;
  error: string | null;
  verification: string | null;
  verifiedBy: string | null;
}

export interface RecentPage {
  recent: RecentRow[];
  /** Cursor to fetch the next (older) page, or null when there are no more. */
  nextCursor: string | null;
}

export interface Stats {
  filter: StatsFilter;
  options: { countries: string[]; methods: string[] };
  totals: {
    total: number;
    liveTotal: number;
    success: number;
    errors: number;
    successRate: number;
    latencyTotalMs: number;
    latencyAvgMs: number;
  };
  byMethod: Count[];
  byProvider: Count[];
  byResolver: Count[];
  byCountry: Count[];
  latencyByProvider: ProviderLatency[];
  /** Probation double-check outcomes per method (drives driver graduation). */
  verification: VerificationCount[];
  timeline: { granularity: Bucket; points: TimelinePoint[] };
  /** Daily counts over the last ~53 weeks (GitHub-style activity heatmap). */
  calendar: { day: string; count: number }[];
  recent: RecentRow[];
  recentCursor: string | null;
  configured: boolean;
}

const RECENT_LIMIT = 30;

const SUMMARY_TTL = 60;

let schemaReady = false;

async function ensureSchema(db: D1Database): Promise<void> {
  if (schemaReady) return;
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS resolutions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        did TEXT NOT NULL,
        method TEXT,
        route TEXT,
        provider TEXT,
        resolver TEXT,
        via TEXT,
        network TEXT,
        duration_ms INTEGER,
        success INTEGER,
        error TEXT,
        chain TEXT,
        country TEXT,
        colo TEXT
      )`,
    )
    .run();

  // Reconcile columns for tables created by an earlier schema version (e.g. before
  // `provider` existed) — CREATE TABLE IF NOT EXISTS won't add missing columns.
  const info = await db
    .prepare("PRAGMA table_info(resolutions)")
    .all<{ name: string }>();
  const have = new Set(info.results.map((r) => r.name));
  const columns: [string, string][] = [
    ["method", "TEXT"],
    ["route", "TEXT"],
    ["provider", "TEXT"],
    ["resolver", "TEXT"],
    ["via", "TEXT"],
    ["network", "TEXT"],
    ["duration_ms", "INTEGER"],
    ["success", "INTEGER"],
    ["error", "TEXT"],
    ["chain", "TEXT"],
    ["country", "TEXT"],
    ["colo", "TEXT"],
    ["verification", "TEXT"],
    ["verified_by", "TEXT"],
  ];
  for (const [name, type] of columns) {
    if (!have.has(name)) {
      try {
        await db
          .prepare(`ALTER TABLE resolutions ADD COLUMN ${name} ${type}`)
          .run();
      } catch {
        // column added concurrently by another isolate — fine
      }
    }
  }

  await db
    .prepare(
      "CREATE INDEX IF NOT EXISTS idx_resolutions_ts ON resolutions (ts)",
    )
    .run();
  await db
    .prepare(
      "CREATE INDEX IF NOT EXISTS idx_resolutions_method ON resolutions (method)",
    )
    .run();
  await db
    .prepare(
      "CREATE INDEX IF NOT EXISTS idx_resolutions_provider ON resolutions (provider)",
    )
    .run();
  await db
    .prepare(
      "CREATE INDEX IF NOT EXISTS idx_resolutions_country ON resolutions (country)",
    )
    .run();
  schemaReady = true;
}

export async function recordResolution(
  env: Env,
  ev: ResolutionEvent,
): Promise<void> {
  try {
    if (env.DB) {
      await ensureSchema(env.DB);
      await env.DB.prepare(
        `INSERT INTO resolutions
          (ts, did, method, route, provider, resolver, via, network, duration_ms, success, error, chain, country, colo, verification, verified_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
        .bind(
          ev.ts,
          ev.did,
          ev.method,
          ev.route,
          ev.provider,
          ev.resolver,
          ev.via,
          ev.network,
          ev.durationMs,
          ev.success ? 1 : 0,
          ev.error,
          ev.chain,
          ev.country,
          ev.colo,
          ev.verification,
          ev.verifiedBy,
        )
        .run();
    }
  } catch {
    // analytics must never affect resolution
  }
}

const DAY = 86_400_000;

/** Each scope = a bucket granularity + the window it spans. */
const RANGES: Record<
  TimeRange,
  { window: number | null | "ytd"; bucket: Bucket }
> = {
  hourly: { window: 2 * DAY, bucket: "hour" },
  day: { window: 30 * DAY, bucket: "day" },
  week: { window: 182 * DAY, bucket: "week" },
  month: { window: 730 * DAY, bucket: "month" },
  ytd: { window: "ytd", bucket: "month" },
  all: { window: null, bucket: "month" },
};
const DEFAULT_RANGE: TimeRange = "day";

/** Start-of-window epoch ms for a scope (null = unbounded). */
function sinceFor(range: TimeRange): number | null {
  const w = RANGES[range].window;
  if (w === null) return null;
  if (w === "ytd") {
    const d = new Date(Date.now());
    return Date.UTC(d.getUTCFullYear(), 0, 1);
  }
  return Date.now() - w;
}

export function parseFilter(url: URL): StatsFilter {
  const range = url.searchParams.get("range") as TimeRange;
  return {
    range: range in RANGES ? range : DEFAULT_RANGE,
    country: url.searchParams.get("country") || undefined,
    method: url.searchParams.get("method") || undefined,
  };
}

function whereClause(f: StatsFilter): {
  sql: string;
  binds: (string | number)[];
} {
  const clauses: string[] = [];
  const binds: (string | number)[] = [];
  const since = sinceFor(f.range);
  if (since != null) {
    clauses.push("ts >= ?");
    binds.push(since);
  }
  if (f.country) {
    clauses.push("country = ?");
    binds.push(f.country);
  }
  if (f.method) {
    clauses.push("method = ?");
    binds.push(f.method);
  }
  return { sql: clauses.length ? "WHERE " + clauses.join(" AND ") : "", binds };
}

function emptyStats(filter: StatsFilter): Stats {
  return {
    filter,
    options: { countries: [], methods: [] },
    totals: {
      total: 0,
      liveTotal: 0,
      success: 0,
      errors: 0,
      successRate: 0,
      latencyTotalMs: 0,
      latencyAvgMs: 0,
    },
    byMethod: [],
    byProvider: [],
    byResolver: [],
    byCountry: [],
    latencyByProvider: [],
    verification: [],
    timeline: { granularity: "day", points: [] },
    calendar: [],
    recent: [],
    recentCursor: null,
    configured: false,
  };
}

const RECENT_COLS =
  "id, ts, did, method, provider, resolver, route, country, duration_ms durationMs, success, error, verification, verified_by verifiedBy";

function parseCursor(c?: string): { ts: number; id: number } | null {
  if (!c) return null;
  const [ts, id] = c.split("_").map(Number);
  if (!Number.isFinite(ts) || !Number.isFinite(id)) return null;
  return { ts, id };
}

/**
 * One page of the live feed, newest first. Cursor-based (composite ts+id, stable
 * as new rows arrive): pass `before` = a prior page's `nextCursor` to page older.
 */
export async function recentPage(
  env: Env,
  filter: StatsFilter,
  before?: string,
  limit = RECENT_LIMIT,
): Promise<RecentPage> {
  const db = env.DB;
  if (!db) return { recent: [], nextCursor: null };
  await ensureSchema(db);
  const n = Math.min(100, Math.max(1, limit || RECENT_LIMIT));
  const w = whereClause(filter);
  const cur = parseCursor(before);

  let sql = `SELECT ${RECENT_COLS} FROM resolutions ${w.sql}`;
  const binds: (string | number)[] = [...w.binds];
  if (cur) {
    sql += `${w.sql ? " AND" : " WHERE"} (ts < ? OR (ts = ? AND id < ?))`;
    binds.push(cur.ts, cur.ts, cur.id);
  }
  sql += " ORDER BY ts DESC, id DESC LIMIT ?";
  binds.push(n);

  const { results } = await db
    .prepare(sql)
    .bind(...binds)
    .all<Omit<RecentRow, "success"> & { success: number }>();
  const recent: RecentRow[] = results.map((r) => ({
    ...r,
    success: !!r.success,
  }));
  const last = recent[recent.length - 1];
  const nextCursor =
    recent.length === n && last ? `${last.ts}_${last.id}` : null;
  return { recent, nextCursor };
}

async function computeStats(env: Env, filter: StatsFilter): Promise<Stats> {
  const db = env.DB;
  if (!db) return emptyStats(filter);
  await ensureSchema(db);
  const w = whereClause(filter);
  const and = w.sql ? "AND" : "WHERE";
  const granularity: Bucket = RANGES[filter.range].bucket;
  const bucketExpr =
    granularity === "hour"
      ? "strftime('%Y-%m-%dT%H:00', ts/1000, 'unixepoch')"
      : granularity === "week"
        ? "strftime('%Y-W%W', ts/1000, 'unixepoch')"
        : granularity === "month"
          ? "strftime('%Y-%m', ts/1000, 'unixepoch')"
          : "date(ts/1000,'unixepoch')";

  const calBinds: (string | number)[] = [Date.now() - 371 * DAY];
  const calClauses = ["ts >= ?"];
  if (filter.country) {
    calClauses.push("country = ?");
    calBinds.push(filter.country);
  }
  if (filter.method) {
    calClauses.push("method = ?");
    calBinds.push(filter.method);
  }
  // Failed resolutions have no provider/resolver (nobody answered), so those
  // groupings label them explicitly as NOT_FOUND instead of a cryptic "—".
  const group = (col: string, nullLabel = "—") =>
    db
      .prepare(
        `SELECT COALESCE(${col},'${nullLabel}') k, COUNT(*) c FROM resolutions ${w.sql} GROUP BY k ORDER BY c DESC LIMIT 50`,
      )
      .bind(...w.binds);

  // One D1 round-trip for every read the dashboard needs.
  const [
    totalsR,
    latR,
    verR,
    tlR,
    recentR,
    calR,
    cOptR,
    mOptR,
    mR,
    pR,
    rR,
    cR,
  ] = await db.batch<Record<string, number | string | null>>([
    db
      .prepare(
        `SELECT COUNT(*) total,
                  SUM(success) ok,
                  SUM(CASE WHEN success = 1 THEN duration_ms ELSE 0 END) lat,
                  AVG(CASE WHEN success = 1 THEN duration_ms END) avg_ms
             FROM resolutions ${w.sql}`,
      )
      .bind(...w.binds),
    db
      .prepare(
        `SELECT COALESCE(provider,'—') k, COUNT(*) c, AVG(duration_ms) avg, MIN(duration_ms) lo, MAX(duration_ms) hi FROM resolutions ${w.sql} ${and} success = 1 AND provider IS NOT NULL GROUP BY k ORDER BY c DESC`,
      )
      .bind(...w.binds),
    db
      .prepare(
        `SELECT COALESCE(method,'?') k, COALESCE(verification,'?') v, COUNT(*) c FROM resolutions ${w.sql} ${and} verification IS NOT NULL GROUP BY k, v`,
      )
      .bind(...w.binds),
    db
      .prepare(
        `SELECT ${bucketExpr} t, COUNT(*) c, SUM(success) ok FROM resolutions ${w.sql} GROUP BY t ORDER BY t`,
      )
      .bind(...w.binds),
    db
      .prepare(
        `SELECT ${RECENT_COLS} FROM resolutions ${w.sql} ORDER BY ts DESC, id DESC LIMIT ?`,
      )
      .bind(...w.binds, RECENT_LIMIT),
    db
      .prepare(
        `SELECT date(ts/1000,'unixepoch') d, COUNT(*) c FROM resolutions WHERE ${calClauses.join(" AND ")} GROUP BY d`,
      )
      .bind(...calBinds),
    db.prepare(
      "SELECT DISTINCT country k FROM resolutions WHERE country IS NOT NULL ORDER BY k",
    ),
    db.prepare(
      "SELECT DISTINCT method k FROM resolutions WHERE method IS NOT NULL AND method != '' ORDER BY k",
    ),
    group("method"),
    group("provider", "NOT_FOUND"),
    group("resolver", "NOT_FOUND"),
    group("country"),
  ]);

  const t = (totalsR.results[0] ?? {}) as {
    total: number;
    ok: number | null;
    lat: number | null;
    avg_ms: number | null;
  };
  const total = t.total ?? 0;
  const success = t.ok ?? 0;
  const toCounts = (r: typeof mR) =>
    (r.results as { k: string; c: number }[]).map((x) => ({
      key: x.k,
      count: x.c,
    }));
  const recentRows = recentR.results as (Omit<RecentRow, "success"> & {
    success: number;
  })[];
  const recent: RecentRow[] = recentRows.map((r) => ({
    ...r,
    success: !!r.success,
  }));
  const last = recent[recent.length - 1];

  return {
    filter,
    options: {
      countries: (cOptR.results as { k: string }[]).map((r) => r.k),
      methods: (mOptR.results as { k: string }[]).map((r) => r.k),
    },
    totals: {
      total,
      liveTotal: total,
      success,
      errors: total - success,
      successRate: total ? Math.round((success / total) * 1000) / 10 : 0,
      latencyTotalMs: Math.round(t.lat ?? 0),
      latencyAvgMs: Math.round(t.avg_ms ?? 0),
    },
    byMethod: toCounts(mR),
    byProvider: toCounts(pR),
    byResolver: toCounts(rR),
    byCountry: toCounts(cR),
    verification: (() => {
      const byMethod = new Map<string, VerificationCount>();
      for (const row of verR.results as { k: string; v: string; c: number }[]) {
        const entry = byMethod.get(row.k) ?? {
          key: row.k,
          match: 0,
          mismatch: 0,
          unverified: 0,
        };
        if (row.v === "match") entry.match += row.c;
        else if (row.v === "mismatch") entry.mismatch += row.c;
        else entry.unverified += row.c;
        byMethod.set(row.k, entry);
      }
      return [...byMethod.values()].sort((a, b) => a.key.localeCompare(b.key));
    })(),
    latencyByProvider: (
      latR.results as {
        k: string;
        c: number;
        avg: number;
        lo: number;
        hi: number;
      }[]
    ).map((r) => ({
      key: r.k,
      count: r.c,
      avgMs: Math.round(r.avg),
      minMs: r.lo,
      maxMs: r.hi,
    })),
    timeline: {
      granularity,
      points: (tlR.results as { t: string; c: number; ok: number }[]).map(
        (r) => ({ t: r.t, count: r.c, success: r.ok, errors: r.c - r.ok }),
      ),
    },
    calendar: (calR.results as { d: string; c: number }[]).map((r) => ({
      day: r.d,
      count: r.c,
    })),
    recent,
    recentCursor:
      recent.length === RECENT_LIMIT && last ? `${last.ts}_${last.id}` : null,
    configured: true,
  };
}

export async function getStats(env: Env, filter: StatsFilter): Promise<Stats> {
  // Cache the unfiltered summaries (the dashboard default + the landing page).
  const cacheable = !filter.country && !filter.method;
  const key = `analytics:sum:${filter.range}`;

  if (cacheable && env.STATS_KV) {
    const cached = await env.STATS_KV.get(key);
    if (cached) return JSON.parse(cached) as Stats;
  }
  const stats = await computeStats(env, filter);
  if (cacheable && env.STATS_KV) {
    // Non-blocking cache write — never delays the response.
    env.STATS_KV.put(key, JSON.stringify(stats), {
      expirationTtl: SUMMARY_TTL,
    }).catch(() => {});
  }
  return stats;
}

// ── Probation mismatch evidence log ────────────────────────────────────────

/** Bound stored documents so a pathological mismatch cannot bloat a D1 row. */
const MAX_EVIDENCE_CHARS = 32 * 1024;

let mismatchSchemaReady = false;

async function ensureMismatchSchema(db: D1Database): Promise<void> {
  if (mismatchSchemaReady) return;
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS verification_mismatches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        did TEXT NOT NULL,
        method TEXT,
        provider TEXT,
        reason TEXT,
        local_document TEXT,
        upstream_document TEXT
      )`,
    )
    .run();
  await db
    .prepare(
      "CREATE INDEX IF NOT EXISTS idx_vmismatch_ts ON verification_mismatches (ts)",
    )
    .run();
  mismatchSchemaReady = true;
}

/** Prefix kept inside a truncation envelope — small enough that JSON string
 * escaping can never push the envelope itself past MAX_EVIDENCE_CHARS. */
const EVIDENCE_PREFIX_CHARS = 8 * 1024;

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Serialize one document for a D1 evidence column. An oversized document is
 * stored as a structured truncation envelope — still valid JSON — carrying
 * the full serialization's hash and length plus a raw prefix for eyeballing,
 * never as a mid-string slice that later adjudication could not parse.
 */
async function evidence(value: unknown): Promise<string | null> {
  if (value == null) return null;
  try {
    const json = JSON.stringify(value);
    if (json.length <= MAX_EVIDENCE_CHARS) return json;
    return JSON.stringify({
      truncated: true,
      originalChars: json.length,
      sha256: await sha256Hex(json),
      prefix: json.slice(0, EVIDENCE_PREFIX_CHARS),
    });
  } catch {
    return null;
  }
}

/**
 * Record one probation disagreement with both documents as adjudication
 * evidence. Fire-and-forget (ctx.waitUntil) and never throws into resolution.
 */
export async function recordMismatch(
  env: Env,
  record: {
    did: string;
    method: string;
    provider: string;
    reason: string;
    localDocument: unknown;
    upstreamDocument: unknown;
  },
): Promise<void> {
  try {
    if (!env.DB) return;
    await ensureMismatchSchema(env.DB);
    const [localEvidence, upstreamEvidence] = await Promise.all([
      evidence(record.localDocument),
      evidence(record.upstreamDocument),
    ]);
    await env.DB.prepare(
      `INSERT INTO verification_mismatches
        (ts, did, method, provider, reason, local_document, upstream_document)
       VALUES (?,?,?,?,?,?,?)`,
    )
      .bind(
        Date.now(),
        record.did,
        record.method,
        record.provider,
        record.reason,
        localEvidence,
        upstreamEvidence,
      )
      .run();
  } catch {
    // evidence logging must never affect resolution
  }
}
