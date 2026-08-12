-- Resolver health probes: one row per canary DID resolution fired by the
-- thisdid-probe sub-worker (cron, one-minute cadence). Kept separate from
-- `resolutions` so probe traffic never pollutes user-facing analytics.
CREATE TABLE IF NOT EXISTS probes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,          -- epoch milliseconds
  provider TEXT NOT NULL,       -- ThisDID | GoPlausible | godiddy | archon
  step TEXT NOT NULL,           -- routing step id: local | goplausible | godiddy | archon
  did TEXT NOT NULL,            -- canary DID probed
  method TEXT,
  success INTEGER,              -- 1 | 0
  duration_ms INTEGER,
  error TEXT                    -- timeout | miss | error when unsuccessful
);

CREATE INDEX IF NOT EXISTS idx_probes_ts ON probes (ts);
CREATE INDEX IF NOT EXISTS idx_probes_provider_ts ON probes (provider, ts);
