import type { ResolverRegistry } from "did-resolver";
import { getResolver } from "@thisdid/ion-did-resolver";
import { createDriverWorker } from "../runtime";

/**
 * did:ion through the vendored `@thisdid/ion-did-resolver` — long-form
 * identifiers resolve fully offline and verified (JCS + multihash
 * commitments, Sidetree patch composition); short-form identifiers are
 * fetched from the configured Sidetree/Universal-Resolver endpoint.
 */

interface IonEnv {
  /** Resolution endpoint base (`/identifiers/{did}` appended). */
  ION_RESOLUTION_ENDPOINT?: string;
}

export default createDriverWorker<IonEnv>({
  method: "ion",
  packageName: "@thisdid/ion-did-resolver",
  packageVersion: "1.0.0",
  registry: (env) =>
    getResolver({
      ...(env.ION_RESOLUTION_ENDPOINT
        ? { endpointUrl: env.ION_RESOLUTION_ENDPOINT }
        : {}),
    }) as unknown as ResolverRegistry,
});
