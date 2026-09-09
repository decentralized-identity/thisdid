import type { ResolverRegistry } from "did-resolver";
import { getResolver } from "@thisdid/pkh-did-resolver";
import { createDriverWorker } from "../runtime";

/**
 * did:pkh through `@thisdid/pkh-did-resolver`: Ceramic's pkh-did-resolver (2.0.0) from
 * the ThisDID fork of js-did under vendor/forks rather than the npm registry.
 * The package also carries the standalone CLI; this Worker is deployment glue
 * only.
 */
export default createDriverWorker({
  method: "pkh",
  packageName: "@thisdid/pkh-did-resolver",
  packageVersion: "1.0.0",
  registry: () => getResolver() as unknown as ResolverRegistry,
});
