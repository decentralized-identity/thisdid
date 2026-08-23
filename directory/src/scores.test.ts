import { describe, expect, it } from "vitest";
import { buildScores, logScaledPopularity, ratioScore } from "./scores";
import { buildProfiles } from "./data/methods";
import { FALLBACK_REGISTRY } from "./dif";

describe("score math", () => {
  it("log-scales popularity against the leader, never fabricating from zero", () => {
    expect(logScaledPopularity(0, 1000)).toBeNull();
    expect(logScaledPopularity(1000, 1000)).toBe(100);
    // 1% of the leader's volume still lands mid-scale, not at 1.
    const one_percent = logScaledPopularity(10, 1000)!;
    expect(one_percent).toBeGreaterThan(30);
    expect(one_percent).toBeLessThan(50);
    expect(logScaledPopularity(5, 0)).toBeNull();
  });

  it("ratio scores are honest about empty windows", () => {
    expect(ratioScore(0, 0)).toBeNull();
    expect(ratioScore(99, 100)).toBe(99);
  });
});

describe("buildScores", () => {
  it("assembles per-method windows and null-scores silent methods", () => {
    const table = buildScores(
      [{ method: "web", total: 40, ok: 40 }],
      [
        { method: "web", total: 200, ok: 190 },
        { method: "sol", total: 10, ok: 10 },
      ],
      [
        { method: "web", total: 1000, ok: 950 },
        { method: "sol", total: 10, ok: 10 },
      ],
      [{ method: "web", total: 1440, ok: 1439 }],
      123,
    );
    expect(table.computedAt).toBe(123);
    const web = table.methods.web;
    expect(web.resolutions24h).toBe(40);
    expect(web.availability).toBe(95);
    expect(web.popularity).toBe(100);
    expect(web.canary24h).toBe(100);
    const sol = table.methods.sol;
    expect(sol.resolutions24h).toBe(0);
    expect(sol.popularity).toBeLessThan(50);
    expect(sol.canary24h).toBeNull();
    expect(table.methods.kilt).toBeUndefined();
  });
});

describe("profile assembly", () => {
  const profiles = buildProfiles(FALLBACK_REGISTRY);
  const byId = new Map(profiles.map((p) => [p.id, p]));

  it("derives statuses from engine config and curated overrides", () => {
    expect(byId.get("web")?.status).toBe("edge");
    expect(byId.get("xrpl")?.status).toBe("edge");
    expect(byId.get("btcr")?.status).toBe("upstream");
    expect(byId.get("ion")?.status).toBe("parked");
    expect(byId.get("kilt")?.status).toBe("no-go");
    expect(byId.get("algo")?.status).toBe("excluded");
    // Directory-only ids exist without a routing chain.
    expect(byId.get("sov")?.status).toBe("no-go");
    expect(byId.get("sov")?.chain).toEqual([]);
    expect(byId.get("iota")?.status).toBe("bench");
  });

  it("keeps real routing chains, even for no-go catalog members", () => {
    expect(byId.get("web")?.chain).toEqual(["ThisDID", "godiddy", "archon"]);
    expect(byId.get("iden3")?.chain).toEqual(["ThisDID", "archon", "godiddy"]);
    expect(byId.get("algo")?.chain).toEqual([
      "GoPlausible",
      "godiddy",
      "archon",
    ]);
    expect(byId.get("kilt")?.chain).toEqual(["ThisDID", "godiddy", "archon"]);
  });

  it("attaches DIF recommended badges and compose-driver facts", () => {
    expect(byId.get("hedera")?.dif?.recommended).toContain(
      "findings-did-hedera",
    );
    expect(byId.get("webplus")?.dif?.recommended).toContain(
      "findings-did-webplus",
    );
    expect(byId.get("kilt")?.dif?.dockerDriver).toBeDefined();
    // polygonid is ThisDID-only: no compose driver, no findings.
    expect(byId.get("polygonid")?.dif).toBeUndefined();
  });

  it("derives probation verifiers from the engine config", () => {
    // iden3: both archon and godiddy can independently verify.
    expect(byId.get("iden3")?.probationVerifiers).toEqual([
      "archon",
      "godiddy",
    ]);
    // jwk: godiddy only (archon's jwk driver is broken — excluded in config).
    expect(byId.get("jwk")?.probationVerifiers).toEqual(["godiddy"]);
    // polygonid/xrpl: no upstream anywhere — honest empty list.
    expect(byId.get("polygonid")?.probationVerifiers).toEqual([]);
    expect(byId.get("xrpl")?.probationVerifiers).toEqual([]);
    // Non-probation methods carry no verifier list at all.
    expect(byId.get("web")?.probationVerifiers).toBeUndefined();
  });

  it("marks probation methods and carries curated research", () => {
    expect(byId.get("xrpl")?.probation).toBe(true);
    expect(byId.get("key")?.probation).toBe(false);
    expect(byId.get("kilt")?.research).toContain("NXDOMAIN");
    expect(byId.get("kilt")?.links.length).toBeGreaterThan(2);
  });
});
