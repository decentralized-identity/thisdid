/**
 * did:iden3 / did:polygonid resolver for the DIF `did-resolver` interface.
 *
 * A clean-room driver that resolves iden3-protocol DIDs with nothing but
 * plain EVM JSON-RPC `eth_call`s against the iden3 State contract — no SDK.
 * The read path and every encoding rule were validated live against the
 * Polygon Amoy State contract and Archon's reference driver output:
 *
 *  - the identifier is a base58 31-byte iden3 ID (2-byte type, 27-byte
 *    genesis fragment, 2-byte little-endian checksum = uint16 sum of the
 *    first 29 bytes); its uint256 form is the LITTLE-ENDIAN interpretation
 *    of the 31 bytes;
 *  - `getStateInfoById(uint256)` yields the identity's latest state record
 *    (7 static words); a revert containing "does not exist" means the
 *    identity is unpublished (`published: false`), not an error;
 *  - `getGISTProof(uint256)` (71 static words) and
 *    `getGISTRootInfo(uint256)` (6 words) yield the global identity state
 *    tree root, its lifecycle, and the identity's inclusion proof;
 *  - state and root values render as LITTLE-ENDIAN hex (iden3 field-element
 *    serialization); timestamps and block numbers render as decimal
 *    strings; proof siblings render as decimal strings with trailing
 *    zeros trimmed (go-merkletree JSON semantics).
 *
 * The document carries a single `Iden3StateInfo2023` verification method —
 * no key material and no verification relationships, exactly like the
 * reference driver. Per-network RPC endpoints (e.g. Alchemy) are injected;
 * unconfigured networks fail closed.
 */
import type { ResolverRegistry } from "did-resolver";
export interface Iden3Network {
    /** EVM JSON-RPC endpoint (e.g. an Alchemy URL). */
    rpcUrl: string;
    /** iden3 State contract address on that chain. */
    stateContract?: string;
    /** Numeric chain id (used in the `stateContractAddress` rendering). */
    chainId?: number;
}
export interface Iden3ResolverOptions {
    /** Keyed `blockchain:network`, e.g. `"polygon:amoy"`. */
    networks?: Record<string, Iden3Network>;
    /** Per-request wall-clock bound. Default 6000 ms. */
    timeoutMs?: number;
}
export declare function getResolver(options?: Iden3ResolverOptions): ResolverRegistry;
//# sourceMappingURL=resolver.d.ts.map