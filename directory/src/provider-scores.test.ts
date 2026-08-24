import { describe, expect, it } from "vitest";
import {
  availability,
  latencyDiscipline,
  reliability,
  stabilityScore,
  statusNowOf,
  successConsistency,
  throttleBehavior,
  verificationAgreement,
} from "./provider-scores";
import { PROVIDERS } from "./data/providers";
import type { ProviderWindow } from "./types";

const window = (over: Partial<ProviderWindow> = {}): ProviderWindow => ({
  probesTotal: 0,
  probesOk: 0,
  probesRateLimited: 0,
  probesTimeout: 0,
  probeLatencyAvgMs: null,
  probeLatencyWorstP95Ms: null,
  resolutionsTotal: 0,
  resolutionsOk: 0,
  resolutionLatencyAvgMs: null,
  verificationMatch: 0,
  verificationMismatch: 0,
  statusTransitions: 0,
  ...over,
});

describe("reliability components", () => {
  it("combines probes AND routed traffic for success consistency", () => {
    expect(
      successConsistency(
        window({
          probesTotal: 100,
          probesOk: 100,
          resolutionsTotal: 100,
          resolutionsOk: 50,
        }),
      ),
    ).toBe(75);
    expect(successConsistency(window())).toBeNull();
  });

  it("scores stability by flap rate", () => {
    expect(stabilityScore(0, 30)).toBe(100);
    expect(stabilityScore(6, 30)).toBe(100); // 0.2/day
    expect(stabilityScore(180, 30)).toBe(0); // 6/day
    expect(stabilityScore(93, 30)).toBe(50); // ~3.1/day
    expect(stabilityScore(0, 0)).toBeNull();
  });

  it("scores latency discipline by p95/avg dispersion", () => {
    expect(latencyDiscipline(100, 200)).toBe(100); // 2x
    expect(latencyDiscipline(100, 600)).toBe(0); // 6x
    expect(latencyDiscipline(100, 400)).toBe(50); // 4x
    expect(latencyDiscipline(null, 400)).toBeNull();
  });

  it("scores throttling by rate-limited share", () => {
    expect(throttleBehavior(window({ probesTotal: 100 }))).toBe(100);
    expect(
      throttleBehavior(window({ probesTotal: 100, probesRateLimited: 20 })),
    ).toBe(0);
    expect(
      throttleBehavior(window({ probesTotal: 100, probesRateLimited: 10 })),
    ).toBe(50);
    expect(throttleBehavior(window())).toBeNull();
  });

  it("scores verification agreement, null when never a verifier", () => {
    expect(
      verificationAgreement(
        window({ verificationMatch: 99, verificationMismatch: 1 }),
      ),
    ).toBe(99);
    expect(verificationAgreement(window())).toBeNull();
  });
});

describe("reliability composite", () => {
  it("weights present components and redistributes over missing ones", () => {
    // Only success (100) + stability (100) present → composite 100.
    const partial = reliability(window({ probesTotal: 10, probesOk: 10 }), 30);
    expect(partial.components.successConsistency).toBe(100);
    expect(partial.components.stability).toBe(100);
    expect(partial.components.latencyDiscipline).toBeNull();
    expect(partial.score).toBe(100);

    // Mixed: success 90 (w40) + stability 100 (w25) + latency 100 (w15)
    // + throttle 100 (w10) + verification 50 (w10) → 91.
    const full = reliability(
      window({
        probesTotal: 100,
        probesOk: 90,
        probeLatencyAvgMs: 100,
        probeLatencyWorstP95Ms: 150,
        verificationMatch: 1,
        verificationMismatch: 1,
      }),
      30,
    );
    expect(full.score).toBe(91);
  });

  it("is null with no data at all", () => {
    expect(reliability(window(), 0).score).toBeNull();
  });
});

describe("availability and status", () => {
  it("availability is the probe ok-ratio, honest when silent", () => {
    expect(availability(window({ probesTotal: 200, probesOk: 199 }))).toBe(100);
    expect(availability(window({ probesTotal: 200, probesOk: 150 }))).toBe(75);
    expect(availability(window())).toBeNull();
  });

  it("statusNow classifies the recent probe window by ratio", () => {
    expect(statusNowOf(0, 0)).toBe("unknown");
    expect(statusNowOf(10, 0)).toBe("down");
    expect(statusNowOf(10, 7)).toBe("degraded");
    expect(statusNowOf(10, 10)).toBe("up");
    // One flaky canary among ~19 healthy ones must not demote the fleet.
    expect(statusNowOf(190, 180)).toBe("up");
    expect(statusNowOf(190, 160)).toBe("degraded");
  });
});

describe("provider profiles", () => {
  it("derives method lists from the engine config", () => {
    const byId = new Map(PROVIDERS.map((p) => [p.id, p]));
    expect(byId.get("thisdid")?.methods).toContain("xrpl");
    expect(byId.get("thisdid")?.methods).toContain("iota");
    expect(byId.get("thisdid")?.methods).toContain("dht");
    expect(byId.get("thisdid")?.methods).toContain("tz");
    expect(byId.get("thisdid")?.methods).toContain("empe");
    expect(byId.get("thisdid")?.methods).toContain("ion");
    expect(byId.get("thisdid")?.methods).toHaveLength(24);
    expect(byId.get("goplausible")?.methods).toEqual(["algo", "nfd"]);
    expect(byId.get("archon")?.methods).toContain("hedera");
    expect(byId.get("godiddy")?.methods).toContain("jwk");
    // Analytics tags round-trip to directory ids by lowercasing.
    for (const p of PROVIDERS) {
      expect(p.tag.toLowerCase().replace(/[^a-z0-9]/g, "")).toBe(p.id);
    }
  });
});
