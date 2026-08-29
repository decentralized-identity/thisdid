/**
 * Resolver-side security hardening that has no counterpart in the reference
 * (which relies on Ruby's dynamic typing and a trusted first-party
 * repository). Everything here fails CLOSED: it can only turn malformed or
 * hostile input into a rejection, never change the resolution of a valid
 * DID. See REFERENCE-MAP.md "Security hardening (beyond the reference)".
 */
/* ── resource bounds (finding 5: resource exhaustion) ── */
/** A provenance log longer than this is rejected outright — real DIDs have a
 *  handful of entries, and the bound caps graph work and `/doc_raw` fetches
 *  (one per CREATE/UPDATE/TERMINATE the walk installs). */
export const MAX_LOG_ENTRIES = 1024;
/** Maximum `previous` back-references per log entry (caps edge count). */
export const MAX_PREVIOUS_PER_ENTRY = 128;
/** Maximum DID-Rotation hops followed before giving up (loop protection). */
export const MAX_ROTATION_DEPTH = 5;
const PRIVATE_V4 = /^(0\.|127\.|10\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;
const LOOPBACK_OR_UNSPEC_V6 = new Set(["::1", "::", "::0"]);
function isPrivateHost(hostname) {
    const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
    if (host === "localhost" || host.endsWith(".localhost"))
        return true;
    if (PRIVATE_V4.test(host))
        return true;
    if (LOOPBACK_OR_UNSPEC_V6.has(host))
        return true;
    // IPv6 unique-local (fc00::/7) and link-local (fe80::/10)
    if (/^f[cd]/.test(host) || /^fe[89ab]/.test(host))
        return true;
    return false;
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
export function checkRepositoryUrl(rawUrl, policy = {}) {
    let url;
    try {
        url = new URL(rawUrl);
    }
    catch {
        return "invalid repository URL";
    }
    const schemes = policy.schemes ?? ["https:"];
    if (!schemes.includes(url.protocol)) {
        return "repository scheme not permitted: " + url.protocol;
    }
    if (url.username !== "" || url.password !== "") {
        return "repository URL must not contain credentials";
    }
    const host = url.hostname.toLowerCase();
    if (policy.allowHosts && !policy.allowHosts.includes(host)) {
        return "repository host not in allowlist: " + host;
    }
    if (!policy.allowPrivateHosts && isPrivateHost(host)) {
        return "repository host not permitted: " + host;
    }
    return null;
}
//# sourceMappingURL=security.js.map