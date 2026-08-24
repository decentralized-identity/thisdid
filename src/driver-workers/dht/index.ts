import type { ResolverRegistry } from "did-resolver";
import { getResolver } from "@thisdid/dht-did-resolver";
import { createDriverWorker } from "../runtime";

/**
 * did:dht through the vendored `@thisdid/dht-did-resolver` — BEP44-signed
 * DNS packets fetched from a public Pkarr relay over BitTorrent's Mainline
 * DHT (keyless, no secrets): one relay GET per resolution, then offline
 * Ed25519 verification against the DID's own identity key and DID DHT
 * property-mapping reconstruction. A comma-separated DHT_RELAY_URLS var
 * overrides the relay.pkarr.org default.
 */

interface DhtEnv {
  DHT_RELAY_URLS?: string;
}

export default createDriverWorker<DhtEnv>({
  method: "dht",
  packageName: "@thisdid/dht-did-resolver",
  packageVersion: "1.0.0",
  registry: (env) =>
    getResolver({
      ...(env.DHT_RELAY_URLS
        ? {
            relayUrls: env.DHT_RELAY_URLS.split(",")
              .map((url) => url.trim())
              .filter(Boolean),
          }
        : {}),
    }) as unknown as ResolverRegistry,
});
