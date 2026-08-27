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
/** The single representation this resolver produces. */
export declare const CONTENT_TYPE = "application/did+ld+json";
/**
 * Whether an `accept` value asks for something this resolver can produce.
 *
 * Only the JSON-LD representation is produced, so anything else is refused with
 * `representationNotSupported` rather than answered with a document the caller
 * did not ask for. `application/did+json` is deliberately NOT accepted: serving
 * a JSON-LD-shaped document under that media type would be the same overclaim
 * in the other direction.
 *
 * Per RFC 9110 §12.5.1 a quality of zero means "not acceptable", so it is a
 * rejection rather than a weak preference — and the MOST SPECIFIC matching
 * entry decides, so `application/did+ld+json, *\/*;q=0` is acceptable while
 * `application/did+ld+json;q=0, *\/*` is not. Precedence is exact type over
 * `type/*` over `*\/*`; among equally specific entries the highest quality
 * wins, so a contradictory header errs toward serving the caller.
 *
 * This is deliberately not full content negotiation — there is only one
 * representation to negotiate over.
 */
export declare function producesRepresentation(accept: string): boolean;
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