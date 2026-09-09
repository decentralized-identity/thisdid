import type { ResolverRegistry } from "did-resolver";
import { getResolver } from "@thisdid/key-did-resolver";
import { createDriverWorker } from "../runtime";

/**
 * did:key through `@thisdid/key-did-resolver`: Ceramic's key-did-resolver (4.0.0) from
 * the ThisDID fork of js-did under vendor/forks rather than the npm registry.
 * The package also carries the standalone CLI; this Worker is deployment glue
 * only.
 */
export default createDriverWorker({
  method: "key",
  packageName: "@thisdid/key-did-resolver",
  packageVersion: "1.0.0",
  registry: () => getResolver() as unknown as ResolverRegistry,
});
