/**
 * Spec §7.2.1: version-specific resolution.
 *
 * The port's correctness proof for history is the same as for current state:
 * replaying the committed mainnet recordings must reproduce, byte for byte,
 * what the Python reference resolver wrote for the same version request.
 */
import { describe, expect, it } from "vitest";
import { parseVersionTime, resolve } from "../resolver.js";
import { ALIAS_DID, ORG_DID, fixtureClient, readFixture } from "./fixtures.js";
import { traceHistory } from "../chain.js";
import { parseDid } from "../identifier.js";
import {
  StateError,
  deriveVerifiedState,
  revealedVerifiedState,
  verifyState,
} from "../state.js";
import { coinId } from "../chain.js";
import { toHex } from "../clvm.js";

const ALIAS_CALLS = "rpc_calls_ArD2.json";
const ORG_CALLS = "rpc_calls_julia_org.json";

const ALIAS_GEN1 =
  "0xe3d06a75d3e2c9ed7b71e18646dbf900d17d0cc55fd6584539ea9f72c01f58aa";
const ALIAS_GEN2 =
  "0x0e04c04dbb693f72eb5151753bf7b69ec468476945fe50d684e03609cf390f29";
const ALIAS_GEN3 =
  "0x6db248a37284af64ddc068ee80968363c96d1929ba006e3dc514312e34d2ac33";
const ORG_GEN1 =
  "0xa61c53bf8dd53c55da7d5ac8b53667c00ca36c87370c67497f20e79cc72e4084";
const ORG_GEN2 =
  "0x172f7246668c6cf8836e2379fde00006aaefc8543e2ce79a0b021a13fbcc69e6";
const ORG_GEN3 =
  "0x2af60aad4e7519bf9ee3eb0fd5624aaf608b066f51bb506207af35f6a0299ca5";
const ORG_GEN4 =
  "0xf295281cc99108b6c64fc71952cf2419da8df2830b1bd6842b44bc41a94ab75c";

describe("resolution by version ID replays the reference resolver", () => {
  const cases: Array<[string, string, string, string]> = [
    [ALIAS_DID, ALIAS_CALLS, ALIAS_GEN1, "expected_version_ArD2_gen1.json"],
    [ALIAS_DID, ALIAS_CALLS, ALIAS_GEN2, "expected_version_ArD2_gen2.json"],
    [ORG_DID, ORG_CALLS, ORG_GEN1, "expected_version_julia_org_gen1.json"],
    [ORG_DID, ORG_CALLS, ORG_GEN2, "expected_version_julia_org_gen2.json"],
    [ORG_DID, ORG_CALLS, ORG_GEN3, "expected_version_julia_org_gen3.json"],
  ];
  for (const [did, calls, versionId, expected] of cases) {
    it(`resolves ${versionId.slice(0, 12)}… byte-equivalently`, async () => {
      const result = await resolve(
        did,
        { client: fixtureClient(calls) },
        { versionId },
      );
      expect(JSON.stringify(result, null, 1)).toBe(readFixture(expected));
    });
  }
});

describe("every generation is verified against its own coin", () => {
  for (const versionId of [ORG_GEN1, ORG_GEN2, ORG_GEN3, ORG_GEN4]) {
    it(`serves ${versionId.slice(0, 12)}… only under its own commitment`, async () => {
      const result = await resolve(
        ORG_DID,
        { client: fixtureClient(ORG_CALLS) },
        { versionId },
      );
      expect(result.didResolutionMetadata["did:julia:stateVerified"]).toBe(
        true,
      );
      expect(result.didDocumentMetadata.versionId).toBe(versionId);
      expect(result.didDocument?.id).toBe(ORG_DID);
    });
  }
});

