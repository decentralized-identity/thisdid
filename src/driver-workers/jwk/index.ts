import type { ResolverRegistry } from "did-resolver";
import { getResolver } from "@thisdid/jwk-did-resolver";
import { createDriverWorker } from "../runtime";

/**
 * did:jwk through the vendored `@thisdid/jwk-did-resolver` package — a
 * clean-room, dependency-free implementation of the deterministic did:jwk
 * specification. Fully offline; no configuration.
 */

export default createDriverWorker({
  method: "jwk",
  packageName: "@thisdid/jwk-did-resolver",
  packageVersion: "1.0.0",
  registry: () => getResolver() as unknown as ResolverRegistry,
});
