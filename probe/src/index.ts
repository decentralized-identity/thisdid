/**
 * thisdid-probe — connected sub-worker that health-checks every resolver route
 * with real canary DID resolutions every five minutes (see the cron trigger
 * in probe/wrangler.jsonc).
 *
 * Each round:
 *   - fires all canaries in parallel (same 8s bound as live traffic),
 *   - appends one row per canary to the D1 `probes` table (NOT `resolutions` —
 *     probe traffic must never pollute user-facing analytics),
 *   - folds per-provider EWMAs into the `routing:health:v2` KV snapshot that
 *     the main resolver Worker reads.
 *
 * Godiddy is the exception to the canary-resolution pattern: its public
 * resolver API is quota-throttled, so a canary DID both burned quota shared
 * with live traffic and read a 429 as an outage — Godiddy showed "down" while
 * serving fine. Its availability is probed against the always-on, unmetered
 * ingress health endpoint (GODIDDY_HEALTH) instead, and a 429 from any
 * upstream anywhere counts as "up but throttled", never as a failure.
 *
 * It is connected to the main Worker only through the shared D1 database and
 * STATS_KV namespace (same ids in wrangler.jsonc). It never sits on the request
 * path — if this Worker breaks, resolution and the UI are unaffected.
 */
import { resolveLocal } from "../../src/resolvers/local";
import { fetchUpstream } from "../../src/resolvers/upstream";
import { providerTag, type Step } from "../../src/resolvers/registry";
import type { DriverBindings } from "../../src/types";
import {
  HEALTH_KEY,
  type HealthSnapshot,
  type ProviderHealth,
  type ProviderStatus,
} from "../../src/routing/health";
import { recordStatusTransitions, runRollups, type StatusMap } from "./rollup";

interface ProbeEnv extends DriverBindings {
  GODIDDY_RESOLVER: string;
  ARCHON_RESOLVER: string;
  /** Archon Gatekeeper base for did:cid ONLY (same as the main Worker). */
  ARCHON_CID_RESOLVER?: string;
  GOPLAUSIBLE_RESOLVER: string;
  /** OwnYourData OYDID resolver base (same as the main Worker) — first hop for did:oyd. */
  OYD_RESOLVER: string;
  /** Godiddy's unmetered ingress health endpoint (probed instead of the quota-throttled resolver API). */
  GODIDDY_HEALTH?: string;
  /** Same secret as the main Worker (set separately: `wrangler secret put GODIDDY_API_KEY --config probe/wrangler.jsonc`).
   * Sent on the health check too, so probe traffic is authenticated to
   * Godiddy exactly like live resolution traffic. */
  GODIDDY_API_KEY?: string;
  /** Optional stable ethr DID; enable only after the ethr driver RPC networks are configured. */
  ETHR_CANARY_DID?: string;
  /** Optional stable ens DID; enable only after the ens driver RPC secret is configured. */
  ENS_CANARY_DID?: string;
  DB?: D1Database;
  STATS_KV?: KVNamespace;
}

