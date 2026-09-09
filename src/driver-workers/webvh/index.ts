import type { ResolverRegistry } from "did-resolver";
import { getResolver } from "@thisdid/webvh-did-resolver";
import { createDriverWorker } from "../runtime";

/**
 * did:webvh through the vendored `@thisdid/webvh-did-resolver` wrapper —
 * the DIF registry contract plus a WebCrypto Ed25519 proof verifier over the
 * DIF-resident `didwebvh-ts` core, which performs all resolution.
 *
 * Destination policy: the core refuses literal private hosts before any
 * fetch; the addresses a name resolves to are the platform's concern here —
 * Cloudflare Workers cannot open connections to loopback, private or
 * link-local addresses — which is what `destinationGuard: "platform"`
 * declares (the CLI uses the package's connect-time guard instead).
 */
export default createDriverWorker({
  method: "webvh",
  packageName: "@thisdid/webvh-did-resolver",
  packageVersion: "1.0.0",
  registry: () =>
    getResolver({
      destinationGuard: "platform",
    }) as unknown as ResolverRegistry,
});
