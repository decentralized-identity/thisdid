import type { ResolverRegistry } from "did-resolver";
import { getResolver } from "@thisdid/iden3-did-resolver";
import { alchemyRpcUrl, createDriverWorker } from "../runtime";

/**
 * did:iden3 through the vendored `@thisdid/iden3-did-resolver` — direct
 * State-contract reads over plain EVM JSON-RPC (no SDK). Network base URLs
 * are public vars (trailing `/`); the token is the ALCHEMY_API_KEY secret
 * appended after it:
 *   wrangler secret put ALCHEMY_API_KEY --config src/driver-workers/iden3/wrangler.jsonc
 * Legacy IDEN3_RPC_*_URL full-URL secrets remain as fallbacks until deleted.
 * Unconfigured networks fail closed.
 */

interface Iden3Env {
  IDEN3_RPC_POLYGON_MAIN_BASE_URL?: string;
  IDEN3_RPC_POLYGON_AMOY_BASE_URL?: string;
  ALCHEMY_API_KEY?: string;
  IDEN3_RPC_POLYGON_MAIN_URL?: string;
  IDEN3_RPC_POLYGON_AMOY_URL?: string;
}

export default createDriverWorker<Iden3Env>({
  method: "iden3",
  packageName: "@thisdid/iden3-did-resolver",
  packageVersion: "1.0.0",
  registry: (env) => {
    const main =
      alchemyRpcUrl(env.IDEN3_RPC_POLYGON_MAIN_BASE_URL, env.ALCHEMY_API_KEY) ??
      env.IDEN3_RPC_POLYGON_MAIN_URL;
    const amoy =
      alchemyRpcUrl(env.IDEN3_RPC_POLYGON_AMOY_BASE_URL, env.ALCHEMY_API_KEY) ??
      env.IDEN3_RPC_POLYGON_AMOY_URL;
    return getResolver({
      networks: {
        ...(main ? { "polygon:main": { rpcUrl: main } } : {}),
        ...(amoy ? { "polygon:amoy": { rpcUrl: amoy } } : {}),
      },
    }) as unknown as ResolverRegistry;
  },
});
