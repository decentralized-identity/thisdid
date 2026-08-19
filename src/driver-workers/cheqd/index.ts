import type { ResolverRegistry } from "did-resolver";
import { getResolver } from "@thisdid/cheqd-did-resolver";
import { createDriverWorker } from "../runtime";

/**
 * did:cheqd through the vendored `@thisdid/cheqd-did-resolver` — an HTTP
 * driver against cheqd's official (authoritative) DID resolver.
 */

interface CheqdEnv {
  /** cheqd DID Resolver base. Defaults to the official deployment. */
  CHEQD_RESOLVER_URL?: string;
}

export default createDriverWorker<CheqdEnv>({
  method: "cheqd",
  packageName: "@thisdid/cheqd-did-resolver",
  packageVersion: "1.0.0",
  registry: (env) =>
    getResolver({
      ...(env.CHEQD_RESOLVER_URL
        ? { resolverUrl: env.CHEQD_RESOLVER_URL }
        : {}),
    }) as unknown as ResolverRegistry,
});
