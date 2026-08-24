/**
 * did:dht resolver for the DIF `did-resolver` interface.
 *
 * A clean-room driver for DID DHT: a `did:dht:<z-base-32-key>` names an
 * Ed25519 Identity Key whose DID document lives as a compressed DNS packet
 * in BitTorrent's Mainline DHT (BEP44 mutable item), reachable over HTTP
 * through a Pkarr relay. Resolution is ONE relay GET, then fully offline,
 * VERIFIED reconstruction:
 *
 *   - the relay payload is `signature (64) ‖ seq (8, big-endian) ‖ v` and
 *     the Ed25519 signature over the bencoded `3:seqi<seq>e1:v<len>:<v>`
 *     is checked against the Identity Key from the DID itself — a relay
 *     (or the DHT) can withhold a record but can never forge one;
 *   - `v` is an RFC1035 DNS packet (compression pointers supported); the
 *     `_did.<id>.` root TXT record maps aliases to `_kN._did.` key records
 *     and `_sN._did.` service records, reversed here per the DID DHT
 *     property mapping (root `deactivated` → deactivated: true);
 *   - key records carry raw public keys (registry types 0 Ed25519,
 *     1 secp256k1, 2 P-256, 3 X25519); EC keys are decompressed to full
 *     `x`/`y` JWKs, unnamed keys get their RFC 7638 JWK Thumbprint as the
 *     verification method id, and `_k0`'s bytes MUST equal the Identity
 *     Key — all per the spec and its registries.
 *
 * The DIF spec (did-dht, W3C-registered) is complete and the Mainline +
 * Pkarr relay rails are live (relay resolution-verified 24 Aug 2026), but
 * records expire unless their owners republish — an absent record answers
 * `notFound`, deliberately NOT the spec's optional identity-key-only
 * fallback document, which would resurrect expired or deactivated DIDs.
 * Resolution-only by construction: no publishing, no republishing.
 */
import type { DIDDocument, ResolverRegistry } from "did-resolver";
export interface DhtResolverOptions {
    /**
     * Pkarr relay base URL(s), tried in order on TRANSPORT failures (a relay
     * 404 — no record on the DHT — is a real answer and never falls through).
     */
    relayUrls?: string[];
    /** Per-request wall-clock bound. Default 6000 ms. */
    timeoutMs?: number;
}
/** 52-char z-base-32 identifier → 32-byte Ed25519 public key; null if bad. */
export declare function zBase32Decode(encoded: string): Uint8Array | null;
/** 32-byte public key → 52-char z-base-32 identifier. */
export declare function zBase32Encode(bytes: Uint8Array): string;
/**
 * Verify the Ed25519 signature over the bencoded mutable item
 * (`3:seqi<seq>e1:v<len>:<value>`), per BEP44 and the Pkarr relay design.
 */
export declare function verifyBep44(publicKey: Uint8Array, signature: Uint8Array, seq: bigint, value: Uint8Array): boolean;
interface DnsRecord {
    name: string;
    type: number;
    /** TXT character-strings concatenated; NS target name. */
    data: string;
}
/** Parse the answer records of an authoritative DNS packet. */
export declare function parseDnsPacket(bytes: Uint8Array): DnsRecord[] | null;
/** RFC 7638 JWK Thumbprint (lexicographic required members, SHA-256). */
export declare function jwkThumbprint(jwk: Record<string, string>): string;
interface Reconstruction {
    document: DIDDocument;
    types?: number[];
    gateways?: string[];
    deactivated: boolean;
}
/**
 * Reverse the DID DHT property mapping: records → DID document. Returns an
 * error string instead of throwing so callers can attribute it.
 */
export declare function reconstructDocument(records: DnsRecord[], did: string, identityKey: Uint8Array): Reconstruction | string;
export declare function getResolver(options?: DhtResolverOptions): ResolverRegistry;
export {};
//# sourceMappingURL=resolver.d.ts.map