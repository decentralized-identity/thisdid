/**
 * did:julia resolver for the DIF `did-resolver` interface.
 *
 * Resolution reads public Chia blockchain state (spec §7.2) through any full
 * node RPC — by default the open Coinset endpoint. No did:julia-specific
 * service is contacted, and no operator is trusted: the singleton's state is
 * re-derived from the most recent spend and checked against the puzzle hash of
 * the coin the chain actually holds.
 *
 * The driver executes no CLVM. See
 * `docs/adr/0001-state-derivation-without-clvm.md`.
 */
import type { DIDResolutionResult, ResolverRegistry } from "did-resolver";
import { FullNodeClient, type FullNodeClientOptions } from "./chain.js";
export declare const METHOD = "julia";
export interface JuliaResolverOptions extends FullNodeClientOptions {
    /** Supply a pre-built client instead of constructing one per registry. */
    client?: FullNodeClient;
}
/**
 * Resolve a did:julia DID to a DID resolution result (spec §7.2, §8).
 *
 * Resolution options are not consulted: version-specific resolution
 * (`versionId` / `versionTime`) is not implemented, in common with the Python
 * reference resolver, and the only representation produced is
 * `application/did+ld+json`.
 */
export declare function resolve(did: string, options?: JuliaResolverOptions, signal?: AbortSignal): Promise<DIDResolutionResult>;
/** DIF `did-resolver` registry entry for `did:julia`. */
export declare function getResolver(options?: JuliaResolverOptions): ResolverRegistry;
//# sourceMappingURL=resolver.d.ts.map