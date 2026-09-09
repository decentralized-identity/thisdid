import { afterEach, describe, expect, it, vi } from "vitest";
import {
  COMMAND,
  USAGE,
  main,
  optionsFromEnv,
  parseArgs,
  type CliIo,
} from "../cli.js";
import { EMPE_OK_RESPONSE, EMPE_TESTNET_DID } from "./fixture.js";

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

afterEach(() => vi.restoreAllMocks());

// Every case here is offline: usage, configuration and identifier syntax are
// decided before an RPC endpoint would be contacted, and the one resolution
// that reaches the transport runs against a stubbed fetch.
describe(COMMAND, () => {
  it("prints usage and exits 0 on --help", async () => {
    const c = capture();
    expect(await main(["--help"], {}, c.io)).toBe(0);
    expect(c.out.join("")).toBe(USAGE);
    expect(c.err).toEqual([]);
  });

  it("exits 2 with usage on stderr when no DID is given", async () => {
    const c = capture();
    expect(await main([], {}, c.io)).toBe(2);
    expect(c.err.join("")).toContain("missing <did>");
    expect(c.err.join("")).toContain("Usage:");
    expect(c.out).toEqual([]);
  });

  it("rejects unknown options, stray arguments and valueless flags", () => {
    expect(parseArgs(["did:empe:x", "--nope"]).error).toBe(
      "unknown option --nope",
    );
    expect(parseArgs(["did:empe:x", "extra"]).error).toBe(
      "unexpected argument extra",
    );
    expect(parseArgs(["did:empe:x", "--version-id"]).error).toBe(
      "--version-id requires a value",
    );
    expect(parseArgs(["did:empe:x", "--version-time", "--compact"]).error).toBe(
      "--version-time requires a value",
    );
  });

  it("passes resolution options and --compact through", () => {
    const parsed = parseArgs([
      "--version-id",
      "3",
      "did:empe:x",
      "--version-time",
      "2026-01-01T00:00:00Z",
      "--compact",
    ]);
    expect(parsed.error).toBeUndefined();
    expect(parsed.did).toBe("did:empe:x");
    expect(parsed.compact).toBe(true);
    expect(parsed.resolutionOptions).toEqual({
      versionId: "3",
      versionTime: "2026-01-01T00:00:00Z",
    });
  });

  it("reports a malformed DID as invalidDid JSON with exit 1", async () => {
    const c = capture();
    expect(await main(["did:empe:"], {}, c.io)).toBe(1);
    const result = JSON.parse(c.out.join(""));
    expect(result.didResolutionMetadata.error).toBe("invalidDid");
    expect(result.didDocument).toBeNull();
  });

  it("reports a foreign method as unsupportedDidMethod with exit 1", async () => {
    const c = capture();
    expect(await main(["did:example:123", "--compact"], {}, c.io)).toBe(1);
    expect(c.out.join("")).not.toContain("\n  ");
    expect(JSON.parse(c.out.join("")).didResolutionMetadata.error).toBe(
      "unsupportedDidMethod",
    );
  });

  it("reports an unconfigured mainnet DID as notConfigured with exit 1", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    const c = capture();
    expect(await main(["did:empe:" + "a".repeat(40)], {}, c.io)).toBe(1);
    const result = JSON.parse(c.out.join(""));
    expect(result.didResolutionMetadata.error).toBe("notConfigured");
    expect(result.didDocument).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("maps the documented environment variables onto resolver options", () => {
    expect(optionsFromEnv({})).toEqual({});
    // A single endpoint is passed as a string, exactly as the Worker does.
    expect(
      optionsFromEnv({
        EMPE_RPC_MAINNET_URL: " https://rpc.empe.io ",
        UNRELATED: "ignored",
      }),
    ).toEqual({ rpcUrls: { mainnet: "https://rpc.empe.io" } });
    // A comma-separated list becomes the ordered fallback array.
    expect(
      optionsFromEnv({
        EMPE_RPC_TESTNET_URL: "https://first.example, https://second.example,",
        EMPE_TIMEOUT_MS: "2500",
      }),
    ).toEqual({
      rpcUrls: {
        testnet: ["https://first.example", "https://second.example"],
      },
      timeoutMs: 2500,
    });
    // Blank variables are the same as unset ones.
    expect(
      optionsFromEnv({ EMPE_RPC_MAINNET_URL: " , ", EMPE_TIMEOUT_MS: "" }),
    ).toEqual({});
  });

  it("exits 2 on a malformed environment value without resolving", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    for (const env of [{ EMPE_TIMEOUT_MS: "-1" }, { EMPE_TIMEOUT_MS: "1.5" }]) {
      const c = capture();
      expect(await main([EMPE_TESTNET_DID], env, c.io)).toBe(2);
      expect(c.err.join("")).toContain(Object.keys(env)[0]);
      expect(c.out).toEqual([]);
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it("resolves through the configured endpoint and exits 0", async () => {
    const queried: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      queried.push(String(input));
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: -1,
          result: { response: EMPE_OK_RESPONSE },
        }),
        { headers: { "content-type": "application/json" } },
      );
    });
    const c = capture();
    expect(
      await main(
        [EMPE_TESTNET_DID, "--compact"],
        { EMPE_RPC_TESTNET_URL: "https://rpc.test/" },
        c.io,
      ),
    ).toBe(0);
    expect(c.err).toEqual([]);
    expect(queried).toHaveLength(1);
    expect(queried[0]).toMatch(/^https:\/\/rpc\.test\/abci_query\?/);
    const result = JSON.parse(c.out.join(""));
    expect(result.didResolutionMetadata.error).toBeUndefined();
    expect(result.didDocument.id).toBe(EMPE_TESTNET_DID);
    expect(result.didDocumentMetadata.network).toBe("testnet");
  });
});
