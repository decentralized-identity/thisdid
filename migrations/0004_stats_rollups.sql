-- Durable stats history (directory phase 0). The raw event logs (`resolutions`,
-- `probes`) stay authoritative; these rollups make provider/method history
-- queryable forever while KV keeps only the live snapshot and caches. Written
-- by the thisdid-probe worker on its hourly housekeeping tick (idempotent
-- INSERT OR REPLACE — a missed tick self-heals, and the cursor-driven
-- backfill populates history from the earliest raw rows automatically).

-- One row per provider x UTC hour: probe health + routed live traffic +
-- verification agreement, the raw feed for availability/reliability scores.
CREATE TABLE IF NOT EXISTS provider_stats_hourly (
  hour_ts INTEGER NOT NULL,               -- epoch ms, start of UTC hour
  provider TEXT NOT NULL,                 -- analytics tag: ThisDID | GoPlausible | godiddy | archon
  probes_total INTEGER NOT NULL DEFAULT 0,
  probes_ok INTEGER NOT NULL DEFAULT 0,
  probes_rate_limited INTEGER NOT NULL DEFAULT 0,
  probes_timeout INTEGER NOT NULL DEFAULT 0,
  probe_latency_avg_ms INTEGER,           -- over successful probes
  probe_latency_p95_ms INTEGER,
  resolutions_total INTEGER NOT NULL DEFAULT 0,
  resolutions_ok INTEGER NOT NULL DEFAULT 0,
  resolution_latency_avg_ms INTEGER,
  verification_match INTEGER NOT NULL DEFAULT 0,    -- comparisons this provider VERIFIED
  verification_mismatch INTEGER NOT NULL DEFAULT 0,
  status_transitions INTEGER NOT NULL DEFAULT 0,    -- flap signal, from provider_status_events
  PRIMARY KEY (hour_ts, provider)
);
CREATE INDEX IF NOT EXISTS idx_psh_provider ON provider_stats_hourly (provider, hour_ts);

-- One row per method x UTC day: popularity/availability history and trends.
CREATE TABLE IF NOT EXISTS method_stats_daily (
  day_ts INTEGER NOT NULL,                -- epoch ms, start of UTC day
  method TEXT NOT NULL,
  resolutions_total INTEGER NOT NULL DEFAULT 0,
  resolutions_ok INTEGER NOT NULL DEFAULT 0,
  latency_avg_ms INTEGER,
  local_total INTEGER NOT NULL DEFAULT 0, -- served by ThisDID edge drivers (route='local')
  verification_match INTEGER NOT NULL DEFAULT 0,
  verification_mismatch INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day_ts, method)
);
CREATE INDEX IF NOT EXISTS idx_msd_method ON method_stats_daily (method, day_ts);

-- Status-change journal: one row per health-status transition per health key
-- (`local:<method>` per driver, or the upstream provider step). Appended by
-- the probe worker whenever the folded KV snapshot changes a status — the
-- snapshot itself is overwritten every probe round, so this journal is what
-- makes uptime intervals and flap analysis reconstructable forever. Tiny:
-- rows
-- exist only when something actually changed.
CREATE TABLE IF NOT EXISTS provider_status_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,                    -- epoch ms
  health_key TEXT NOT NULL,               -- local:web | godiddy | archon | goplausible | ...
  from_status TEXT,                       -- up | degraded | down | NULL (first observation)
  to_status TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pse_key_ts ON provider_status_events (health_key, ts);

-- Rollup bookkeeping: cursors marking the last fully processed hour/day.
CREATE TABLE IF NOT EXISTS rollup_state (
  key TEXT PRIMARY KEY,                   -- hourly_cursor | daily_cursor
  value INTEGER NOT NULL
);
