import type { ResolverRegistry } from "did-resolver";
import { getResolver } from "@thisdid/peer-did-resolver";
import { createDriverWorker } from "../runtime";

/**
 * did:peer through `@thisdid/peer-did-resolver`: Veramo's peer-did-resolver
 * adapter (2.0.0) over the aviarytech did-peer core (0.0.22), both consumed
 * from ThisDID forks under vendor/forks rather than the npm registry. The
 * package also carries the standalone CLI; this Worker is deployment glue only.
 */
export default createDriverWorker({
  method: "peer",
  packageName: "@thisdid/peer-did-resolver",
  packageVersion: "1.0.0",
  registry: () => getResolver() as unknown as ResolverRegistry,
});
