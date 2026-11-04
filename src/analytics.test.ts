import { describe, expect, it } from "vitest";
import {
  getStats,
  parseFilter,
  recentPage,
  recordResolution,
  summaryTtl,
  type ResolutionEvent,
} from "./analytics";
import type { Env } from "./types";

it("validates analytics filters and defaults unknown ranges", () => {
  expect(
    parseFilter(
      new URL("https://example.test/data?range=week&country=TR&method=web"),
    ),
  ).toEqual({ range: "week", country: "TR", method: "web" });
  expect(
    parseFilter(new URL("https://example.test/data?range=nope")).range,
  ).toBe("day");
});

describe("summary cache lifetimes", () => {
  it("keeps the all-time summary five minutes and never caches filtered views", () => {
    expect(summaryTtl({ range: "all" })).toBe(300);
    expect(summaryTtl({ range: "day" })).toBe(60);
    expect(summaryTtl({ range: "all", country: "TR" })).toBe(0);
    expect(summaryTtl({ range: "day", method: "web" })).toBe(0);
  });

  it("writes each KV entry with its range's lifetime", async () => {
    const puts: { key: string; ttl?: number }[] = [];
    const STATS_KV = {
      get: async () => null,
      put: async (
        key: string,
        _value: string,
        opts?: { expirationTtl?: number },
      ) => {
        puts.push({ key, ttl: opts?.expirationTtl });
      },
    };
    const env = { STATS_KV } as unknown as Env;
    await getStats(env, { range: "all" });
    await getStats(env, { range: "day" });
    await getStats(env, { range: "all", country: "TR" });
    expect(puts).toEqual([
      { key: "analytics:sum:all", ttl: 300 },
      { key: "analytics:sum:day", ttl: 60 },
    ]);
  });
});

describe("only DID Core method-names reach the log and the leaderboards", () => {
  const recordingDb = () => {
    const statements: string[] = [];
    const stmt = {
      bind: () => stmt,
      run: async () => ({}),
      all: async () => ({ results: [] }),
      first: async () => null,
    };
    const db = {
      prepare: (sql: string) => {
        statements.push(sql);
        return stmt;
      },
      batch: async (list: unknown[]) => list.map(() => ({ results: [] })),
    };
    return { statements, env: { DB: db } as unknown as Env };
  };
  const event = (method: string): ResolutionEvent =>
    ({
      ts: 1,
      did: `did:${method}:x`,
      method,
      route: null,
      provider: null,
      resolver: null,
      via: null,
      network: null,
      durationMs: 1,
      success: false,
      error: "invalidDid",
      chain: null,
      country: null,
      colo: null,
      verification: null,
      verifiedBy: null,
    }) as ResolutionEvent;

  it("never records an invalid method value", async () => {
    for (const method of ["", "//bxss.me/t/fit.txt", "0 ", "WEB", "a b"]) {
      const { env, statements } = recordingDb();
      await recordResolution(env, event(method));
      expect(statements, JSON.stringify(method)).toEqual([]);
    }
    const { env, statements } = recordingDb();
    await recordResolution(env, event("webvh"));
    expect(
      statements.some((sql) => sql.includes("INSERT INTO resolutions")),
    ).toBe(true);
  });

  it("excludes invalid method values from every stats and feed query", async () => {
    const { env, statements } = recordingDb();
    await getStats(env, { range: "all", country: "TR" });
    await recentPage(env, { range: "day" });
    const reads = statements.filter(
      (sql) =>
        /FROM resolutions/.test(sql) && !/INSERT|PRAGMA|CREATE|ALTER/.test(sql),
    );
    expect(reads.length).toBeGreaterThan(10);
    for (const sql of reads) {
      expect(sql).toContain(
        "method GLOB '[a-z0-9]*' AND method NOT GLOB '*[^a-z0-9]*'",
      );
    }
  });
});
