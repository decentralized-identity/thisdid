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
 * Follows RFC 9110 §12.5.1 in three respects:
 *
 *  - **Media parameters preceding `q` are part of the media range.** A range
 *    naming a parameter the representation does not carry does not match at
 *    all, and a matching parameter makes the range MORE specific than the bare
 *    type — the spec's own example ranks `text/plain;format=flowed` above
 *    `text/plain`. Parameters after `q` are accept extensions and are ignored.
 *  - Specificity is two INDEPENDENT dimensions compared lexicographically:
 *    how concrete the type is, and only then how many parameters matched. They
 *    must not be added together, or a parameterized wildcard would tie an
 *    exact type — `application/*;charset=utf-8` is never as specific as
 *    `application/did+ld+json`, whatever parameters it carries.
 *  - **A quality of zero means "not acceptable"**, so it is a rejection rather
 *    than a weak preference.
 *  - **The most specific matching range decides.** `application/did+ld+json,
 *    *\/*;q=0` is acceptable; `application/did+ld+json;q=0, *\/*` is not.
 *    Among equally specific ranges the highest quality wins, so a
 *    self-contradictory header errs toward serving the caller.
 *
 * This is deliberately not general content negotiation — there is one
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
    /**
     * The `versionTime` DID parameter (spec §7.2.1): an XML datetime carrying a
     * UTC designator or an explicit offset. `versionId` is declared by the DIF
     * `did-resolver` interface itself.
     */
    versionTime?: string;
}
/**
 * XML datetime -> POSIX seconds.
 *
 * Every field is range-checked against the calendar, so a date that does not
 * exist is rejected rather than rolled forward into one that does. `Date.parse`
 * cannot do this: it normalizes, turning `2026-02-30T00:00:00Z` into March 2nd
 * and `2026-02-29T00:00:00Z` into March 1st, and it accepts hour 24 as the next
 * day. A resolver that answered those with the version current on the
 * normalized date would be answering a different question than the caller
 * asked, which is the one failure they cannot detect. The Python reference
 * resolver rejects exactly this set, and the two must not disagree about which
 * requests are valid.
 *
 * Sub-second precision is truncated — the DID Resolution specification requires
 * datetimes without it, and a Chia block's timestamp has one-second resolution
 * anyway.
 */
export declare function parseVersionTime(value: string): number;
/**
 * Resolve a did:julia DID to a DID resolution result (spec §7.2, §8).
 *
 * With no version option this reads the singleton's current state. With
 * `versionId` or `versionTime` — mutually exclusive, as DID Resolution
 * requires — it walks the DID's lineage and answers for the generation that
 * version names (spec §7.2.1). A superseded generation's state is read from
 * its own spend and checked against that coin's own puzzle hash, so history
 * is served under exactly the commitment current state is served under: a
 * version this resolver cannot verify is an error, never a guess, and the
 * current document is never returned in place of a requested one.
 *
 * The only representation produced is `application/did+ld+json`, which every
 * result reports in `didResolutionMetadata.contentType`.
 */
export declare function resolve(did: string, options?: JuliaResolverOptions, resolutionOptions?: JuliaResolutionRequest): Promise<DIDResolutionResult>;
/** DIF `did-resolver` registry entry for `did:julia`. */
export declare function getResolver(options?: JuliaResolverOptions): ResolverRegistry;
//# sourceMappingURL=resolver.d.ts.map