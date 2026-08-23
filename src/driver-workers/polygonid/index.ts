import type { ResolverRegistry } from "did-resolver";
import { getResolver } from "@thisdid/iden3-did-resolver";
import { createDriverWorker } from "../runtime";

/**
 * did:polygonid through the vendored `@thisdid/iden3-did-resolver` — the
 * same State-contract engine as did:iden3 (Privado ID's method branch),
 * with the ID's type bytes enforcing the method/network declaration.
 * Network RPC URLs are secrets (e.g. Alchemy):
 *   wrangler secret put POLYGONID_RPC_POLYGON_MAIN_URL --config src/driver-workers/polygonid/wrangler.jsonc
 *   wrangler secret put POLYGONID_RPC_POLYGON_AMOY_URL --config src/driver-workers/polygonid/wrangler.jsonc
 */

interface PolygonidEnv {
  POLYGONID_RPC_POLYGON_MAIN_URL?: string;
  POLYGONID_RPC_POLYGON_AMOY_URL?: string;
}

export default createDriverWorker<PolygonidEnv>({
  method: "polygonid",
  packageName: "@thisdid/iden3-did-resolver",
  packageVersion: "1.0.0",
  registry: (env) =>
    getResolver({
      networks: {
        ...(env.POLYGONID_RPC_POLYGON_MAIN_URL
          ? { "polygon:main": { rpcUrl: env.POLYGONID_RPC_POLYGON_MAIN_URL } }
          : {}),
        ...(env.POLYGONID_RPC_POLYGON_AMOY_URL
          ? { "polygon:amoy": { rpcUrl: env.POLYGONID_RPC_POLYGON_AMOY_URL } }
          : {}),
      },
    }) as unknown as ResolverRegistry,
});
