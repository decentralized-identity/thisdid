import type { ResolverRegistry } from "did-resolver";
import { getResolver } from "@thisdid/ens-did-resolver";
import { createDriverWorker } from "../runtime";

/**
 * did:ens through the vendored `@thisdid/ens-did-resolver` wrapper over
 * veramolabs' ens-did-resolver. Follows the ethr driver's convention: full
 * RPC URLs (credentials included) live as secrets on this Worker only, and
 * the driver fails closed until one is configured.
 */

interface EnsEnv {
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
    if (!env.ETH_RPC_MAINNET_URL) {
      throw new Error("ens driver is not configured");
    }
    return getResolver({
      networks: [{ name: "mainnet", rpcUrl: env.ETH_RPC_MAINNET_URL }],
    }) as unknown as ResolverRegistry;
  },
});
