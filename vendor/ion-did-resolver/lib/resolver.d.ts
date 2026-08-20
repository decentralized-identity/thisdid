/**
 * did:ion resolver for the DIF `did-resolver` interface.
 *
 * ION is a Sidetree implementation anchored to Bitcoin. This driver treats
 * the method's two identifier forms differently, as the spec does:
 *
 *  - LONG-FORM (`did:ion:<suffix>:<initial-state>`) resolves fully OFFLINE
 *    and VERIFIED: the initial-state payload must be the exact base64url of
 *    the JCS-canonicalized `{suffixData, delta}`, the DID suffix must equal
 *    the base64url sha256 multihash of the canonicalized `suffixData`, and
 *    `suffixData.deltaHash` must commit to the canonicalized `delta` — then
 *    the document is composed by applying the delta's patches per the
 *    Sidetree protocol. No network I/O, no trust in any node. This
 *    composition is resolution-verified against the reference
 *    implementation (dev.uniresolver.io, 2026-08-20).
 *  - SHORT-FORM (`did:ion:<suffix>`) requires an anchored-state lookup and
 *    is fetched from an explicitly configured Sidetree endpoint — there is
 *    NO default endpoint (the public ION gateways of Microsoft and TBD are
 *    gone, and calling a universal resolver from a driver is the routing
 *    layer's job, not this package's). Unconfigured short-form reports
 *    `notConfigured` so a routing chain can fall through to its upstreams.
 *    Sidetree error responses are normalized to DIF codes and
 *    `canonicalId` / `equivalentId` / `method` / deactivation metadata
 *    pass through.
 *
 * Resolution-only by construction: no create/update/recover machinery.
 * `versionId` / `versionTime` resolution options are forwarded to the
 * endpoint as query parameters when the caller supplies them.
 */
import type { ResolverRegistry } from "did-resolver";
export interface IonResolverOptions {
    /** Anchored-state (short-form) endpoint base; `/identifiers/{did}` is
     * appended. There is deliberately NO default: calling a universal resolver
     * is the routing layer's job, not a driver's — when unset, short-form
     * resolution reports `notConfigured` (a transport-class code) so the
     * routing chain falls through to its upstreams, and long-form resolution
     * (fully offline) is unaffected. */
    endpointUrl?: string;
    /** Per-request wall-clock bound. Default 6000 ms. */
    timeoutMs?: number;
}
export declare function getResolver(options?: IonResolverOptions): ResolverRegistry;
//# sourceMappingURL=resolver.d.ts.map