/** One canary per route a provider is authoritative for (mirrors the SPA examples). */
const CANARIES: { step: Step; did: string }[] = [
  { step: "local", did: "did:web:identity.foundation" },
  {
    step: "local",
    did: "did:key:z6MktvqCyLxTsXUH1tUZncNdVeEZ7hNh7npPRbUU27GTrYb8",
  },
  {
    step: "local",
    did: "did:pkh:eip155:1:0xab16a96d359ec26a11e2c2b3d8f8b8942d5bfcdb",
  },
  {
    step: "local",
    did: "did:peer:0z6MkqRYqQiSgvZQdnBytw86Qbs2ZWUkGv22od935YF4s8M7V",
  },
  // bsky.app's account DID — a stable, long-lived entry in the public PLC directory.
  { step: "local", did: "did:plc:z72i7hdynmk6r22z27h6tvur" },
  // First registered legal-entity DID on the EBSI pilot registry (stable since registration).
  { step: "local", did: "did:ebsi:zZeKyEJfUTGwajhNyNX928z" },
  // NEAR implicit account (the identifier IS the ed25519 key) — deterministic, offline.
  {
    step: "local",
    did: "did:near:98793cd91a3f870fb126f66285808c7e094afcfc4eda8a970f6648cdf0dbd6de",
  },
  // NEAR protocol account (permanent) — exercises the live mainnet RPC path.
  { step: "local", did: "did:near:registrar.near" },
  // did:jwk P-256 spec vector — deterministic, offline (deploy/bundle check).
  {
    step: "local",
    did: "did:jwk:eyJjcnYiOiJQLTI1NiIsImt0eSI6IkVDIiwieCI6ImFjYklRaXVNczNpOF91c3pFakoydHBUdFJNNEVVM3l6OTFQSDZDZEgyVjAiLCJ5IjoiX0tjeUxqOXZXTXB0bm1LdG00NkdxRHo4d2Y3NEk1TEtncmwyR3pIM25TRSJ9",
  },
  // did:webvh from the DIF Universal Resolver test catalog — verifiable
  // history hosted on GitHub Pages; resolution-verified through the driver.
  {
    step: "local",
    did: "did:webvh:Qmb3KLhAKJ9wZx1gTPzcPfCxviRkiEJ4RGdHNviaedGu3i:opsecid.github.io",
  },
  // cheqd's flagship mainnet DID, resolved via the official cheqd resolver.
  { step: "local", did: "did:cheqd:mainnet:Ps1ysXP2Ae6GBfxNhNQNKN" },
  // did:dns spec example — sequential _keyN._did URI records, live DNS.
  { step: "local", did: "did:dns:danubetech.com" },
  // did:cid — the chain-verifying driver re-derives archon.technology's node
  // identity from its signed operation chain (live Gatekeeper export path).
  {
    step: "local",
    did: "did:cid:bagaaieraoqzjgi6537vyu3h3rtetki5g4bk6stzyqplcmwpqgqxp7fewowcq",
  },
  // did:sol — the catalog example (legacy-program account on devnet); works
  // once the sol driver's SOL_RPC_DEVNET_URL secret is configured.
  {
    step: "local",
    did: "did:sol:devnet:2eK2DKs6vdzTEoj842Gfcs6DdtffPpw1iF6JbzQL4TuK",
  },
  // did:iden3 — the catalog example, read from the Amoy State contract; works
  // once the iden3 driver's IDEN3_RPC_POLYGON_AMOY_URL secret is configured.
  {
    step: "local",
    did: "did:iden3:polygon:amoy:xC8VZLUUfo5p9DWUawReh7QSstmYN6zR7qsQhQCsw",
  },
  // did:polygonid — the Privado docs' mainnet example (unpublished, resolves
  // as published:false); needs POLYGONID_RPC_POLYGON_MAIN_URL configured.
  {
    step: "local",
    did: "did:polygonid:polygon:main:2q4Q7F7tM1xpwUTgWivb6TgKX3vWirsE3mqymuYjVv",
  },
  // did:hedera — the catalog example's HCS topic on the public testnet
  // mirror node (keyless; no secrets required).
  {
    step: "local",
    did: "did:hedera:testnet:zHirM7oP62rzBmw4oSbWZTSeTLzb9zrDTfQa1cdMBWCPp_0.0.7280148",
  },
  // did:xrpl — the catalog example's XLS-40 DID entry on mainnet, read from
  // the public xrplcluster JSON-RPC (keyless; no secrets required).
  {
    step: "local",
    did: "did:xrpl:0:r9BUM9z14j7bLFzQHRfurWNdNKYSABdGtE",
  },
  // did:iota — a production Identity object on Rebased mainnet (Turingcerts'
  // domain-linkage DID), read from the public fullnode (keyless).
  {
    step: "local",
    did: "did:iota:0x0c6e3b00bfe019452ffee1b5c7f5e6d2e09705cb6a354d22fd853450494a697c",
  },
  // did:empe — the catalog example on the Empeiria testnet, read via GET
  // abci_query from the public Tendermint RPC (keyless).
  {
    step: "local",
    did: "did:empe:testnet:006308981b61932c5eaae1c39ace8ee3892f4a1f",
  },
  // did:tz — Tezos Foundation Baker 1 (tz3, revealed since 2023): layer-1
  // derivation plus BLAKE2b-verified key discovery through TzKT (keyless).
  {
    step: "local",
    did: "did:tz:tz3cqThj23Feu55KDynm7Vg81mCMpWDgzQZq",
  },
  // did:dht has NO canary: nobody republishes a stable public did:dht
  // record since TBD's shutdown, so any fixed DID would read the DHT's
  // honest notFound as an outage. The SPA tile is hidden for the same
  // reason (see src/methods.ts); re-add a canary here if a continuously
  // republished record ever exists again.
  // did:ion LONG-FORM — offline, deterministic, fully verified in-driver
  // (deploy/bundle check). Short-form has no configured endpoint by design:
  // the routing chain serves it via upstreams, so it is not a local canary.
  {
    step: "local",
    did: "did:ion:EiBwLUL07Ku-N8ZBODHk2jV2uCRWO6SyLhGZimHbqiTa3A:eyJkZWx0YSI6eyJwYXRjaGVzIjpbeyJhY3Rpb24iOiJyZXBsYWNlIiwiZG9jdW1lbnQiOnsicHVibGljS2V5cyI6W3siaWQiOiJzaWcta2V5IiwicHVibGljS2V5SndrIjp7ImNydiI6InNlY3AyNTZrMSIsImt0eSI6IkVDIiwieCI6IllzQ2dSdHJNNkczZEEwUEcwOGZIbkNJSXVnMmNuUEpLYlFSdElkSWZrUGMiLCJ5IjoiYllQMnB2OHQtR1pPeDdnRXF4Tml6SlZBUGtOMDBZR2VDRUM5aW9nWGdBMCJ9LCJwdXJwb3NlcyI6WyJhdXRoZW50aWNhdGlvbiIsImFzc2VydGlvbk1ldGhvZCJdLCJ0eXBlIjoiRWNkc2FTZWNwMjU2azFWZXJpZmljYXRpb25LZXkyMDE5In1dLCJzZXJ2aWNlcyI6W3siaWQiOiJzaXRlIiwic2VydmljZUVuZHBvaW50IjoiaHR0cHM6Ly90aGlzZGlkLmNvbSIsInR5cGUiOiJMaW5rZWREb21haW5zIn1dfX1dLCJ1cGRhdGVDb21taXRtZW50IjoiRWlDaHp6MG0wOC1yemFzUnlWOXF2QXdVVEswYnZLVURaWlpjUmhDN0ZvRzdCZyJ9LCJzdWZmaXhEYXRhIjp7ImRlbHRhSGFzaCI6IkVpQnlWREdZRlpLaEtObm1MZ25hdW5LWGIySjVUWFhLSUJ4di1lcFdsV1FEOVEiLCJyZWNvdmVyeUNvbW1pdG1lbnQiOiJFaURtMThmeHIzWVZnTGRxZ0xRcElocDQ2TkZneDVIZ1Y2WTMzbFA5Q2Q5VVhnIn19",
  },
  // The network-backed ens canary is enabled with ENS_CANARY_DID once the ens
  // driver's RPC secret is configured (same pattern as ETHR_CANARY_DID).
  // Godiddy: NOT a canary resolution — its public resolver API is
  // quota-throttled, so probing it burned quota and misread 429s as
  // downtime. probeOne routes this entry to the unmetered health endpoint.
  { step: "godiddy", did: "health:godiddy" },
  {
    step: "goplausible",
    did: "did:algo:uti7paasilrda3ishy5m7j7lnrx2aivqjwi7zkccgkvlmfd3vpr5pwsz4i",
  },
  { step: "goplausible", did: "did:nfd:goplausible.algo" },
  // did:oyd — a live OYDID DID (from OwnYourData's uni-resolver test set),
  // resolved through resolver.ownyourdata.eu, the authoritative first hop for
  // the method. The OYDID server does the hash/log/signature verification.
  {
    step: "oyd",
    did: "did:oyd:zQmaBZTghndXTgxNwfbdpVLWdFf6faYE4oeuN2zzXdQt1kh",
  },
  {
    step: "archon",
    did: "did:iden3:polygon:amoy:xC8VZLUUfo5p9DWUawReh7QSstmYN6zR7qsQhQCsw",
  },
  // archon.technology's own node identity, served by Archon's cid-only
  // Gatekeeper endpoint (a different deployment than its Universal Resolver —
  // both fold into the `archon` health key).
  {
    step: "archon",
    did: "did:cid:bagaaieraoqzjgi6537vyu3h3rtetki5g4bk6stzyqplcmwpqgqxp7fewowcq",
  },
];

