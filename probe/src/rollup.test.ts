import { describe, expect, it } from "vitest";
import {
  DAY_MS,
  HOUR_MS,
  dayStart,
  healthKeyProvider,
  hourStart,
  mergeHourly,
  p95FromWindow,
  statusTransitions,
} from "./rollup";

describe("rollup time windows", () => {
  it("floors timestamps to UTC hour and day starts", () => {
    const ts = Date.UTC(2026, 7, 23, 14, 37, 12, 345);
    expect(hourStart(ts)).toBe(Date.UTC(2026, 7, 23, 14));
    expect(dayStart(ts)).toBe(Date.UTC(2026, 7, 23));
    expect(hourStart(ts) % HOUR_MS).toBe(0);
    expect(dayStart(ts) % DAY_MS).toBe(0);
  });
});

describe("healthKeyProvider", () => {
  it("maps health keys onto the analytics provider tags", () => {
    expect(healthKeyProvider("local:web")).toBe("ThisDID");
    expect(healthKeyProvider("local:xrpl")).toBe("ThisDID");
    expect(healthKeyProvider("goplausible")).toBe("GoPlausible");
    expect(healthKeyProvider("godiddy")).toBe("godiddy");
    expect(healthKeyProvider("archon")).toBe("archon");
  });
});

describe("statusTransitions", () => {
  it("journals only actual changes, including first observations", () => {
    const rows = statusTransitions(
      { godiddy: "up", archon: "up", "local:web": "degraded" },
      { godiddy: "up", archon: "down", "local:web": "up", "local:sol": "up" },
      1000,
    );
    expect(rows).toEqual([
      { ts: 1000, healthKey: "archon", from: "up", to: "down" },
      { ts: 1000, healthKey: "local:web", from: "degraded", to: "up" },
      { ts: 1000, healthKey: "local:sol", from: null, to: "up" },
    ]);
  });

  it("returns nothing when statuses are unchanged", () => {
    expect(statusTransitions({ godiddy: "up" }, { godiddy: "up" }, 1)).toEqual(
      [],
    );
  });
});

describe("p95FromWindow", () => {
  it("picks the ceil(0.95 * n)-th ordered latency per provider", () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      provider: "archon",
      duration_ms: (i + 1) * 100,
      rn: i + 1,
      cnt: 20,
    }));
    // ceil(0.95 * 20) = 19 → 1900ms.
    expect(p95FromWindow(rows).get("archon")).toBe(1900);
    // A single sample is its own p95 (max(1, ceil) guard).
    expect(
      p95FromWindow([
        { provider: "godiddy", duration_ms: 42, rn: 1, cnt: 1 },
      ]).get("godiddy"),
    ).toBe(42);
  });
});

describe("mergeHourly", () => {
  it("merges probe, resolution, verifier, and transition aggregates by provider", () => {
    const rows = mergeHourly(
      [
        {
          provider: "ThisDID",
          total: 960,
          ok: 955,
          rate_limited: 0,
          timeouts: 2,
          avg_ms: 412.6,
        },
        {
          provider: "godiddy",
          total: 60,
          ok: 58,
          rate_limited: 3,
          timeouts: 1,
          avg_ms: 220.2,
        },
      ],
      new Map([
        ["ThisDID", 900],
        ["godiddy", 480],
      ]),
      [
        { provider: "ThisDID", total: 1200, ok: 1180, avg_ms: 350.4 },
        { provider: "archon", total: 40, ok: 39, avg_ms: 800 },
        { provider: null, total: 3, ok: 0, avg_ms: null },
      ],
      [
        { verified_by: "archon", matches: 120, mismatches: 1 },
        { verified_by: null, matches: 5, mismatches: 0 },
      ],
      [
        { health_key: "local:web", transitions: 2 },
        { health_key: "local:sol", transitions: 1 },
        { health_key: "godiddy", transitions: 4 },
      ],
    );
    const byProvider = new Map(rows.map((r) => [r.provider, r]));

    const thisdid = byProvider.get("ThisDID")!;
    expect(thisdid.probesTotal).toBe(960);
    expect(thisdid.probeLatencyAvgMs).toBe(413);
    expect(thisdid.probeLatencyP95Ms).toBe(900);
    expect(thisdid.resolutionsTotal).toBe(1200);
    // local:* health keys fold into the ThisDID provider row.
    expect(thisdid.statusTransitions).toBe(3);

    const godiddy = byProvider.get("godiddy")!;
    expect(godiddy.probesRateLimited).toBe(3);
    expect(godiddy.statusTransitions).toBe(4);

    // archon appears via resolutions + verification even without probes.
    const archon = byProvider.get("archon")!;
    expect(archon.probesTotal).toBe(0);
    expect(archon.resolutionsOk).toBe(39);
    expect(archon.verificationMatch).toBe(120);
    expect(archon.verificationMismatch).toBe(1);

    // Null provider/verifier rows are dropped, never crash.
    expect(byProvider.has("null")).toBe(false);
  });
});
