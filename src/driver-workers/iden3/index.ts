import type { ResolverRegistry } from "did-resolver";
import { getResolver } from "@thisdid/iden3-did-resolver";
import { createDriverWorker } from "../runtime";

/**
 * did:iden3 through the vendored `@thisdid/iden3-did-resolver` — direct
 * State-contract reads over plain EVM JSON-RPC (no SDK). Network RPC URLs
 * are secrets (e.g. Alchemy):
 *   wrangler secret put IDEN3_RPC_POLYGON_MAIN_URL --config src/driver-workers/iden3/wrangler.jsonc
 *   wrangler secret put IDEN3_RPC_POLYGON_AMOY_URL --config src/driver-workers/iden3/wrangler.jsonc
 * Unconfigured networks fail closed.
 */

interface Iden3Env {
  IDEN3_RPC_POLYGON_MAIN_URL?: string;
  IDEN3_RPC_POLYGON_AMOY_URL?: string;
}

export default createDriverWorker<Iden3Env>({
  method: "iden3",
  packageName: "@thisdid/iden3-did-resolver",
  packageVersion: "1.0.0",
  registry: (env) =>
    getResolver({
      networks: {
        ...(env.IDEN3_RPC_POLYGON_MAIN_URL
          ? { "polygon:main": { rpcUrl: env.IDEN3_RPC_POLYGON_MAIN_URL } }
          : {}),
        ...(env.IDEN3_RPC_POLYGON_AMOY_URL
          ? { "polygon:amoy": { rpcUrl: env.IDEN3_RPC_POLYGON_AMOY_URL } }
          : {}),
      },
    }) as unknown as ResolverRegistry,
});