/** Same wall-clock bound as a live routing step (STEP_TIMEOUT_MS in src/resolve.ts). */
const PROBE_TIMEOUT_MS = 8000;
const RETENTION_MS = 30 * 24 * 3600 * 1000;
/** Resolution events and mismatch evidence are kept longer than raw probes but
 * are still pruned so the main Worker's tables cannot grow without bound. 400
 * days keeps the dashboard's year-to-date/annual ranges intact while capping
 * growth; tune here if a longer or shorter horizon is wanted. */
const RESOLUTION_RETENTION_MS = 400 * 24 * 3600 * 1000;
const DEFAULT_GODIDDY_HEALTH = "https://api.godiddy.com/health";

// Health-fold tuning: latency EWMA reacts in ~3 rounds, success rate in ~7;
// 3 all-canary-failed rounds (~15 min at the 5-min cadence) trips "down";
// EWMA above 4s reads "degraded".
const EWMA_LATENCY = 0.3;
const EWMA_SUCCESS = 0.15;
const BREAKER_FAILS = 3;
const DEGRADED_MS = 4000;

interface ProbeResult {
  step: Step;
  healthKey?: string;
  did: string;
  ok: boolean;
  ms: number;
  error: string | null;
}

function upstreamBase(step: Step, env: ProbeEnv, did: string): string {
  switch (step) {
    case "godiddy":
      return env.GODIDDY_RESOLVER;
    case "archon":
      // did:cid is served only by Archon's Gatekeeper API (see main Worker).
      return did.startsWith("did:cid:")
        ? env.ARCHON_CID_RESOLVER || env.ARCHON_RESOLVER
        : env.ARCHON_RESOLVER;
    case "goplausible":
      return env.GOPLAUSIBLE_RESOLVER;
    case "oyd":
      return env.OYD_RESOLVER;
    default:
      return "";
  }
}

