import { describe, expect, it } from "vitest";
import { resolve } from "../resolver.js";
import {
  CANARIES,
  fixtureClient,
  loadFixture,
  readFixture,
} from "./fixtures.js";

/**
 * The port's correctness proof for resolution: the same recorded mainnet RPC
 * traffic the Python reference suite replays must produce the same resolution
 * result, byte for byte, including key order.
 */
describe("resolution replays the committed mainnet recordings", () => {
  for (const canary of CANARIES) {
    it(`resolves ${canary.did} byte-equivalently to the reference resolver`, async () => {
      const result = await resolve(canary.did, {
        client: fixtureClient(canary.calls),
      });
      // Byte-for-byte against the file the Python reference resolver wrote:
      // `json.dump(indent=1)` and `JSON.stringify(value, null, 1)` agree
      // exactly, so this compares key order and formatting, not just values.
      expect(JSON.stringify(result, null, 1)).toBe(
        readFixture(canary.expected),
      );
    });

    it(`verifies ${canary.did} against the on-chain puzzle hash`, async () => {
      const result = await resolve(canary.did, {
        client: fixtureClient(canary.calls),
      });
      expect(result.didResolutionMetadata["did:julia:stateVerified"]).toBe(
        true,
      );
      expect(result.didResolutionMetadata["did:julia:currentPuzzle"]).toBe(
        true,
      );
      expect(result.didDocument?.id).toBe(canary.did);
    });
  }
});

describe("unsupported resolution options are refused, not ignored", () => {
  for (const option of ["versionId", "versionTime"] as const) {
    it(`refuses ${option} rather than returning current state`, async () => {
      const result = await resolve(
        CANARIES[0].did,
        {
          client: fixtureClient(CANARIES[0].calls),
        },
        { [option]: option === "versionId" ? "0xabc" : "2026-01-01T00:00:00Z" },
      );
      expect(result.didDocument).toBeNull();
      expect(result.didResolutionMetadata.error).toBe(
        "unsupportedResolutionOption",
      );
      expect(result.didResolutionMetadata.errorMessage).toContain(option);
    });
  }

  it("still resolves normally when no historical option is given", async () => {
    const result = await resolve(
      CANARIES[0].did,
      { client: fixtureClient(CANARIES[0].calls) },
      { accept: "application/did+ld+json" },
    );
    expect(result.didDocument?.id).toBe(CANARIES[0].did);
  });
});

describe("resolution failures are honest", () => {
  it("reports invalidDid without touching the network", async () => {
    const result = await resolve("did:julia:notbase58!", {
      transport: async () => {
        throw new Error("the network must not be consulted");
      },
    });
    expect(result.didResolutionMetadata.error).toBe("invalidDid");
    expect(result.didDocument).toBeNull();
  });

  it("reports notFound when a stock node answers with no coin record", async () => {
    // Stock Chia full node shape: the node answered, and the coin is absent.
    const result = await resolve(CANARIES[0].did, {
      transport: async () => ({ success: true, coin_record: null }),
    });
    expect(result.didResolutionMetadata.error).toBe("notFound");
  });

  it("reports notFound when the node itself reports the coin absent", async () => {
    // Coinset gateway shape: `success: false` with a structured absence code.
    const result = await resolve(CANARIES[0].did, {
      transport: async () => ({
        success: false,
        error: "Coin record 0xab… not found",
        structuredError: { code: "COIN_RECORD_NOT_FOUND" },
      }),
    });
    expect(result.didResolutionMetadata.error).toBe("notFound");
  });

  it("reports internalError — never notFound — when the node is unreachable", async () => {
    // An outage says nothing about whether the DID exists. Reporting it as
    // notFound would turn downtime into an authoritative, cacheable claim of
    // absence; internalError is transport-class to callers such as ThisDID.
    const result = await resolve(CANARIES[0].did, {
      transport: async () => {
        throw new Error("connection refused");
      },
    });
    expect(result.didResolutionMetadata.error).toBe("internalError");
    expect(result.didDocument).toBeNull();
  });

  it("reports internalError when the node fails for a reason that is not absence", async () => {
    const result = await resolve(CANARIES[0].did, {
      transport: async () => ({
        success: false,
        error: "database is starting up",
        structuredError: { code: "NOT_READY" },
      }),
    });
    expect(result.didResolutionMetadata.error).toBe("internalError");
  });

  it("reports notFound when the coin is not a singleton launcher", async () => {
    const result = await resolve(CANARIES[0].did, {
      transport: async () => ({
        success: true,
        coin_record: {
          coin: {
            parent_coin_info: `0x${"11".repeat(32)}`,
            puzzle_hash: `0x${"22".repeat(32)}`,
            amount: 1,
          },
          confirmed_block_index: 1,
          spent_block_index: 2,
          spent: true,
          timestamp: 1,
        },
      }),
    });
    expect(result.didResolutionMetadata.error).toBe("notFound");
    expect(result.didResolutionMetadata.errorMessage).toMatch(/launcher/);
  });

  it("fails closed when the derived state cannot be verified", async () => {
    const calls = loadFixture<
      Array<{
        method: string;
        payload: Record<string, unknown>;
        response: Record<string, unknown>;
      }>
    >(CANARIES[0].calls);
    const tampered = JSON.parse(JSON.stringify(calls)) as typeof calls;
    // Repoint the unspent coin at a puzzle hash no derivable state produces.
    for (const call of tampered) {
      const records = (
        call.response as {
          coin_records?: Array<{
            coin: { puzzle_hash: string };
            spent: boolean;
          }>;
        }
      ).coin_records;
      if (!records) continue;
      for (const record of records) {
        if (!record.spent) record.coin.puzzle_hash = `0x${"ab".repeat(32)}`;
      }
    }
    const result = await resolve(CANARIES[0].did, {
      transport: async (method, payload) => {
        const wanted = JSON.stringify(payload);
        for (const call of tampered) {
          if (
            call.method === method &&
            JSON.stringify(call.payload) === wanted
          ) {
            return call.response;
          }
        }
        throw new Error(`unrecorded ${method}`);
      },
    });
    expect(result.didDocument).toBeNull();
    expect(result.didResolutionMetadata.error).toBe("unverifiableState");
  });
});
