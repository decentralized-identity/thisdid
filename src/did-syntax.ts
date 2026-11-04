/**
 * DID and DID URL syntax — the gate every resolution request passes before it
 * is resolved or recorded.
 *
 * DID Core 1.0, §3.1 DID Syntax and §3.2 DID URL Syntax:
 *
 *   did                = "did:" method-name ":" method-specific-id
 *   method-name        = 1*method-char
 *   method-char        = %x61-7A / DIGIT
 *   method-specific-id = *( *idchar ":" ) 1*idchar
 *   idchar             = ALPHA / DIGIT / "." / "-" / "_" / pct-encoded
 *   pct-encoded        = "%" HEXDIG HEXDIG
 *   did-url            = did path-abempty [ "?" query ] [ "#" fragment ]
 *
 * with path-abempty, query and fragment as in RFC 3986 §3.3–3.5
 * (pchar = unreserved / pct-encoded / sub-delims / ":" / "@").
 *
 * Anything else is not a DID or DID URL, and the resolver answers
 * `invalidDid` without resolving it — scanner payloads (path traversal, SQL
 * and command injection, XSS probes) never reach a resolver or the analytics
 * log. Whether a DID's method is supported is a separate, later question.
 */

const IDCHAR = "(?:[A-Za-z0-9._-]|%[0-9A-Fa-f]{2})";
const PCHAR = "(?:[A-Za-z0-9\\-._~!$&'()*+,;=:@]|%[0-9A-Fa-f]{2})";

const DID_URL = new RegExp(
  `^did:([a-z0-9]+):(?:${IDCHAR}*:)*${IDCHAR}+` + // did
    `(?:/${PCHAR}*)*` + // path-abempty
    `(?:\\?(?:${PCHAR}|[/?])*)?` + // [ "?" query ]
    `(?:#(?:${PCHAR}|[/?])*)?$`, // [ "#" fragment ]
);

/** The method name of a syntactically valid DID or DID URL, otherwise null. */
export function didMethod(input: string): string | null {
  return DID_URL.exec(input)?.[1] ?? null;
}

/** True when `input` is a DID or DID URL per DID Core §3.1 / §3.2. */
export function isDidOrDidUrl(input: string): boolean {
  return DID_URL.test(input);
}
