import type { ResolverRegistry } from "did-resolver";
import { getResolver } from "@thisdid/near-did-resolver";
import { createDriverWorker } from "../runtime";

/**
 * did:near through the vendored `@thisdid/near-did-resolver` package
 * (vendor/near-did-resolver) — a fetch-native reimplementation of the
 * KayTrust resolution semantics without the near-api-js/elliptic chain.
 */

interface NearEnv {
  /** NEAR JSON-RPC endpoints. Public endpoints are plain vars; keyed provider URLs belong in secrets. */
  NEAR_RPC_MAINNET_URL?: string;
  NEAR_RPC_TESTNET_URL?: string;
  /** Optional DID registry contract accounts for base58 identifiers. */
  NEAR_REGISTRY_CONTRACT_MAINNET?: string;
  NEAR_REGISTRY_CONTRACT_TESTNET?: string;
}

export default createDriverWorker<NearEnv>({
  method: "near",
  packageName: "@thisdid/near-did-resolver",
  packageVersion: "1.0.0",
  registry: (env) => {
    const networks = [
      ...(env.NEAR_RPC_MAINNET_URL
        ? [
            {
              networkId: "mainnet",
              rpcUrl: env.NEAR_RPC_MAINNET_URL,
              ...(env.NEAR_REGISTRY_CONTRACT_MAINNET
                ? { contractId: env.NEAR_REGISTRY_CONTRACT_MAINNET }
                : {}),
            },
          ]
        : []),
      ...(env.NEAR_RPC_TESTNET_URL
        ? [
            {
              networkId: "testnet",
              rpcUrl: env.NEAR_RPC_TESTNET_URL,
              ...(env.NEAR_REGISTRY_CONTRACT_TESTNET
                ? { contractId: env.NEAR_REGISTRY_CONTRACT_TESTNET }
                : {}),
            },
          ]
        : []),
    ];
    if (networks.length === 0) throw new Error("near driver is not configured");
    return getResolver({ networks }) as unknown as ResolverRegistry;
  },
});
