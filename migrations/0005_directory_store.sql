-- Directory worker storage (phase 1): the directory is D1-only — no KV
-- involvement. One small keyed table holds its DIF registry sync result and
-- its score cache; the directory writes ONLY here, never to the event logs.
CREATE TABLE IF NOT EXISTS directory_store (
  key TEXT PRIMARY KEY,       -- dif-registry | scores
  value TEXT NOT NULL,        -- JSON payload
  updated_ts INTEGER NOT NULL -- epoch ms
);
