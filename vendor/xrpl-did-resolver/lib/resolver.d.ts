/**
 * did:xrpl resolver for the DIF `did-resolver` interface.
 *
 * A clean-room driver for XLS-40 — the XRP Ledger's NATIVE, consensus-level
 * DID method (amendment active on mainnet since 30 October 2024). A
 * `did:xrpl:<network-id>:<idstring>` names an XRPL account either by its
 * classic address or by the hex of its master public key; the DID's state is
 * the account's on-ledger `DID` entry, read with a single JSON-RPC
 * `ledger_entry {did}` call against the validated ledger.
 *
 * Every encoding rule here was validated live before implementation:
 *   - XRPL base58check (its own alphabet, double-SHA-256 checksum, version
 *     byte 0x00 + 20-byte AccountID) round-trips real mainnet addresses;
 *   - AccountID = RIPEMD-160(SHA-256(pubkey)) reproduces the spec's own
 *     pubkey/address example pair;
 *   - the DID entry's object ID = SHA-512Half(0x0049 ‖ AccountID) matches
 *     live mainnet `ledger_entry` indexes byte-for-byte;
 *   - network IDs come from the chains themselves (`server_info`):
 *     mainnet = 0, testnet = 1, devnet = 2.
 *
 * Composition follows the XLS-40 read operation: an on-ledger `DIDDocument`
 * blob that decodes to a JSON object is served as the authored document
 * (its `id` normalized to the queried DID); the `URI` blob surfaces as a
 * `LinkedResource` service plus metadata; the `Data` attestation blob goes
 * to metadata. When no `DID` entry exists the spec's IMPLICIT document is
 * served instead: public-key-form DIDs yield a single Multikey master key,
 * address-form DIDs a minimal keyless document. The driver never fetches
 * the URI's remote content — it resolves only what the ledger attests.
 */
import type { ResolverRegistry } from "did-resolver";
export interface XrplResolverOptions {
    /**
     * Network-id → JSON-RPC base URL(s). A string pins one endpoint; an array
     * is tried in order on TRANSPORT failures (a consensus answer — including
     * `entryNotFound` — never falls through). Defaults below.
     */
    rpcUrls?: Record<string, string | string[]>;
    /** Per-request wall-clock bound. Default 6000 ms. */
    timeoutMs?: number;
}
/** Classic-address → 20-byte AccountID; null when malformed or bad checksum. */
export declare function decodeAccountId(address: string): Uint8Array | null;
/** 20-byte AccountID → classic address (version 0x00, double-SHA checksum). */
export declare function encodeAddress(accountId: Uint8Array): string;
/** Master public key (33 bytes) → AccountID, per XRPL address encoding. */
export declare function accountIdFromPublicKey(publicKey: Uint8Array): Uint8Array;
/** DID entry object ID: SHA-512Half(0x0049 ‖ AccountID) — for metadata. */
export declare function didObjectId(accountId: Uint8Array): string;
export declare function getResolver(options?: XrplResolverOptions): ResolverRegistry;
//# sourceMappingURL=resolver.d.ts.map