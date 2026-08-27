import type { ResolverRegistry } from "did-resolver";
import { getResolver } from "@thisdid/ens-did-resolver";
import { alchemyRpcUrl, createDriverWorker } from "../runtime";

/**
 * did:ens through the vendored `@thisdid/ens-did-resolver` wrapper over
 * veramolabs' ens-did-resolver. Follows the ethr driver's convention: the
 * Alchemy base URL is a public var and the token is the ALCHEMY_API_KEY
 * secret appended after it (legacy full-URL secret as fallback), and the
 * driver fails closed until one is configured.
 */

interface EnsEnv {
  ETH_RPC_MAINNET_BASE_URL?: string;
  ALCHEMY_API_KEY?: string;
  ETH_RPC_MAINNET_URL?: string;
}

export default createDriverWorker<EnsEnv>({
  method: "ens",
  packageName: "@thisdid/ens-did-resolver",
  packageVersion: "1.0.0",
  // ethers JsonRpcProvider retains request state across invocations (same
  // constraint as the ethr driver) — never reuse the resolver.
  cacheResolver: false,
  registry: (env) => {
    const rpcUrl =
      alchemyRpcUrl(env.ETH_RPC_MAINNET_BASE_URL, env.ALCHEMY_API_KEY) ??
      env.ETH_RPC_MAINNET_URL;
    if (!rpcUrl) {
      throw new Error("ens driver is not configured");
    }
    return getResolver({
      networks: [{ name: "mainnet", rpcUrl }],
    }) as unknown as ResolverRegistry;
  },
});
