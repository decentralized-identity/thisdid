/**
 * did:iota resolver for the DIF `did-resolver` interface.
 *
 * A clean-room driver for the IOTA DID method v2.0 on IOTA Rebased (MoveVM):
 * a `did:iota:(<network>:)?0x<64-hex>` names a shared `Identity` Move object
 * whose `did_doc` multicontroller value holds the byte-packed DID document.
 * Resolution is a single `iota_getObject` JSON-RPC call against a fullnode,
 * then a fully offline unpack:
 *
 *   - the object's Move type must be `<package>::identity::Identity` with the
 *     package id in the network's published identity-package history (the
 *     well-known package registry vendored below was taken from
 *     `iotaledger/identity` and the chain identifiers were read live from the
 *     networks themselves on 24 Aug 2026);
 *   - the `controlled_value` bytes carry a `DID` magic, a version byte (1),
 *     an encoding byte (0 = plain JSON) and a little-endian u16 payload
 *     length, followed by `{ doc, meta }` JSON — validated byte-for-byte
 *     against live mainnet Identity objects before implementation;
 *   - every `did:0:0` placeholder in the stored document is replaced with
 *     the canonical DID, per the method spec's Read operation;
 *   - the spec's network assertion is enforced: each endpoint's
 *     `iota_getChainIdentifier` answer is checked (and cached per isolate)
 *     against the chain id the DID's network segment implies, so a
 *     misconfigured endpoint can never serve another network's objects.
 *
 * `deleted_did` Identities resolve to `deactivated: true` with no document.
 * Resolution-only by construction: no create/update machinery, no wallets.
 */
import type { ResolverRegistry } from "did-resolver";
export interface IotaResolverOptions {
    /**
     * Network alias (`iota` | `testnet` | `devnet` — or a custom 8-hex chain
     * id) → fullnode JSON-RPC base URL(s). A string pins one endpoint; an
     * array is tried in order on TRANSPORT failures (a consensus answer —
     * including `notExists` — never falls through). Defaults below.
     */
    rpcUrls?: Record<string, string | string[]>;
    /** Per-request wall-clock bound. Default 6000 ms. */
    timeoutMs?: number;
}
/** Test hook: clear the per-isolate chain-identifier cache. */
export declare function resetChainIdCache(): void;
interface UnpackedDocument {
    doc: Record<string, unknown>;
    meta: {
        created?: string;
        updated?: string;
    };
}
/**
 * Unpack the `controlled_value` bytes: `DID` magic, version 1, encoding 0
 * (plain JSON), little-endian u16 payload length, `{ doc, meta }` payload.
 * Returns an error string instead of throwing so callers can attribute it.
 */
export declare function unpackDidDocument(bytes: Uint8Array): UnpackedDocument | string;
export declare function getResolver(options?: IotaResolverOptions): ResolverRegistry;
export {};
//# sourceMappingURL=resolver.d.ts.map