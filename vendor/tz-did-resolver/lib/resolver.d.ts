/**
 * did:tz resolver for the DIF `did-resolver` interface.
 *
 * A clean-room driver for the Tezos DID method: a
 * `did:tz:(<network>:)?<address>` derives its DID document from the address
 * itself (the spec's layer-1 "tier 1 derivation", validated against the
 * Spruce reference implementation in `spruceid/ssi`):
 *
 *   - the address is base58check-validated (Tezos 3-byte version prefixes,
 *     double-SHA-256 checksum); `tz1`/`tz2`/`tz3` map to
 *     Ed25519 / secp256k1 / P-256 verification method types exactly as the
 *     reference does, with a CAIP-10 `blockchainAccountId`
 *     (`tezos:<chain-id>:<address>`);
 *   - the document is then ENRICHED from the chain: one TzKT indexer call
 *     discovers the account's revealed public key, which is only included
 *     after this driver re-derives the address from it (base58check decode,
 *     BLAKE2b-20 hash) — a lying indexer cannot plant a key. TzKT being
 *     unreachable degrades to the pure offline derivation, never to an
 *     error;
 *   - `KT1` smart-contract DIDs need TZIP-19 DID-manager view execution
 *     (the spec's tier 2) and report `notConfigured`, as do the spec's
 *     long-dead named testnets; `tz4` (BLS) addresses postdate the spec and
 *     are rejected as invalid.
 *
 * Networks are pinned by chain id: mainnet (`NetXdQprcVkpaWU`) and the
 * current Shadownet testnet (`NetXsqzbfFenSTS`), both verified live
 * 24 Aug 2026 (Ghostnet was terminated in 2026). Resolution-only by
 * construction; every valid account DID resolves (generative method).
 */
import type { ResolverRegistry } from "did-resolver";
export interface TzResolverOptions {
    /**
     * Network → TzKT API base URL(s) for public-key discovery. A string pins
     * one endpoint; an array is tried in order on transport failures.
     * Discovery failures degrade to the offline document, never to an error.
     */
    tzktUrls?: Record<string, string | string[]>;
    /** Extra network → CAIP-2 chain id (genesis) mappings. */
    chainIds?: Record<string, string>;
    /** Per-request wall-clock bound. Default 6000 ms. */
    timeoutMs?: number;
}
/** base58check payload after `prefix`, checksum-verified; null when bad. */
export declare function decodeChecked(encoded: string, prefix: readonly number[], payloadLength: number): Uint8Array | null;
/**
 * True when `publicKey` (edpk/sppk/p2pk base58check) is the very key whose
 * BLAKE2b-20 digest is the address payload — the reveal relationship.
 */
export declare function keyMatchesAddress(publicKey: string, address: string): boolean;
export declare function getResolver(options?: TzResolverOptions): ResolverRegistry;
//# sourceMappingURL=resolver.d.ts.map