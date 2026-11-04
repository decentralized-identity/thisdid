import type { ResolverRegistry } from "did-resolver";
import { getResolver, optionsFromEnv } from "@thisdid/webvh-did-resolver";
import { createDriverWorker } from "../runtime";

/**
 * The WEBVH_* fetch boundaries, set in wrangler.jsonc `vars` (at the package
 * defaults) — the same names the package's CLI reads from its environment.
 * Unset or empty values take the default; a malformed value makes the
 * registry throw, so the Worker answers internalError instead of resolving
 * under an unintended policy. WEBVH_ALLOW_PRIVATE_HOSTS must stay "0" in any
 * deployment.
 */
type WebvhEnv = {
  WEBVH_TIMEOUT_MS?: string;
  WEBVH_MAX_RESPONSE_BYTES?: string;
  WEBVH_MAX_REDIRECTS?: string;
  WEBVH_ALLOW_PRIVATE_HOSTS?: string;
};

/**
 * did:webvh through the vendored `@thisdid/webvh-did-resolver` wrapper —
 * the DIF registry contract plus a WebCrypto Ed25519 proof verifier over the
 * DIF-resident `didwebvh-ts` core, which performs all resolution.
 *
 * Destination policy: the wrapper's bounded fetch (passed to the core through
 * its `fetch` option) refuses literal private hosts before any fetch; the
 * addresses a name resolves to are the platform's concern here —
 * Cloudflare Workers cannot open connections to loopback, private or
 * link-local addresses — which is what `destinationGuard: "platform"`
 * declares (the CLI uses the package's connect-time guard instead).
 */
export default createDriverWorker<WebvhEnv>({
  method: "webvh",
  packageName: "@thisdid/webvh-did-resolver",
  packageVersion: "1.0.0",
  registry: (env) =>
    getResolver({
      ...optionsFromEnv(env),
      destinationGuard: "platform",
    }) as unknown as ResolverRegistry,
});
