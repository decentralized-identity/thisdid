-- Probation mismatch evidence: one row per disagreement between a new local
-- driver and its redundant verification upstream, with both documents stored
-- for adjudication. The `resolutions` table's `verification` / `verified_by`
-- columns are added by the analytics schema self-heal (PRAGMA reconcile), so
-- this migration only creates the evidence table.
CREATE TABLE IF NOT EXISTS verification_mismatches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,           -- epoch milliseconds
  did TEXT NOT NULL,
  method TEXT,
  provider TEXT,                 -- verifying upstream's analytics tag
  reason TEXT,                   -- coreMismatch | upstream:<error>
  local_document TEXT,           -- JSON, bounded
  upstream_document TEXT         -- JSON, bounded
);

CREATE INDEX IF NOT EXISTS idx_vmismatch_ts ON verification_mismatches (ts);
