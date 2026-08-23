import type { ResolverRegistry } from "did-resolver";
import { getResolver } from "@thisdid/sol-did-resolver";
import { createDriverWorker } from "../runtime";

/**
 * did:sol through the vendored `@thisdid/sol-did-resolver` — direct Solana
 * JSON-RPC account reads of both sol-did programs (modern + legacy), with
 * generative fallback. Cluster RPC URLs are secrets (e.g. Alchemy):
 * `wrangler secret put SOL_RPC_MAINNET_URL --config src/driver-workers/sol/wrangler.jsonc`
 * (and SOL_RPC_DEVNET_URL / SOL_RPC_TESTNET_URL). Unconfigured clusters
 * fail closed.
 */

interface SolEnv {
  SOL_RPC_MAINNET_URL?: string;
  SOL_RPC_DEVNET_URL?: string;
  SOL_RPC_TESTNET_URL?: string;
}

export default createDriverWorker<SolEnv>({
  method: "sol",
  packageName: "@thisdid/sol-did-resolver",
  packageVersion: "1.0.0",
  registry: (env) =>
    getResolver({
      rpcUrls: {
        ...(env.SOL_RPC_MAINNET_URL
          ? { mainnet: env.SOL_RPC_MAINNET_URL }
          : {}),
        ...(env.SOL_RPC_DEVNET_URL ? { devnet: env.SOL_RPC_DEVNET_URL } : {}),
        ...(env.SOL_RPC_TESTNET_URL
          ? { testnet: env.SOL_RPC_TESTNET_URL }
          : {}),
      },
    }) as unknown as ResolverRegistry,
});
