-- thisDID analytics: one row per resolution request.
-- GDPR: no IP, no cookies, no user-agent — only coarse country + the requested DID + timing.
CREATE TABLE IF NOT EXISTS resolutions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,          -- epoch milliseconds
  did TEXT NOT NULL,
  method TEXT,
  route TEXT,                   -- local | upstream
  provider TEXT,                -- thisDID | godiddy | archon (routed-to tag)
  resolver TEXT,                -- human label, e.g. "thisDID (web driver)", "godiddy universal-resolver"
  via TEXT,                     -- upstream base URL that answered
  network TEXT,
  duration_ms INTEGER,
  success INTEGER,              -- 1 | 0
  error TEXT,                   -- DIF error code when unsuccessful
  chain TEXT,                   -- attempted routing chain, e.g. "local→godiddy→archon"
  country TEXT,                 -- request cf.country (coarse geo)
  colo TEXT                     -- edge colo that served it
);

CREATE INDEX IF NOT EXISTS idx_resolutions_ts ON resolutions (ts);
CREATE INDEX IF NOT EXISTS idx_resolutions_method ON resolutions (method);
CREATE INDEX IF NOT EXISTS idx_resolutions_provider ON resolutions (provider);
CREATE INDEX IF NOT EXISTS idx_resolutions_country ON resolutions (country);