/**
 * Probe one canary; ok means the provider answered within the bound — a
 * usable DID document for resolution canaries, a healthy response for the
 * Godiddy health check. A 429 anywhere is "up but throttled": the provider is
 * alive and only our quota is exhausted, so it counts as ok and is logged
 * with error "rateLimited" for visibility.
 */
export async function probeOne(
  canary: { step: Step; did: string },
  env: ProbeEnv,
): Promise<ProbeResult> {
  const started = Date.now();
  let error: string | null = null;
  let ok = false;
  try {
    const attempt = (async (): Promise<"ok" | "rateLimited" | null> => {
      if (canary.step === "local") {
        const r = await resolveLocal(canary.did, env);
        return r.didDocument && !r.didResolutionMetadata.error ? "ok" : null;
      }
      if (canary.step === "godiddy") {
        // Availability check against the unmetered ingress health endpoint —
        // never the quota-throttled resolver API (see the header). The API
        // key rides along when configured so the probe is authenticated the
        // same way live resolution traffic is.
        const res = await fetch(env.GODIDDY_HEALTH || DEFAULT_GODIDDY_HEALTH, {
          headers: {
            accept: "text/plain",
            ...(env.GODIDDY_API_KEY
              ? { authorization: `Bearer ${env.GODIDDY_API_KEY}` }
              : {}),
          },
        });
        await res.text().catch(() => ""); // drain the tiny body
        if (res.status === 429) return "rateLimited";
        return res.ok ? "ok" : null;
      }
      const r = await fetchUpstream(
        canary.did,
        upstreamBase(canary.step, env, canary.did),
      );
      if (r.ok) return "ok";
      return r.failure.error === "rateLimited" ? "rateLimited" : null;
    })();
    const hit = await Promise.race([
      attempt,
      new Promise<"timeout">((resolve) =>
        setTimeout(() => resolve("timeout"), PROBE_TIMEOUT_MS),
      ),
    ]);
    if (hit === "timeout") error = "timeout";
    else if (!hit) error = "miss";
    else {
      ok = true;
      if (hit === "rateLimited") error = "rateLimited";
    }
  } catch {
    error = "error";
  }
  return {
    step: canary.step,
    healthKey:
      canary.step === "local"
        ? `local:${canary.did.split(":")[1] ?? "unknown"}`
        : canary.step,
    did: canary.did,
    ok,
    ms: Date.now() - started,
    error,
  };
}

