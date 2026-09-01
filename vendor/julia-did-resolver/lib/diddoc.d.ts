/**
 * DID Document construction (spec §8) and the resolution result envelope.
 *
 * The default DID Document is a pure projection of on-chain singleton state.
 * Verification-method enumeration follows the rule in spec §8.2: a key is
 * listed only when its membership in the CURRENT authentication Merkle root is
 * proven by on-chain data. This version proves membership for single-key
 * configurations — the dominant personal-DID case — using the tree shape the
 * production drivers build and which is verified against mainnet: the key tree
 * is `((K . K) . 0)`, so the root is `pair_hash(class, nil_hash)` where the
 * class is the key paired with itself. Candidate keys come from the
 * prelauncher reveal (the genesis key) and from keys revealed in the most
 * recent spend's solution. Multi-key Merkle-path replay is not implemented (a
 * documented v1 limitation shared with the Python reference); the
 * authentication commitment itself is always published.
 */
import type { DIDDocument, DIDResolutionResult } from "did-resolver";
import { type JuliaDidState } from "./state.js";
/**
 * The DID context is v1, not v1.1: as of 2026-08 the
 * `https://www.w3.org/ns/did/v1.1` URL does not dereference (W3C returns 300
 * even under JSON-LD content negotiation), so documents citing it fail JSON-LD
 * expansion. Every term this resolver emits is defined in the v1 context.
 * Spec §8.1.
 */
export declare const CONTEXTS: readonly ["https://www.w3.org/ns/did/v1", "https://w3id.org/security/multikey/v1", "https://not.bot/ns/did-julia/v1"];
/** Multibase base58-btc Multikey encoding of a BLS12-381 G1 public key. */
export declare function multikey(publicKey: Uint8Array): string;
/**
 * Merkle root of the single-key authentication tree `((K . K) . 0)`, the
 * construction the production drivers build (verified against mainnet).
 */
export declare function singleKeyRoot(publicKey: Uint8Array): Uint8Array;
/** A DID Document plus the method-specific properties spec §8.3 defines. */
type JuliaDidDocument = DIDDocument & Record<string, unknown>;
export declare function buildDocument(state: JuliaDidState, candidateKeys?: Uint8Array[]): JuliaDidDocument;
export interface ResolutionInputs {
    state: JuliaDidState;
    document: JuliaDidDocument;
    versionCoinId: Uint8Array;
    confirmedTimestamp: number;
    verified: boolean;
    currentPuzzle: boolean;
    /**
     * Supplied only by version-specific resolution, which walks the DID's whole
     * lineage and therefore knows them. Current-state resolution reports what a
     * single look at the unspent coin establishes, so that its metadata does not
     * depend on which traversal route a node happened to support (§8.5).
     */
    createdTimestamp?: number;
    nextVersionCoinId?: Uint8Array;
    nextTimestamp?: number;
}
/** Document, document metadata (§8.5), and resolution metadata. */
export declare function resolutionResult(inputs: ResolutionInputs): DIDResolutionResult;
export declare function errorResult(error: string, message?: string): DIDResolutionResult;
export {};
//# sourceMappingURL=diddoc.d.ts.map