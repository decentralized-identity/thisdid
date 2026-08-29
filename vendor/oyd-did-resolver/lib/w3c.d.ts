/**
 * Transliteration of the document-composition half of
 * `ruby-gem/lib/oydid.rb` from the OYDID reference, pinned at
 * OwnYourData/oydid@48a62c9, against spec v0.6 §3.2.1 (#resolution_result):
 * w3c, expand_verification_methods, version_ids, version_metadata,
 * document_id. Delegation keys are taken from the already fetched log
 * (getDelegatedPubKeysFromFullDidDocument) instead of the gem's network
 * re-read — same input log, same output keys (REFERENCE-MAP §5).
 */
import { type DidInfo } from "./basic.js";
export declare const ED25519_SECURITY_SUITE = "https://w3id.org/security/suites/ed25519-2020/v1";
/** A composed (open-shape) W3C DID document. */
export type W3cDocument = Record<string, unknown>;
/** ⇔ expand_verification_methods (oydid.rb:1441) */
export declare function expandVerificationMethods(payload: Record<string, unknown>, wd: W3cDocument, did: string): W3cDocument;
/** ⇔ version_ids (oydid.rb:1508) — [canonicalId, equivalentIds], oldest
 *  first, location-free unless keepLocation (which only w3c uses, to keep
 *  alsoKnownAs listing the location-bound variant). */
export declare function versionIds(didInfo: DidInfo, keepLocation?: boolean): [string, string[]];
/** ⇔ version_metadata (oydid.rb:1544) — created / updated / versionId per
 *  DID Core 7.1.3; a property the log cannot answer is absent, not null. */
export declare function versionMetadata(didInfo: DidInfo): Record<string, string>;
/** ⇔ document_id (oydid.rb:1587) — the requested identifier goes into the
 *  document; which version it is stays readable from canonicalId. */
export declare function documentId(didInfo: DidInfo): string;
/** ⇔ w3c (oydid.rb:1597, ed25519 branch) · spec §3.2.1 #resolution_result.
 *  p256-pub returns the reference's error object (REFERENCE-MAP §4). */
export declare function w3c(didInfo: DidInfo, options: {
    location?: string;
}): W3cDocument;
//# sourceMappingURL=w3c.d.ts.map