describe("version metadata places the document in the DID's history", () => {
  it("reports what replaced a superseded version", async () => {
    const { didDocumentMetadata: meta } = await resolve(
      ORG_DID,
      { client: fixtureClient(ORG_CALLS) },
      { versionId: ORG_GEN2 },
    );
    expect(meta.nextVersionId).toBe(ORG_GEN3);
    expect(meta.nextUpdate).toBe("2026-07-30T16:11:07Z");
    expect(meta.created).toBe("2026-07-30T15:23:35Z");
  });

  it("gives the current version no successor", async () => {
    const { didDocumentMetadata: meta } = await resolve(
      ORG_DID,
      { client: fixtureClient(ORG_CALLS) },
      { versionId: ORG_GEN4 },
    );
    expect(meta.versionId).toBe(ORG_GEN4);
    expect(meta).not.toHaveProperty("nextVersionId");
    expect(meta).not.toHaveProperty("nextUpdate");
  });

  it("agrees with plain resolution about the current version", async () => {
    const versioned = await resolve(
      ORG_DID,
      { client: fixtureClient(ORG_CALLS) },
      { versionId: ORG_GEN4 },
    );
    const current = await resolve(ORG_DID, {
      client: fixtureClient(ORG_CALLS),
    });
    expect(versioned.didDocument).toEqual(current.didDocument);
    expect(versioned.didResolutionMetadata).toEqual(
      current.didResolutionMetadata,
    );
    expect(versioned.didDocumentMetadata).toEqual({
      ...current.didDocumentMetadata,
      created: "2026-07-30T15:23:35Z",
    });
  });
});

describe("resolution by version time", () => {
  it("selects the version current at that moment", async () => {
    const result = await resolve(
      ORG_DID,
      { client: fixtureClient(ORG_CALLS) },
      { versionTime: "2026-08-01T00:00:00Z" },
    );
    expect(JSON.stringify(result, null, 1)).toBe(
      readFixture("expected_version_julia_org_gen3.json"),
    );
  });

  it("answers with the current version after the last update", async () => {
    const result = await resolve(
      ORG_DID,
      { client: fixtureClient(ORG_CALLS) },
      { versionTime: "2026-09-01T00:00:00Z" },
    );
    expect(JSON.stringify(result, null, 1)).toBe(
      readFixture("expected_version_julia_org_current.json"),
    );
  });

  it("resolves a tie to the later generation of the same block", async () => {
    const { didDocumentMetadata: meta } = await resolve(
      ORG_DID,
      { client: fixtureClient(ORG_CALLS) },
      { versionTime: "2026-07-30T15:23:35Z" },
    );
    expect(meta.versionId).toBe(ORG_GEN2);
  });

  it("accepts an explicit offset", async () => {
    const { didDocumentMetadata: meta } = await resolve(
      ORG_DID,
      { client: fixtureClient(ORG_CALLS) },
      { versionTime: "2026-07-31T20:00:00-04:00" },
    );
    expect(meta.versionId).toBe(ORG_GEN3);
  });

  it("reports notFound before the DID existed", async () => {
    const { didResolutionMetadata: meta } = await resolve(
      ORG_DID,
      { client: fixtureClient(ORG_CALLS) },
      { versionTime: "2026-05-01T00:00:00Z" },
    );
    expect(meta.error).toBe("notFound");
    expect(meta.errorMessage).toContain(
      "first version was confirmed at 2026-07-30T15:23:35Z",
    );
  });
});

