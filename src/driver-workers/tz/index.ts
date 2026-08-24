import type { ResolverRegistry } from "did-resolver";
import { getResolver } from "@thisdid/tz-did-resolver";
import { createDriverWorker } from "../runtime";

/**
 * did:tz through the vendored `@thisdid/tz-did-resolver` — the Tezos DID
 * method's layer-1 derivation (keyless, no secrets), enriched by one TzKT
 * indexer call whose revealed public key is only served after the driver
 * re-derives the address from it (BLAKE2b-20). TzKT being down degrades to
 * the pure offline document. Endpoints may be overridden per network via
 * vars (mainnet / shadownet).
 */

interface TzEnv {
  TZ_TZKT_MAINNET_URL?: string;
  TZ_TZKT_SHADOWNET_URL?: string;
}

export default createDriverWorker<TzEnv>({
  method: "tz",
  packageName: "@thisdid/tz-did-resolver",
  packageVersion: "1.0.0",
  registry: (env) =>
    getResolver({
      tzktUrls: {
        ...(env.TZ_TZKT_MAINNET_URL
          ? { mainnet: env.TZ_TZKT_MAINNET_URL }
          : {}),
        ...(env.TZ_TZKT_SHADOWNET_URL
          ? { shadownet: env.TZ_TZKT_SHADOWNET_URL }
          : {}),
      },
    }) as unknown as ResolverRegistry,
});
