import type { ResolverRegistry } from "did-resolver";
import { getResolver } from "@thisdid/iden3-did-resolver";
import { alchemyRpcUrl, createDriverWorker } from "../runtime";

/**
 * did:polygonid through the vendored `@thisdid/iden3-did-resolver` — the
 * same State-contract engine as did:iden3 (Privado ID's method branch),
 * with the ID's type bytes enforcing the method/network declaration.
 * Network base URLs are public vars (trailing `/`); the token is the
 * ALCHEMY_API_KEY secret appended after it:
 *   wrangler secret put ALCHEMY_API_KEY --config src/driver-workers/polygonid/wrangler.jsonc
 * Legacy POLYGONID_RPC_*_URL full-URL secrets remain as fallbacks until deleted.
 */

interface PolygonidEnv {
  POLYGONID_RPC_POLYGON_MAIN_BASE_URL?: string;
  POLYGONID_RPC_POLYGON_AMOY_BASE_URL?: string;
  ALCHEMY_API_KEY?: string;
  POLYGONID_RPC_POLYGON_MAIN_URL?: string;
  POLYGONID_RPC_POLYGON_AMOY_URL?: string;
}

export default createDriverWorker<PolygonidEnv>({
  method: "polygonid",
  packageName: "@thisdid/iden3-did-resolver",
  packageVersion: "1.0.0",
  registry: (env) => {
    const main =
      alchemyRpcUrl(
        env.POLYGONID_RPC_POLYGON_MAIN_BASE_URL,
        env.ALCHEMY_API_KEY,
      ) ?? env.POLYGONID_RPC_POLYGON_MAIN_URL;
    const amoy =
      alchemyRpcUrl(
        env.POLYGONID_RPC_POLYGON_AMOY_BASE_URL,
        env.ALCHEMY_API_KEY,
      ) ?? env.POLYGONID_RPC_POLYGON_AMOY_URL;
    return getResolver({
      networks: {
        ...(main ? { "polygon:main": { rpcUrl: main } } : {}),
        ...(amoy ? { "polygon:amoy": { rpcUrl: amoy } } : {}),
      },
    }) as unknown as ResolverRegistry;
  },
});
