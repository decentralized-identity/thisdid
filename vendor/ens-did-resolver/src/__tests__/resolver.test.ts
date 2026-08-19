import { describe, expect, it } from "vitest";
import { getResolver } from "../resolver.js";

const NETWORKS = {
  networks: [{ name: "mainnet", rpcUrl: "https://rpc.test" }],
};

describe("did:ens DIF driver", () => {
  it("exposes the ens registry when configured", () => {
    expect(typeof getResolver(NETWORKS).ens).toBe("function");
  });

  it("fails closed without a configured network", () => {
    expect(() => getResolver({ networks: [] })).toThrow(
      /requires at least one configured network/,
    );
    expect(() =>
      getResolver({ networks: [{ name: "custom", rpcUrl: "https://x" }] }),
    ).toThrow(/requires a chainId/);
  });

  it("rejects malformed names and unknown networks offline", async () => {
    const resolve = (did: string) =>
      getResolver(NETWORKS).ens(did, null as never, null as never, {});
    expect(
      (await resolve("did:ens:no-dot-name")).didResolutionMetadata.error,
    ).toBe("invalidDid");
    expect(
      (await resolve("did:ens:goerli:vitalik.eth")).didResolutionMetadata.error,
    ).toBe("notConfigured");
  });
});
