/**
 * DIF DID Methods WG badge sets for the /methods response (directory
 * phase 3). The directory worker's daily sync stores the parsed registry in
 * the shared D1 `directory_store` table; the mother only READS it here —
 * validated, module-cached, and with a vendored fallback (the sets verified
 * live on 23 Aug 2026) so badges never depend on the sync having run.
 */
import { DIF_REGISTRY_VERSION } from "./dif-registry-contract";
import type { Env } from "./types";

export interface DifBadgeEntry {
  id: string;
  url: string;
}

export interface DifBadges {
  syncedAt: number;
  /** Methods with a `findings-did-<id>.md` in dif-recommended/. */
  recommended: DifBadgeEntry[];
  /** The dif-endorsed/ set — empty today, armed for the first endorsement. */
  endorsed: DifBadgeEntry[];
}

const FINDINGS =
  "https://github.com/decentralized-identity/did-methods/blob/main/dif-recommended";

const FALLBACK: DifBadges = {
  syncedAt: 0,
  recommended: [
    { id: "cid", url: `${FINDINGS}/findings-did-cid.md` },
    { id: "ethr", url: `${FINDINGS}/findings-did-ethr.md` },
    { id: "hedera", url: `${FINDINGS}/findings-did-hedera.md` },
    { id: "webplus", url: `${FINDINGS}/findings-did-webplus.md` },
    { id: "webvh", url: `${FINDINGS}/findings-did-webvh.md` },
  ],
  endorsed: [],
};

const CACHE_TTL_MS = 5 * 60_000;
let cache: { at: number; value: DifBadges } | null = null;

function validEntries(value: unknown): DifBadgeEntry[] | null {
  if (!Array.isArray(value)) return null;
  const out: DifBadgeEntry[] = [];
  for (const entry of value) {
    const e = entry as DifBadgeEntry;
    if (
      !e ||
      typeof e.id !== "string" ||
      typeof e.url !== "string" ||
      !/^https:\/\//.test(e.url)
    ) {
      return null;
    }
    out.push({ id: e.id, url: e.url });
  }
  return out;
}

/** Badge sets from the directory's synced registry, else the fallback. */
export async function getDifBadges(env: Env, now: number): Promise<DifBadges> {
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.value;
  let value = FALLBACK;
  try {
    const row = await env.DB?.prepare(
      "SELECT value FROM directory_store WHERE key = 'dif-registry'",
    ).first<{ value: string }>();
    if (row?.value) {
      const parsed = JSON.parse(row.value) as {
        v?: unknown;
        syncedAt?: unknown;
        recommended?: unknown;
        endorsed?: unknown;
      };
      const recommended = validEntries(parsed.recommended);
      const endorsed = validEntries(parsed.endorsed);
      if (
        parsed.v === DIF_REGISTRY_VERSION &&
        typeof parsed.syncedAt === "number" &&
        recommended &&
        recommended.length > 0 &&
        endorsed
      ) {
        value = { syncedAt: parsed.syncedAt, recommended, endorsed };
      }
    }
  } catch {
    // table absent or corrupt value — the fallback stands
  }
  cache = { at: now, value };
  return value;
}

/** Test hook: clear the module cache. */
export function resetDifBadgesCache(): void {
  cache = null;
}
