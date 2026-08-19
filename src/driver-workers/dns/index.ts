import type { ResolverRegistry } from "did-resolver";
import { getResolver } from "@thisdid/dns-did-resolver";
import { createDriverWorker } from "../runtime";

/**
 * did:dns through the vendored `@thisdid/dns-did-resolver` — DNS-over-HTTPS
 * URI-record lookups with offline did:key recursion.
 */

interface DnsEnv {
  /** DNS-over-HTTPS JSON endpoint. Defaults to Cloudflare's resolver. */
  DOH_URL?: string;
}

export default createDriverWorker<DnsEnv>({
  method: "dns",
  packageName: "@thisdid/dns-did-resolver",
  packageVersion: "1.0.0",
  registry: (env) =>
    getResolver({
      ...(env.DOH_URL ? { dohUrl: env.DOH_URL } : {}),
    }) as unknown as ResolverRegistry,
});
