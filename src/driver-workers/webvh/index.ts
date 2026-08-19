import type { ResolverRegistry } from "did-resolver";
import { getResolver } from "@thisdid/webvh-did-resolver";
import { createDriverWorker } from "../runtime";

/**
 * did:webvh through the vendored `@thisdid/webvh-did-resolver` wrapper —
 * the DIF registry contract plus a WebCrypto Ed25519 proof verifier over the
 * DIF-resident `didwebvh-ts` core, which performs all resolution.
 */

export default createDriverWorker({
  method: "webvh",
  packageName: "@thisdid/webvh-did-resolver",
  packageVersion: "1.0.0",
  registry: () => getResolver() as unknown as ResolverRegistry,
});
