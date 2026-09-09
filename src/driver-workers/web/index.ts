import type { ResolverRegistry } from "did-resolver";
import { getResolver } from "@thisdid/web-did-resolver";
import { createDriverWorker } from "../runtime";

/**
 * did:web through `@thisdid/web-did-resolver`: the DIF web-did-resolver core
 * (2.0.32), consumed from the ThisDID fork under vendor/forks rather than
 * the npm registry. The package also carries the standalone CLI; this Worker
 * is deployment glue only.
 *
 * Destination policy: the core refuses literal private hosts before any
 * fetch; the addresses a name resolves to are the platform's concern here —
 * Cloudflare Workers cannot open connections to loopback, private or
 * link-local addresses — which is what `destinationGuard: "platform"`
 * declares (the CLI uses the package's connect-time guard instead).
 */
export default createDriverWorker({
  method: "web",
  packageName: "@thisdid/web-did-resolver",
  packageVersion: "1.0.0",
  registry: () =>
    getResolver({
      destinationGuard: "platform",
    }) as unknown as ResolverRegistry,
});