/** Fold one round of results into the previous snapshot (EWMAs + breaker). */
export function fold(
  prev: HealthSnapshot | null,
  results: ProbeResult[],
  now: number,
): HealthSnapshot {
  const providers: HealthSnapshot["providers"] = { ...(prev?.providers ?? {}) };
  const steps = [...new Set(results.map((r) => r.healthKey ?? r.step))];
  for (const step of steps) {
    const rs = results.filter((r) => (r.healthKey ?? r.step) === step);
    const oks = rs.filter((r) => r.ok);
    const roundOk = oks.length > 0;
    const p = providers[step];

    const okAvg = oks.length
      ? oks.reduce((a, r) => a + r.ms, 0) / oks.length
      : null;
    const ewmaMs =
      okAvg == null
        ? (p?.ewmaMs ?? null)
        : p?.ewmaMs == null
          ? Math.round(okAvg)
          : Math.round(EWMA_LATENCY * okAvg + (1 - EWMA_LATENCY) * p.ewmaMs);

    const roundRate = rs.length ? oks.length / rs.length : 0;
    const successRate =
      p?.successRate == null
        ? roundRate
        : Math.round(
            (EWMA_SUCCESS * roundRate + (1 - EWMA_SUCCESS) * p.successRate) *
              1000,
          ) / 1000;

    const consecutiveFails = roundOk ? 0 : (p?.consecutiveFails ?? 0) + 1;
    const status: ProviderStatus =
      consecutiveFails >= BREAKER_FAILS
        ? "down"
        : !roundOk ||
            oks.length < rs.length ||
            (ewmaMs != null && ewmaMs > DEGRADED_MS)
          ? "degraded"
          : "up";

    const health: ProviderHealth = {
      status,
      ewmaMs,
      successRate,
      consecutiveFails,
      lastOkTs: roundOk ? now : (p?.lastOkTs ?? null),
      lastProbeTs: now,
    };
    providers[step] = health;
  }
  return { v: 2, updatedTs: now, providers };
}

let schemaReady = false;

