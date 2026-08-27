import type { ResolverRegistry } from "did-resolver";
import { getResolver } from "@thisdid/sol-did-resolver";
import { alchemyRpcUrl, createDriverWorker } from "../runtime";

/**
 * did:sol through the vendored `@thisdid/sol-did-resolver` — direct Solana
 * JSON-RPC account reads of both sol-did programs (modern + legacy), with
 * generative fallback. Cluster base URLs are public vars (trailing `/`) and
 * the token is the ALCHEMY_API_KEY secret appended after it:
 * `wrangler secret put ALCHEMY_API_KEY --config src/driver-workers/sol/wrangler.jsonc`
 * The legacy SOL_RPC_*_URL full-URL secrets remain as fallbacks until
 * deleted. Unconfigured clusters fail closed.
 */

interface SolEnv {
  SOL_RPC_MAINNET_BASE_URL?: string;
  SOL_RPC_DEVNET_BASE_URL?: string;
  SOL_RPC_TESTNET_BASE_URL?: string;
  ALCHEMY_API_KEY?: string;
  SOL_RPC_MAINNET_URL?: string;
  SOL_RPC_DEVNET_URL?: string;
  SOL_RPC_TESTNET_URL?: string;
}

export default createDriverWorker<SolEnv>({
  method: "sol",
  packageName: "@thisdid/sol-did-resolver",
  packageVersion: "1.0.0",
  registry: (env) => {
    const mainnet =
      alchemyRpcUrl(env.SOL_RPC_MAINNET_BASE_URL, env.ALCHEMY_API_KEY) ??
      env.SOL_RPC_MAINNET_URL;
    const devnet =
      alchemyRpcUrl(env.SOL_RPC_DEVNET_BASE_URL, env.ALCHEMY_API_KEY) ??
      env.SOL_RPC_DEVNET_URL;
    const testnet =
      alchemyRpcUrl(env.SOL_RPC_TESTNET_BASE_URL, env.ALCHEMY_API_KEY) ??
      env.SOL_RPC_TESTNET_URL;
    return getResolver({
      rpcUrls: {
        ...(mainnet ? { mainnet } : {}),
        ...(devnet ? { devnet } : {}),
        ...(testnet ? { testnet } : {}),
      },
    }) as unknown as ResolverRegistry;
  },
});
