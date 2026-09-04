import type { ResolverRegistry } from "did-resolver";
import { getResolver } from "@thisdid/oyd-did-resolver";
import { createDriverWorker } from "../runtime";

/**
 * did:oyd through the vendored `@thisdid/oyd-did-resolver` — a TypeScript
 * transliteration of OwnYourData's Ruby reference that verifies the full
 * OYDID chain locally: identifier⇔document hash commitment, provenance-log
 * DAG traversal, per-hop Ed25519 signatures, and revocation. Documents and
 * logs come from the DID's own repository over HTTPS (default
 * oydid.ownyourdata.eu, custom `%40host` repos honored); no secrets.
 * resolver.ownyourdata.eu stays in the routing chain as the method-
 * authoritative probation verifier.
 */
export default createDriverWorker({
  method: "oyd",
  packageName: "@thisdid/oyd-did-resolver",
  packageVersion: "1.0.0",
  registry: () => getResolver() as unknown as ResolverRegistry,
});