describe("version options that cannot be honoured are refused", () => {
  it("reports notFound for a version ID this DID never had", async () => {
    const { didResolutionMetadata: meta } = await resolve(
      ORG_DID,
      { client: fixtureClient(ORG_CALLS) },
      { versionId: `0x${"11".repeat(32)}` },
    );
    expect(meta.error).toBe("notFound");
  });

  for (const versionId of ["", "0x", "abcd", `0x${"zz".repeat(32)}`]) {
    it(`rejects the malformed version ID '${versionId}'`, async () => {
      const { didResolutionMetadata: meta } = await resolve(
        ORG_DID,
        { client: fixtureClient(ORG_CALLS) },
        { versionId },
      );
      expect(meta.error).toBe("invalidDidUrl");
    });
  }

  // Kept identical, case for case, to REFUSED_TIMES in the Python suite: the
  // two resolvers must agree about which requests are even valid. Date.parse
  // normalizes rather than rejects — 2026-02-30 becomes March 2nd, hour 24
  // becomes the next day — so answering with the version current on the
  // normalized date would answer a different question than the caller asked.
  for (const versionTime of [
    "yesterday",
    "",
    "2026-08-01", // date only, no time
    "2026-08-01T00:00:00", // no UTC designator or offset
    "2026-13-01T00:00:00Z", // month 13
    "2026-00-10T00:00:00Z", // month 0
    "2026-01-32T00:00:00Z", // day 32
    "2026-01-00T00:00:00Z", // day 0
    "2026-02-30T00:00:00Z", // February has no 30th
    "2026-04-31T00:00:00Z", // April has no 31st
    "2026-02-29T00:00:00Z", // 2026 is not a leap year
    "2100-02-29T00:00:00Z", // nor is 2100 — divisible by 100, not by 400
    "2026-01-01T25:00:00Z", // hour 25
    "2026-01-01T23:60:00Z", // minute 60
    "2026-01-01T23:59:60Z", // leap second
    "2026-08-01T24:00:01Z", // hour 24 is the end-of-day form only
    "2026-08-01T24:30:00Z",
    "2026-08-01T24:00:00.5Z", // a non-zero fraction is not end-of-day
    "2026-01-01T00:00:00+14:01", // beyond XML Schema's ±14:00
    "2026-01-01T00:00:00+23:59",
    "2026-01-01T00:00:00-14:30",
    "2026-01-01T00:00:00+25:00", // impossible offset
    "2026-01-01T00:00:00+00:60", // impossible offset minutes
    "2026-01-01T00:00:00-99:99",
    "0000-01-01T00:00:00Z", // XML Schema's 1 BCE, outside 0001..9999
    "9999-12-31T24:00:00Z", // end of day here names midnight of year 10000
  ]) {
    it(`rejects the malformed version time '${versionTime}'`, async () => {
      const { didResolutionMetadata: meta } = await resolve(
        ORG_DID,
        { client: fixtureClient(ORG_CALLS) },
        { versionTime },
      );
      expect(meta.error).toBe("invalidDidUrl");
    });
  }

  for (const versionTime of ["2028-02-29T00:00:00Z", "2000-02-29T00:00:00Z"]) {
    it(`accepts the real leap day '${versionTime}'`, async () => {
      const { didResolutionMetadata: meta } = await resolve(
        ORG_DID,
        { client: fixtureClient(ORG_CALLS) },
        { versionTime },
      );
      expect(meta.error).not.toBe("invalidDidUrl");
    });
  }

  it("reads an offset time as the same instant as its UTC equivalent", async () => {
    const versions = [];
    for (const versionTime of [
      "2026-08-01T00:00:00Z",
      "2026-07-31T20:00:00-04:00",
    ]) {
      const result = await resolve(
        ORG_DID,
        { client: fixtureClient(ORG_CALLS) },
        { versionTime },
      );
      versions.push(result.didDocumentMetadata.versionId);
    }
    expect(versions[0]).toBe(versions[1]);
  });

  for (const versionTime of [
    "2026-01-01T00:00:00+14:00",
    "2026-01-01T00:00:00-14:00",
    "2026-01-01T00:00:00+13:59",
  ]) {
    it(`accepts the in-range offset '${versionTime}'`, async () => {
      const { didResolutionMetadata: meta } = await resolve(
        ORG_DID,
        { client: fixtureClient(ORG_CALLS) },
        { versionTime },
      );
      expect(meta.error).not.toBe("invalidDidUrl");
    });
  }

  it("reads 24:00:00 as the following midnight", async () => {
    // XML Schema's end-of-day form (§3.3.8, endOfDayFrag). It names one
    // unambiguous instant, so honouring it answers the question asked — unlike
    // a date that does not exist, which has no instant to name.
    const endOfDay = await resolve(
      ORG_DID,
      { client: fixtureClient(ORG_CALLS) },
      { versionTime: "2026-08-01T24:00:00Z" },
    );
    const nextMidnight = await resolve(
      ORG_DID,
      { client: fixtureClient(ORG_CALLS) },
      { versionTime: "2026-08-02T00:00:00Z" },
    );
    expect(endOfDay).toEqual(nextMidnight);
  });

  it("truncates sub-second precision rather than rejecting it", async () => {
    const withFraction = await resolve(
      ORG_DID,
      { client: fixtureClient(ORG_CALLS) },
      { versionTime: "2026-08-01T00:00:00.500Z" },
    );
    const without = await resolve(
      ORG_DID,
      { client: fixtureClient(ORG_CALLS) },
      { versionTime: "2026-08-01T00:00:00Z" },
    );
    expect(withFraction).toEqual(without);
  });

  it("refuses versionId and versionTime together", async () => {
    const { didResolutionMetadata: meta } = await resolve(
      ORG_DID,
      { client: fixtureClient(ORG_CALLS) },
      { versionId: ORG_GEN2, versionTime: "2026-08-01T00:00:00Z" },
    );
    expect(meta.error).toBe("unsupportedResolutionOption");
    expect(meta.errorMessage).toContain("mutually exclusive");
  });

  it("rejects a malformed DID before any version option", async () => {
    const { didResolutionMetadata: meta } = await resolve(
      "did:julia:not-base58!",
      { client: fixtureClient(ORG_CALLS) },
      { versionId: "nonsense" },
    );
    expect(meta.error).toBe("invalidDid");
  });
});

