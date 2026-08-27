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
import type { DIDResolutionOptions, DIDResolutionResult, ResolverRegistry } from "did-resolver";
import { FullNodeClient, type FullNodeClientOptions } from "./chain.js";
export declare const METHOD = "julia";
export interface JuliaResolverOptions extends FullNodeClientOptions {
    /** Supply a pre-built client instead of constructing one per registry. */
    client?: FullNodeClient;
}
/** Per-request DID resolution options, plus a cancellation signal. */
export interface JuliaResolutionRequest extends DIDResolutionOptions {
    signal?: AbortSignal;
}
/**
 * Resolve a did:julia DID to a DID resolution result (spec §7.2, §8).
 *
 * Version-specific resolution (`versionId` / `versionTime`) is NOT implemented
 * — this resolver always reads the singleton's current state. Rather than
 * ignoring those options and returning the latest document as though it were
 * the requested one, a request carrying either is REFUSED with
 * `unsupportedResolutionOption`. Silently answering the wrong question is the
 * one failure mode a caller cannot detect.
 *
 * The only representation produced is `application/did+ld+json`, which every
 * result reports in `didResolutionMetadata.contentType`.
 */
export declare function resolve(did: string, options?: JuliaResolverOptions, resolutionOptions?: JuliaResolutionRequest): Promise<DIDResolutionResult>;
/** DIF `did-resolver` registry entry for `did:julia`. */
export declare function getResolver(options?: JuliaResolverOptions): ResolverRegistry;
//# sourceMappingURL=resolver.d.ts.map