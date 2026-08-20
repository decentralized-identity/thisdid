/**
 * did:cid resolver for the DIF `did-resolver` interface.
 *
 * A RESOLUTION-ONLY Archon Gatekeeper: instead of proxying a Gatekeeper's
 * answer, this driver fetches the DID's complete signed operation chain
 * (`POST {gatekeeper}/dids/export`) and re-derives the document itself,
 * verifying every link of the method's trust chain in-process:
 *
 *  - the DID suffix must equal the CIDv1 (json codec, sha256, base32) of the
 *    JCS-canonicalized genesis operation — content-addressed identity;
 *  - the genesis operation must be self-signed by its `publicJwk` (agent) or
 *    signed by the controller's then-current key (asset, resolved
 *    recursively with a depth bound);
 *  - every update/delete must be signed by the *then-current* first
 *    verification-method key (key rotation honored) and hash-linked to the
 *    previous operation (`previd` = recomputed CID of the prior operation);
 *  - deactivation is terminal.
 *
 * Only event DISCOVERY is delegated to the Gatekeeper: a lying Gatekeeper
 * can withhold the tail of a chain (staleness) but cannot forge, alter, or
 * reorder state without breaking a signature or a CID link. Verification
 * semantics are ported from `@didcid/gatekeeper` (MIT) `resolveDID` with
 * `verify: true`; the blockchain `timestamp` enrichment is omitted (it
 * requires a registry block database, which is a node concern, not a
 * resolution concern).
 */
import type { ResolverRegistry } from "did-resolver";
export interface CidResolverOptions {
    /** Archon Gatekeeper API base (e.g. `https://archon.technology/api/v1`). */
    gatekeeperUrl?: string;
    /** Per-request wall-clock bound. Default 6000 ms. */
    timeoutMs?: number;
    /** Upper bound on events accepted per DID chain. Default 1024. */
    maxEvents?: number;
}
export declare function getResolver(options?: CidResolverOptions): ResolverRegistry;
//# sourceMappingURL=resolver.d.ts.map