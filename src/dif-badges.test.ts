import { afterEach, describe, expect, it } from "vitest";
import { getDifBadges, resetDifBadgesCache } from "./dif-badges";
import type { Env } from "./types";

afterEach(() => resetDifBadgesCache());

const dbWith = (value: string | null): Env =>
  ({
    DB: {
      prepare: () => ({
        first: async () => (value === null ? null : { value }),
      }),
    },
  }) as unknown as Env;

describe("getDifBadges", () => {
  it("serves the vendored fallback when D1 is absent", async () => {
    const badges = await getDifBadges({} as Env, 1);
    expect(badges.recommended.map((r) => r.id)).toEqual([
      "cid",
      "ethr",
      "hedera",
      "webplus",
      "webvh",
    ]);
    expect(badges.endorsed).toEqual([]);
  });

  it("serves the synced registry sets when the stored value is valid", async () => {
    const stored = JSON.stringify({
      v: 2,
      syncedAt: 42,
      recommended: [{ id: "webvh", url: "https://x/findings-did-webvh.md" }],
      endorsed: [{ id: "cid", url: "https://x/endorsed-cid.md" }],
      composeMethods: [],
      drivers: {},
    });
    const badges = await getDifBadges(dbWith(stored), 1);
    expect(badges.syncedAt).toBe(42);
    expect(badges.recommended).toEqual([
      { id: "webvh", url: "https://x/findings-did-webvh.md" },
    ]);
    expect(badges.endorsed).toEqual([
      { id: "cid", url: "https://x/endorsed-cid.md" },
    ]);
  });

  it("falls back on corrupt values and non-https URLs", async () => {
    for (const bad of [
      "not json",
      JSON.stringify({ recommended: "nope", endorsed: [] }),
      JSON.stringify({
        syncedAt: 1,
        recommended: [{ id: "x", url: "javascript:alert(1)" }],
        endorsed: [],
      }),
      JSON.stringify({ v: 2, syncedAt: 1, recommended: [], endorsed: [] }), // empty set: keep fallback
      // right shape, WRONG schema version — must fall back
      JSON.stringify({
        v: 1,
        syncedAt: 1,
        recommended: [{ id: "x", url: "https://x/f.md" }],
        endorsed: [],
      }),
    ]) {
      resetDifBadgesCache();
      const badges = await getDifBadges(dbWith(bad), 1);
      expect(badges.recommended.map((r) => r.id)).toContain("hedera");
    }
  });

  it("caches per module for the TTL", async () => {
    let calls = 0;
    const env = {
      DB: {
        prepare: () => ({
          first: async () => {
            calls++;
            return null;
          },
        }),
      },
    } as unknown as Env;
    await getDifBadges(env, 1000);
    await getDifBadges(env, 2000);
    expect(calls).toBe(1);
  });
});
