import { describe, expect, it } from "vitest";
import { resolve } from "../resolver.js";
import { CANARIES, loadFixture } from "./fixtures.js";
import { deserialize, fromHex, serialize, toHex } from "../clvm.js";

interface Call {
  method: string;
  payload: Record<string, unknown>;
  response: Record<string, unknown>;
}

/** Replay the recorded mainnet traffic for the alias DID, with one edit. */
function tampered(edit: (calls: Call[]) => void) {
  const calls = loadFixture<Call[]>(CANARIES[0].calls);
  const copy = JSON.parse(JSON.stringify(calls)) as Call[];
  edit(copy);
  return async (method: string, payload: Record<string, unknown>) => {
    if (method === "get_singleton_info") {
      return { success: false, error: "unsupported" };
    }
    const wanted = JSON.stringify(payload);
    for (const call of copy) {
      if (call.method === method && JSON.stringify(call.payload) === wanted) {
        return call.response;
      }
    }
    throw new Error(`unrecorded ${method}`);
  };
}

const singletonSpend = (calls: Call[]) =>
  calls.find((c) => c.method === "get_puzzle_and_solution")!.response
    .coin_solution as { solution: string; puzzle_reveal: string };

/**
 * A coin id IS the hash of the coin's own fields, and a DID's identifier IS a
 * launcher coin id — so several links in the lineage can be checked rather
 * than trusted. These tests pin each check. What they do NOT establish is that
 * resolution is trustless; see "the trust boundary" at the bottom.
 */
describe("RPC answers are checked against the questions asked", () => {
  it("refuses children returned for a parent that was not requested", async () => {
    const result = await resolve(CANARIES[0].did, {
      transport: tampered((calls) => {
        for (const call of calls) {
          const records = call.response.coin_records as
            Array<{ coin: { parent_coin_info: string } }> | undefined;
          for (const record of records ?? []) {
            record.coin.parent_coin_info = `0x${"cc".repeat(32)}`;
          }
        }
      }),
    });
    expect(result.didResolutionMetadata.error).toBe("internalError");
    expect(result.didResolutionMetadata.errorMessage).toMatch(
      /unrequested parent/,
    );
  });

  it("refuses a spend of a coin other than the one requested", async () => {
    const result = await resolve(CANARIES[0].did, {
      transport: tampered((calls) => {
        const spend = calls.find(
          (c) => c.method === "get_puzzle_and_solution",
        )!;
        (
          spend.response.coin_solution as { coin: { amount: number } }
        ).coin.amount = 3;
      }),
    });
    expect(result.didResolutionMetadata.error).toBe("internalError");
    expect(result.didResolutionMetadata.errorMessage).toMatch(
      /spend of a coin that is not/,
    );
  });
});

describe("a spend must belong to the DID that is being resolved", () => {
  it("refuses a solution whose state contradicts the puzzle's CURRIED-ARGS-HASH", async () => {
    const result = await resolve(CANARIES[0].did, {
      transport: tampered((calls) => {
        const spend = singletonSpend(calls);
        const solution = deserialize(fromHex(spend.solution)) as never;
        // Replace the revealed pre-spend state with a different tree.
        const outer = solution as unknown as [
          unknown,
          [unknown, [[unknown, unknown], unknown]],
        ];
        (outer[1][1] as unknown as [[unknown, unknown], unknown])[0][0] =
          fromHex("00".repeat(32)) as never;
        spend.solution = `0x${toHex(serialize(solution))}`;
      }),
    });
    expect(result.didResolutionMetadata.error).toBe("internalError");
    expect(result.didResolutionMetadata.errorMessage).toMatch(
      /CURRIED-ARGS-HASH/,
    );
  });

  it("refuses a spend whose parent-info does not re-derive this launcher id", async () => {
    const result = await resolve(CANARIES[0].did, {
      transport: tampered((calls) => {
        const spend = singletonSpend(calls);
        const solution = deserialize(fromHex(spend.solution)) as never;
        // parent-info = (parent-type prelauncher-parent genesis-key-hash amount)
        const inner = (
          solution as unknown as [
            unknown,
            [unknown, [[unknown, [unknown, unknown]], unknown]],
          ]
        )[1][1][0][1][0] as [unknown, [Uint8Array, unknown]];
        inner[1][0] = fromHex("dd".repeat(32));
        spend.solution = `0x${toHex(serialize(solution))}`;
      }),
    });
    expect(result.didResolutionMetadata.error).toBe("internalError");
    expect(result.didResolutionMetadata.errorMessage).toMatch(
      /re-derive this DID's launcher ID/,
    );
  });
});

/**
 * THE TRUST BOUNDARY — deliberately asserted, so that neither the code nor the
 * README can quietly drift away from it.
 *
 * A Chia coin commits to its own state, but nothing in a bare RPC response
 * proves that a coin was ever created on chain. An endpoint that fabricates a
 * COHERENT lineage forward from the real launcher — real launcher coin, real
 * prelauncher, a genuine `parent-info`, a real singleton puzzle wrapped around
 * a state of its choosing — is not detected by this resolver, and would need
 * block-level proofs to detect. The checks above raise the cost of forgery and
 * eliminate the incoherent cases; they do not make the endpoint trustless.
 *
 * The full forging harness lives in the pull-request record rather than here:
 * what matters for the suite is that the README claims exactly this much and
 * no more.
 */
describe("the trust boundary is documented, not defended", () => {
  it("states the endpoint is trusted for current state", () => {
    const readme = loadReadme();
    // Line wrapping must not weaken the assertion.
    const prose = readme.replace(/\s+/g, " ");
    expect(prose).toMatch(/trusted for the DID's current state/i);
    expect(prose).not.toMatch(/cannot forge|never forge|withhold but/i);
  });
});

function loadReadme(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readFileSync } = require("node:fs") as typeof import("node:fs");
  const { dirname, join } = require("node:path") as typeof import("node:path");
  const { fileURLToPath } = require("node:url") as typeof import("node:url");
  return readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "..", "..", "README.md"),
    "utf8",
  );
}
