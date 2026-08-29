/**
 * Transliteration of `resolution_result`
 * (uniresolver-plugin/app/controllers/dids_controller.rb:180) from the
 * OYDID reference, pinned at OwnYourData/oydid@48a62c9, exposed through the
 * DIF did-resolver interface (spec v0.6 §3.2.1 #resolution_result, §3.2.3
 * #deactivation). The legacy-resolver fallback is not ported
 * (REFERENCE-MAP §3); the alsoKnownAs DID-Rotation follow is an explicit
 * host opt-in, OFF by default, delivered through the host's own Resolvable
 * (REFERENCE-MAP §2) — a universal-resolver driver answers only for the
 * requested DID, while a standalone host (e.g. a local CLI) may follow.
 */
import type { DIDResolutionResult, ResolverRegistry } from "did-resolver";
import { type OydOptions } from "./basic.js";
import { type W3cDocument } from "./w3c.js";
/** Host-facing configuration (a DIF driver defaults to answering only for
 *  the requested DID; a standalone host such as a CLI opts into following
 *  DID Rotation through its own registered drivers). */
export interface OydResolverOptions {
    /** Follow a revoked DID's alsoKnownAs rotation (⇔ the reference
     *  resolver's FOLLOW_ALSOKNOWNAS, which defaults to true there). */
    followAlsoKnownAs?: boolean;
}
/** ⇔ resolution_result (dids_controller.rb:180). DID-URL fragments are the
 *  caller's layer (see dereferenceFragment below). */
export declare function resolutionResult(did: string, config?: OydResolverOptions, resolveRotationTarget?: OydOptions["resolveRotationTarget"]): Promise<DIDResolutionResult>;
/** DIF did-resolver registry entry for did:oyd. Standalone hosts (e.g. a
 *  local CLI) may opt into DID-Rotation following; the default answers only
 *  for the requested DID, which is what a universal-resolver driver must
 *  do. */
export declare function getResolver(config?: OydResolverOptions): ResolverRegistry;
/** ⇔ the fragment branch of resolution_result (dids_controller.rb:437) —
 *  exposed as a pure helper so callers that dereference DID URLs (the
 *  reference server does; a CLI can) reuse the reference behavior: the
 *  verification method whose id ends in `#fragment`, carrying the
 *  document's @context. Returns null when no method matches. */
export declare function dereferenceFragment(document: W3cDocument, fragment: string): W3cDocument | null;
//# sourceMappingURL=resolver.d.ts.map