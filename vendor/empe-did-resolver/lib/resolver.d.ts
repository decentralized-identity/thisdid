/**
 * did:empe resolver for the DIF `did-resolver` interface.
 *
 * A clean-room driver for Empeiria's Cosmos-SDK chain: a
 * `did:empe:(<network>:)?<40-hex>` names a DID document stored by the
 * chain's `x/diddoc` module. Resolution is ONE Tendermint RPC `abci_query`
 * (HTTP GET) against a public fullnode with path
 * `/empe.diddoc.Query/DidDocument`, then a fully offline protobuf decode:
 *
 *   - the request is a hand-encoded `QueryGetDidDocumentRequest { did }`
 *     (field 1, length-delimited string);
 *   - the answer's `value` is a `QueryGetDidDocumentResponse` wrapping the
 *     module's `DidDocument` message — every field number and wire type
 *     below was taken from the chain's own generated codec
 *     (`@empe/empejs` codegen, `/empe.diddoc.DidDocument`) and the decode
 *     was validated byte-for-byte against the live testnet before
 *     implementation (24 Aug 2026);
 *   - the decoded document's `id` must equal the queried DID exactly, which
 *     also pins the network: a node serving another Empeiria network would
 *     answer with a differently-namespaced id and be rejected.
 *
 * The chain answers ABCI code 6 (`DID Document not found`) for absent DIDs
 * — a consensus answer, mapped to `notFound`. Empeiria has no public
 * mainnet yet (verified 24 Aug 2026): mainnet DIDs report `notConfigured`
 * until real endpoints exist, so routing chains can fall through.
 * Resolution-only by construction: no create/update machinery, no wallets.
 */
import type { DIDDocument, ResolverRegistry } from "did-resolver";
export interface EmpeResolverOptions {
    /**
     * Network (`mainnet` | `testnet`) → Tendermint RPC base URL(s). A string
     * pins one endpoint; an array is tried in order on TRANSPORT failures (a
     * consensus answer — including `not found` — never falls through).
     */
    rpcUrls?: Record<string, string | string[]>;
    /** Per-request wall-clock bound. Default 6000 ms. */
    timeoutMs?: number;
}
interface ProtoField {
    fieldNumber: number;
    /** Length-delimited payload, or the varint value for wire type 0. */
    bytes?: Uint8Array;
    varint?: number;
}
/**
 * Decode one protobuf message into its fields, in order. Returns null on
 * malformed input or wire types the diddoc schema never uses (the module's
 * messages are entirely strings, sub-messages and small varints).
 */
export declare function decodeMessage(bytes: Uint8Array): ProtoField[] | null;
/**
 * `/empe.diddoc.DidDocument`: 1 id, 2 context[], 3 controller[],
 * 4 verificationMethod[], 5–9 relationships, 10 service[], 11 alsoKnownAs[].
 * Returns an error string instead of throwing so callers can attribute it.
 */
export declare function decodeDidDocument(bytes: Uint8Array): DIDDocument | string;
/** `QueryGetDidDocumentRequest { did }` → hex for the abci_query data arg. */
export declare function encodeRequest(did: string): string;
export declare function getResolver(options?: EmpeResolverOptions): ResolverRegistry;
export {};
//# sourceMappingURL=resolver.d.ts.map