/** Self-create the probes table (mirrors migrations/0002_probes.sql, same pattern as analytics). */
async function ensureSchema(db: D1Database): Promise<void> {
  if (schemaReady) return;
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS probes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        provider TEXT NOT NULL,
        step TEXT NOT NULL,
        did TEXT NOT NULL,
        method TEXT,
        success INTEGER,
        duration_ms INTEGER,
        error TEXT
      )`,
    )
    .run();
  await db
    .prepare("CREATE INDEX IF NOT EXISTS idx_probes_ts ON probes (ts)")
    .run();
  await db
    .prepare(
      "CREATE INDEX IF NOT EXISTS idx_probes_provider_ts ON probes (provider, ts)",
    )
    .run();
  schemaReady = true;
}

/** One probe round: fire all canaries, fold into the KV snapshot, log rows to D1. */
async function runRound(env: ProbeEnv): Promise<void> {
  const now = Date.now();
  const canaries = [
    ...CANARIES,
    ...(env.ETHR_CANARY_DID
      ? [{ step: "local" as const, did: env.ETHR_CANARY_DID }]
      : []),
    ...(env.ENS_CANARY_DID
      ? [{ step: "local" as const, did: env.ENS_CANARY_DID }]
      : []),
  ];
  const results = await Promise.all(canaries.map((c) => probeOne(c, env)));

  // Snapshot first — it is what routing decisions will read. Status changes
  // are also journaled to D1 (`provider_status_events`): the snapshot is
  // overwritten every round, and the journal is what preserves uptime
  // intervals and flap history for the rollups.
  let prevStatuses: StatusMap = {};
  let nextStatuses: StatusMap = {};
  if (env.STATS_KV) {
    try {
      const raw = await env.STATS_KV.get(HEALTH_KEY);
      const prev = raw ? (JSON.parse(raw) as HealthSnapshot) : null;
      const next = fold(prev, results, now);
      await env.STATS_KV.put(HEALTH_KEY, JSON.stringify(next));
      for (const [key, p] of Object.entries(prev?.providers ?? {})) {
        if (p) prevStatuses[key] = p.status;
      }
      for (const [key, p] of Object.entries(next.providers)) {
        if (p) nextStatuses[key] = p.status;
      }
    } catch (err) {
      console.error(
        JSON.stringify({ event: "probe.snapshot_error", error: String(err) }),
      );
      prevStatuses = {};
      nextStatuses = {};
    }
  }

  if (env.DB) {
    try {
      await ensureSchema(env.DB);
      const stmt = env.DB.prepare(
        "INSERT INTO probes (ts, provider, step, did, method, success, duration_ms, error) VALUES (?,?,?,?,?,?,?,?)",
      );
      await env.DB.batch(
        results.map((r) =>
          stmt.bind(
            now,
            providerTag(r.step),
            r.step,
            r.did,
            r.did.split(":")[1] ?? "",
            r.ok ? 1 : 0,
            r.ms,
            r.error,
          ),
        ),
      );
      await recordStatusTransitions(env.DB, prevStatuses, nextStatuses, now);
    } catch (err) {
      console.error(
        JSON.stringify({ event: "probe.d1_error", error: String(err) }),
      );
    }
  }

  console.log(
    JSON.stringify({
      event: "probe.round",
      results: results.map((r) => ({
        step: r.step,
        ok: r.ok,
        ms: r.ms,
        error: r.error,
      })),
    }),
  );
}

async function prune(env: ProbeEnv): Promise<void> {
  if (!env.DB) return;
  const db = env.DB;
  try {
    await ensureSchema(db);
  } catch (err) {
    console.error(
      JSON.stringify({ event: "probe.prune_error", error: String(err) }),
    );
    return;
  }
  // Each table is deleted independently: `resolutions` and
  // `verification_mismatches` are owned by the main Worker's runtime schema and
  // may not exist yet on a fresh environment, so a missing one must not block
  // pruning the others. Without this the main-Worker tables grow forever
  // (their rows are attacker-drivable — see the /data cardinality note).
  const deletes: [string, number][] = [
    ["DELETE FROM probes WHERE ts < ?", Date.now() - RETENTION_MS],
    [
      "DELETE FROM resolutions WHERE ts < ?",
      Date.now() - RESOLUTION_RETENTION_MS,
    ],
    [
      "DELETE FROM verification_mismatches WHERE ts < ?",
      Date.now() - RESOLUTION_RETENTION_MS,
    ],
  ];
  for (const [sql, cutoff] of deletes) {
    try {
      await db.prepare(sql).bind(cutoff).run();
    } catch (err) {
      console.error(
        JSON.stringify({ event: "probe.prune_error", error: String(err) }),
      );
    }
  }
}

export default {
  async scheduled(ctrl, env, ctx) {
    await runRound(env);
    // Housekeeping once an hour, off the round path: raw-log pruning and the
    // durable stats rollups (hourly provider stats, daily method stats),
    // cursor-driven so missed ticks self-heal and history backfills itself.
    if (new Date(ctrl.scheduledTime).getUTCMinutes() === 0) {
      ctx.waitUntil(prune(env));
      if (env.DB) {
        const db = env.DB;
        ctx.waitUntil(
          runRollups(db, Date.now()).catch((err) =>
            console.error(
              JSON.stringify({
                event: "probe.rollup_error",
                error: String(err),
              }),
            ),
          ),
        );
      }
    }
  },
} satisfies ExportedHandler<ProbeEnv>;
