/**
 * did:sol resolver for the DIF `did-resolver` interface.
 *
 * A clean-room driver that resolves did:sol with nothing but Solana JSON-RPC
 * `getMultipleAccounts` — no Anchor, no @solana/web3.js. It reproduces the
 * official Identity.com `sol-did` resolution semantics (ported from the
 * program's Rust state and the client's document composer, and validated
 * against live devnet accounts):
 *
 *  - the identifier's authority key derives TWO program-derived addresses,
 *    checked in one RPC round-trip: the current program
 *    (`didso1Dpqpm4CsiCjzP766BGY89CAdD6ZBL68cRhFPc`, seeds
 *    `["did-account", authority]`, Anchor/borsh `DidAccount` layout) and the
 *    legacy program (`idDa4XeCjVwKcprVAo812coUQbovSZ4kDGJf2sPaBnM`, seeds
 *    `[authority, "sol"]`, raw borsh `LegacyDidAccount` layout) — real-world
 *    did:sol population predates the v3 program, so both must be read;
 *  - legacy state maps to modern semantics exactly as the on-chain
 *    `migrate()` does: relationship membership arrays become flag bits;
 *  - no account on either program → the generative document (`#default`
 *    verification method from the authority key, `capabilityInvocation`
 *    only), per the method specification;
 *  - flags map per the program bitfield (authentication, assertion,
 *    keyAgreement, capabilityInvocation, capabilityDelegation), with
 *    DID_DOC_HIDDEN methods omitted and OWNERSHIP_PROOF / PROTECTED never
 *    surfaced as relationships.
 *
 * RPC endpoints are cluster-scoped and injected (mainnet / devnet /
 * testnet — e.g. Alchemy URLs); an unconfigured cluster fails closed.
 */
import type { ResolverRegistry } from "did-resolver";
export interface SolResolverOptions {
    /** Cluster → JSON-RPC URL. Clusters without a URL fail closed. */
    rpcUrls?: {
        mainnet?: string;
        devnet?: string;
        testnet?: string;
    };
    /** Per-request wall-clock bound. Default 6000 ms. */
    timeoutMs?: number;
}
export declare function getResolver(options?: SolResolverOptions): ResolverRegistry;
//# sourceMappingURL=resolver.d.ts.map