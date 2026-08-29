/**
 * Resolver-side security hardening that has no counterpart in the reference
 * (which relies on Ruby's dynamic typing and a trusted first-party
 * repository). Everything here fails CLOSED: it can only turn malformed or
 * hostile input into a rejection, never change the resolution of a valid
 * DID. See REFERENCE-MAP.md "Security hardening (beyond the reference)".
 */
/** A provenance log longer than this is rejected outright — real DIDs have a
 *  handful of entries, and the bound caps graph work and `/doc_raw` fetches
 *  (one per CREATE/UPDATE/TERMINATE the walk installs). */
export declare const MAX_LOG_ENTRIES = 1024;
/** Maximum `previous` back-references per log entry (caps edge count). */
export declare const MAX_PREVIOUS_PER_ENTRY = 128;
/** Maximum DID-Rotation hops followed before giving up (loop protection). */
export declare const MAX_ROTATION_DEPTH = 5;
export interface RepositoryPolicy {
    /** Permitted URL schemes (default: https only). */
    schemes?: string[];
    /** When set, only these hostnames (exact, lowercased) may be fetched. */
    allowHosts?: string[];
    /** Permit literal private / loopback / link-local IP hosts (default false). */
    allowPrivateHosts?: boolean;
}
/**
 * Validate a repository URL before it is fetched. Returns an error message,
 * or `null` when the URL is permitted. Blocks non-permitted schemes,
 * embedded credentials, and — unless explicitly allowed — literal
 * private / loopback / link-local IP hosts (the cloud-metadata and
 * internal-service SSRF surface a standalone CLI has no network sandbox to
 * stop). DNS rebinding is not fully solved at the `fetch` layer; a strict
 * deployment should also pin an `allowHosts` allowlist.
 */
export declare function checkRepositoryUrl(rawUrl: string, policy?: RepositoryPolicy): string | null;
//# sourceMappingURL=security.d.ts.map