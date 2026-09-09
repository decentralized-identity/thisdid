import { describe, expect, it } from "vitest";
import {
  COMMAND,
  USAGE,
  main,
  optionsFromEnv,
  parseArgs,
  type CliIo,
} from "../cli.js";

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

const ENV = { ETH_RPC_MAINNET_URL: "https://rpc.test/mainnet" };

// Every case here is offline: malformed and foreign identifiers are rejected
// by did-resolver before the driver would touch the network.
describe(COMMAND, () => {
  it("prints usage and exits 0 on --help", async () => {
    const c = capture();
    expect(await main(["--help"], ENV, c.io)).toBe(0);
    expect(c.out.join("")).toBe(USAGE);
    expect(c.err).toEqual([]);
  });

  it("exits 2 with usage on stderr when no DID is given", async () => {
    const c = capture();
    expect(await main([], ENV, c.io)).toBe(2);
    expect(c.err.join("")).toContain("missing <did>");
    expect(c.err.join("")).toContain("Usage:");
    expect(c.out).toEqual([]);
  });

  it("rejects unknown options, stray arguments and valueless flags", () => {
    expect(parseArgs(["did:ens:x", "--nope"]).error).toBe(
      "unknown option --nope",
    );
    expect(parseArgs(["did:ens:x", "extra"]).error).toBe(
      "unexpected argument extra",
    );
    expect(parseArgs(["did:ens:x", "--version-id"]).error).toBe(
      "--version-id requires a value",
    );
    expect(parseArgs(["did:ens:x", "--version-time", "--compact"]).error).toBe(
      "--version-time requires a value",
    );
  });

  it("passes resolution options and --compact through", () => {
    const parsed = parseArgs([
      "--version-id",
      "3",
      "did:ens:x",
      "--version-time",
      "2026-01-01T00:00:00Z",
      "--compact",
    ]);
    expect(parsed.error).toBeUndefined();
    expect(parsed.did).toBe("did:ens:x");
    expect(parsed.compact).toBe(true);
    expect(parsed.resolutionOptions).toEqual({
      versionId: "3",
      versionTime: "2026-01-01T00:00:00Z",
    });
  });

  it("reports a malformed DID as invalidDid JSON with exit 1", async () => {
    const c = capture();
    expect(await main(["did:ens:"], ENV, c.io)).toBe(1);
    const result = JSON.parse(c.out.join(""));
    expect(result.didResolutionMetadata.error).toBe("invalidDid");
    expect(result.didDocument).toBeNull();
  });

  it("reports a foreign method as unsupportedDidMethod with exit 1", async () => {
    const c = capture();
    expect(await main(["did:example:123", "--compact"], ENV, c.io)).toBe(1);
    expect(c.out.join("")).not.toContain("\n  ");
    expect(JSON.parse(c.out.join("")).didResolutionMetadata.error).toBe(
      "unsupportedDidMethod",
    );
  });

  it("maps the documented environment variables onto resolver options", () => {
    expect(optionsFromEnv({})).toEqual({ networks: [] });
    expect(
      optionsFromEnv({
        ETH_RPC_MAINNET_BASE_URL: "https://eth-mainnet.g.alchemy.com/v2",
        ALCHEMY_API_KEY: "key",
        ENS_TIMEOUT_MS: "3000",
      }),
    ).toEqual({
      networks: [
        { name: "mainnet", rpcUrl: "https://eth-mainnet.g.alchemy.com/v2/key" },
      ],
      timeoutMs: 3000,
    });
    expect(
      optionsFromEnv({
        ETH_RPC_MAINNET_BASE_URL: "https://eth-mainnet.g.alchemy.com/v2/",
        ETH_RPC_MAINNET_URL: " https://rpc.test/legacy ",
      }),
    ).toEqual({
      networks: [{ name: "mainnet", rpcUrl: "https://rpc.test/legacy" }],
    });
  });

  it("exits 2 on a malformed environment value without resolving", async () => {
    for (const env of [{ ENS_TIMEOUT_MS: "soon" }]) {
      const c = capture();
      expect(
        await main(
          ["did:ens:x"],
          { ...{ ETH_RPC_MAINNET_URL: "https://rpc.test/mainnet" }, ...env },
          c.io,
        ),
      ).toBe(2);
      expect(c.err.join("")).toContain(Object.keys(env)[0]);
      expect(c.out).toEqual([]);
    }
  });

  it("exits 2 when no network endpoint is configured", async () => {
    const c = capture();
    expect(await main(["did:ens:x"], {}, c.io)).toBe(2);
    expect(c.err.join("")).toContain("no network configured");
    expect(c.out).toEqual([]);
  });
});
