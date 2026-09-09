import { describe, expect, it } from "vitest";
import { COMMAND, USAGE, main, parseArgs, type CliIo } from "../cli.js";
import { networksFromEnv } from "../resolver.js";

function capture(): { out: string[]; err: string[]; io: CliIo } {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    io: {
      stdout: (text) => {
        out.push(text);
      },
      stderr: (text) => {
        err.push(text);
      },
    },
  };
}

const MAINNET = { ETH_RPC_MAINNET_URL: "https://rpc.test/mainnet" };

// Every case here is offline: usage, configuration and identifier syntax are
// all decided before an RPC endpoint would be contacted.
describe(COMMAND, () => {
  it("prints usage and exits 0 on --help", async () => {
    const c = capture();
    expect(await main(["--help"], {}, c.io)).toBe(0);
    expect(c.out.join("")).toBe(USAGE);
    expect(c.err).toEqual([]);
  });

  it("exits 2 with usage on stderr when no DID is given", async () => {
    const c = capture();
    expect(await main([], MAINNET, c.io)).toBe(2);
    expect(c.err.join("")).toContain("missing <did>");
    expect(c.err.join("")).toContain("Usage:");
    expect(c.out).toEqual([]);
  });

  it("rejects unknown options, stray arguments and valueless flags", () => {
    expect(parseArgs(["did:ethr:x", "--nope"]).error).toBe(
      "unknown option --nope",
    );
    expect(parseArgs(["did:ethr:x", "extra"]).error).toBe(
      "unexpected argument extra",
    );
    expect(parseArgs(["did:ethr:x", "--version-time"]).error).toBe(
      "--version-time requires a value",
    );
  });

  it("exits 2 when no network endpoint is configured", async () => {
    const c = capture();
    expect(
      await main(
        ["did:ethr:0xb9c5714089478a327f09197987f16f9e5d936e8a"],
        {},
        c.io,
      ),
    ).toBe(2);
    expect(c.err.join("")).toContain("no network configured");
    expect(c.out).toEqual([]);
  });

  it("maps the ThisDID variable convention onto networks", () => {
    expect(networksFromEnv({})).toEqual([]);
    expect(
      networksFromEnv({
        ETH_RPC_MAINNET_BASE_URL: "https://eth-mainnet.g.alchemy.com/v2",
        ALCHEMY_API_KEY: "key",
        ETH_RPC_SEPOLIA_URL: " https://rpc.test/sepolia ",
      }),
    ).toEqual([
      {
        name: "mainnet",
        chainId: 1,
        rpcUrl: "https://eth-mainnet.g.alchemy.com/v2/key",
      },
      {
        name: "sepolia",
        chainId: 11155111,
        rpcUrl: "https://rpc.test/sepolia",
      },
    ]);
    // A base URL without the key never yields an endpoint (fails closed);
    // the legacy full-URL variable is the fallback.
    expect(
      networksFromEnv({
        ETH_RPC_MAINNET_BASE_URL: "https://eth-mainnet.g.alchemy.com/v2/",
        ETH_RPC_MAINNET_URL: "https://rpc.test/legacy",
      }),
    ).toEqual([
      { name: "mainnet", chainId: 1, rpcUrl: "https://rpc.test/legacy" },
    ]);
  });

  it("reports a malformed DID as invalidDid JSON with exit 1", async () => {
    const c = capture();
    expect(await main(["did:ethr:"], MAINNET, c.io)).toBe(1);
    const result = JSON.parse(c.out.join(""));
    expect(result.didResolutionMetadata.error).toBe("invalidDid");
    expect(result.didDocument).toBeNull();
  });

  it("reports a foreign method as unsupportedDidMethod with exit 1", async () => {
    const c = capture();
    expect(await main(["did:example:123", "--compact"], MAINNET, c.io)).toBe(1);
    expect(c.out.join("")).not.toContain("\n  ");
    expect(JSON.parse(c.out.join("")).didResolutionMetadata.error).toBe(
      "unsupportedDidMethod",
    );
  });
});
