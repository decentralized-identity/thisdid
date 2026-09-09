import { describe, expect, it } from "vitest";
import { Resolver } from "did-resolver";
import { getResolver } from "../resolver.js";

const ADDRESS = "0xb9c5714089478a327f09197987f16f9e5d936e8a";
const DID = `did:ethr:${ADDRESS}`;

/**
 * A minimal ethers-compatible read-only provider: every registry read answers
 * "no changes recorded", which is the on-chain state of an identifier that
 * has never been touched, so the core derives the default document offline.
 */
const NO_CHANGES = `0x${"0".repeat(64)}`;
const quietProvider: Record<string, unknown> = {
  async call() {
    return NO_CHANGES;
  },
  async getNetwork() {
    return { chainId: 1n, name: "mainnet" };
  },
  async getLogs() {
    return [];
  },
  async getBlockNumber() {
    return 1;
  },
  async getBlock() {
    return { number: 1, timestamp: 1_700_000_000 };
  },
};
// ethers runners point at their provider through `provider`; a Provider is
// its own runner.
quietProvider.provider = quietProvider;

describe("did:ethr DIF wrapper", () => {
  it("registers exactly the ethr method", () => {
    expect(
      Object.keys(
        getResolver({
          networks: [
            { name: "mainnet", chainId: 1, rpcUrl: "https://rpc.test" },
          ],
        }),
      ),
    ).toEqual(["ethr"]);
  });

  it("derives the default document for an untouched identifier offline", async () => {
    const resolver = new Resolver(
      getResolver({
        networks: [
          { name: "mainnet", chainId: 1, provider: quietProvider as never },
        ],
        cache: null,
      }),
    );
    const result = await resolver.resolve(DID);
    expect(result.didResolutionMetadata.error).toBeUndefined();
    expect(result.didDocument?.id).toBe(DID);
    const controller = result.didDocument?.verificationMethod?.find((vm) =>
      vm.id.endsWith("#controller"),
    );
    // The core emits the EIP-55 checksummed form of the address.
    expect(controller?.blockchainAccountId?.toLowerCase()).toBe(
      `eip155:1:${ADDRESS}`,
    );
  });

  it("fails closed for a network that has no endpoint", async () => {
    // The core reports an unconfigured network as an error naming it (its
    // exact code is the core's business); what matters is no document.
    const resolver = new Resolver(
      getResolver({
        networks: [
          { name: "mainnet", chainId: 1, provider: quietProvider as never },
        ],
        cache: null,
      }),
    );
    const result = await resolver.resolve(`did:ethr:sepolia:${ADDRESS}`);
    expect(result.didDocument).toBeNull();
    expect(typeof result.didResolutionMetadata.error).toBe("string");
    expect(result.didResolutionMetadata.message).toContain("sepolia");
  });
});

// Live check — opt in with ETHR_LIVE=1 plus a configured endpoint
// (`ETH_RPC_MAINNET_URL=… pnpm run test:live`).
describe.skipIf(!process.env.ETHR_LIVE || !process.env.ETH_RPC_MAINNET_URL)(
  "did:ethr live",
  () => {
    it("resolves the ThisDID canary on mainnet", async () => {
      const resolver = new Resolver(
        getResolver({
          networks: [
            {
              name: "mainnet",
              chainId: 1,
              rpcUrl: process.env.ETH_RPC_MAINNET_URL!,
            },
          ],
        }),
      );
      const result = await resolver.resolve(DID);
      expect(result.didResolutionMetadata.error).toBeUndefined();
      expect(result.didDocument?.id).toBe(DID);
    });
  },
);