describe("the revealed-state route is self-checking", () => {
  it("refuses a spend offered against any other coin", async () => {
    // Generations 2, 3 and 4 of this DID share a puzzle hash — the singleton
    // was re-spent without changing state — so the substituted commitment here
    // is one no generation holds.
    const client = fixtureClient(ORG_CALLS);
    const launcherId = parseDid(ORG_DID);
    const history = await traceHistory(client, launcherId);
    const generation = history.generations[1];
    const spend = await client.getPuzzleAndSolution(
      coinId(generation.coin),
      generation.spentBlockIndex,
    );
    const other = Uint8Array.from(generation.coin.puzzleHash);
    other[0] ^= 0xff;
    expect(() => revealedVerifiedState(spend, other, launcherId)).toThrow(
      StateError,
    );
  });

  it("refuses state that belongs to another DID", async () => {
    const client = fixtureClient(ORG_CALLS);
    const history = await traceHistory(client, parseDid(ORG_DID));
    const generation = history.generations[1];
    const spend = await client.getPuzzleAndSolution(
      coinId(generation.coin),
      generation.spentBlockIndex,
    );
    expect(() =>
      revealedVerifiedState(
        spend,
        generation.coin.puzzleHash,
        new Uint8Array(32),
      ),
    ).toThrow(StateError);
  });

  it("walks every generation in order", async () => {
    const history = await traceHistory(
      fixtureClient(ORG_CALLS),
      parseDid(ORG_DID),
    );
    expect(
      history.generations.map((g) => `0x${toHex(coinId(g.coin))}`),
    ).toEqual([ORG_GEN1, ORG_GEN2, ORG_GEN3, ORG_GEN4]);
    expect(history.generations.at(-1)?.spent).toBe(false);
    expect(history.generations.slice(0, -1).every((g) => g.spent)).toBe(true);
  });
});

/**
 * The personal alias was rekeyed on 2026-09-02. Generation 3 carries a
 * different authentication root — and a different singleton puzzle hash — from
 * the two before it, which makes it the first mainnet state *change* this
 * package has ever been tested against. Every other recording is a spend that
 * left state untouched, so ADR 0001's transition machinery had only ever been
 * proved against vectors captured from the compiled Chialisp. These cases
 * guard it against the chain itself.
 */
