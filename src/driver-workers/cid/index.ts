import type { ResolverRegistry } from "did-resolver";
import { getResolver } from "@thisdid/cid-did-resolver";
import { createDriverWorker } from "../runtime";

/**
 * did:cid through the vendored `@thisdid/cid-did-resolver` — a
 * resolution-only Archon Gatekeeper: the signed operation chain is fetched
 * from the configured Gatekeeper and fully verified in this Worker (genesis
 * CID, per-operation signatures with key rotation, previd hash links).
 */

interface CidEnv {
  /** Archon Gatekeeper API base. Defaults to archon.technology/api/v1. */
  CID_GATEKEEPER_URL?: string;
}

export default createDriverWorker<CidEnv>({
  method: "cid",
  packageName: "@thisdid/cid-did-resolver",
  packageVersion: "1.0.0",
  registry: (env) =>
    getResolver({
      ...(env.CID_GATEKEEPER_URL
        ? { gatekeeperUrl: env.CID_GATEKEEPER_URL }
        : {}),
    }) as unknown as ResolverRegistry,
});