describe("a real rekey, derived and proved against the chain", () => {
  it("identifies the operation rather than falling back to a search", async () => {
    const client = fixtureClient(ALIAS_CALLS);
    const launcherId = parseDid(ALIAS_DID);
    const history = await traceHistory(client, launcherId);
    expect(history.generations).toHaveLength(3);

    const current = history.generations[2];
    const parent = history.generations[1];
    expect(current.spent).toBe(false);
    // The rekey is visible in the coins themselves: the child commits to a
    // different state than its parent did.
    expect(toHex(parent.coin.puzzleHash)).not.toBe(
      toHex(current.coin.puzzleHash),
    );

    const spend = await client.getPuzzleAndSolution(
      coinId(parent.coin),
      parent.spentBlockIndex,
    );
    const derived = deriveVerifiedState(
      spend,
      parent.coin.puzzleHash,
      current.coin.puzzleHash,
      launcherId,
    );
    expect(derived.operation).toBe("rekey");
    // "identified" means the child's puzzle hash named the transition outright.
    // A fall back to "exhaustive" would still be correct, but it would mean the
    // identification table had stopped matching the chain.
    expect(derived.source).toBe("identified");

    // The spend reveals the OLD state verbatim; the new one is derived, and is
    // accepted only because it reproduces generation 3's own puzzle hash.
    const revealed = revealedVerifiedState(
      spend,
      parent.coin.puzzleHash,
      launcherId,
    );
    expect(verifyState(revealed.state, current.coin.puzzleHash)).toBe(false);
    expect(verifyState(derived.state, current.coin.puzzleHash)).toBe(true);
    expect(toHex(derived.state.authentication!.merkleRoot)).not.toBe(
      toHex(revealed.state.authentication!.merkleRoot),
    );
  });

  it("changes the authentication root between the versions", async () => {
    const before = await resolve(
      ALIAS_DID,
      { client: fixtureClient(ALIAS_CALLS) },
      { versionId: ALIAS_GEN2 },
    );
    const after = await resolve(
      ALIAS_DID,
      { client: fixtureClient(ALIAS_CALLS) },
      { versionId: ALIAS_GEN3 },
    );
    const root = (r: typeof before) =>
      (r.didDocument?.juliaAuthentication as { merkleRoot: string }).merkleRoot;
    expect(root(before)).not.toBe(root(after));
    for (const result of [before, after]) {
      expect(result.didResolutionMetadata["did:julia:stateVerified"]).toBe(
        true,
      );
    }
  });

  it("keeps a retired key listed for the versions it governed", async () => {
    const governed = await resolve(
      ALIAS_DID,
      { client: fixtureClient(ALIAS_CALLS) },
      { versionId: ALIAS_GEN2 },
    );
    const current = await resolve(ALIAS_DID, {
      client: fixtureClient(ALIAS_CALLS),
    });
    expect(governed.didDocument?.verificationMethod).toHaveLength(1);
    expect(current.didDocument).not.toHaveProperty("verificationMethod");
  });

  it("chains generation 2 forward to the rekey", async () => {
    const { didDocumentMetadata: meta } = await resolve(
      ALIAS_DID,
      { client: fixtureClient(ALIAS_CALLS) },
      { versionId: ALIAS_GEN2 },
    );
    expect(meta.nextVersionId).toBe(ALIAS_GEN3);
    expect(meta.nextUpdate).toBe("2026-09-02T11:34:09Z");
  });
});

/**
 * Kept identical to VERSION_TIME_EPOCHS in the Python suite. Resolution outcome
 * alone cannot police this: every year before the DID existed answers
 * `notFound` whether it was read as 0001 or as 1901, so the arithmetic has to
 * be asserted where it can be seen. `Date.UTC` applies a legacy 1900 offset to
 * years 0..99 — exactly the kind of silent substitution that stays invisible
 * through the public API, which is why this resolver does not use it.
 */
describe("the instant a version time denotes", () => {
  const cases: Array<[string, number]> = [
    ["0001-01-01T00:00:00Z", -62135596800],
    ["0099-01-01T00:00:00Z", -59042995200],
    ["1901-01-01T00:00:00Z", -2177452800],
    ["1970-01-01T00:00:00Z", 0],
    ["2026-09-02T11:34:09Z", 1788348849],
    ["2026-08-01T24:00:00Z", 1785628800],
    ["2026-08-02T00:00:00Z", 1785628800],
    ["2026-01-01T00:00:00+14:00", 1767175200],
    ["2026-01-01T00:00:00-14:00", 1767276000],
    ["9999-12-31T23:59:59Z", 253402300799],
  ];
  for (const [versionTime, epoch] of cases) {
    it(`reads ${versionTime} as ${epoch}`, () => {
      expect(parseVersionTime(versionTime)).toBe(epoch);
    });
  }
});
