/**
 * Transliteration of `ruby-gem/lib/oydid/basic.rb` (the subset resolution
 * needs) from the OYDID reference implementation, pinned at
 * OwnYourData/oydid@48a62c9 (2026-08-27), against the OYDID method
 * specification v0.6 (https://ownyourdata.github.io/oydid/).
 *
 * Function names, argument shapes, return tuples ([value, message]) and
 * control flow mirror the Ruby reference 1:1; every function cites its
 * source (`⇔ file:line`) and, where applicable, the governing spec section.
 * The systematic deltas (sync→async WebCrypto, HTTParty→fetch, the enabled
 * hash-commitment check) are documented in REFERENCE-MAP.md.
 */
import { checkRepositoryUrl, type RepositoryPolicy } from "./security.js";

export const LOCATION_PREFIX = "@";
export const LOCATION_PREFIX_ESCAPED = "%40"; // CGI.escape("@")
export const DEFAULT_LOCATION = "https://oydid.ownyourdata.eu";
export const DEFAULT_DIGEST = "sha2-256";
export const DEFAULT_ENCODING = "base58btc";

/** Multicodec code for an Ed25519 public key (spec §3.1.1 #key_roles). */
export const MULTICODEC_ED25519_PUB = 0xed;
/** Multicodec code for a sha2-256 multihash (spec §4.2.1 #digests). */
export const MULTICODEC_SHA2_256 = 0x12;
/** Ed25519 public keys are 32 bytes. */
const ED25519_KEY_BYTES = 32;

/** Mirrors the reference's `[value, msg]` result pairs. */
export type Tuple<T> = [T | null, string];

export interface OydOptions {
  digest?: string;
  encode?: string;
  followAlsoKnownAs?: boolean;
  log_complete?: boolean;
  strict_create_sig?: boolean;
  /** Verify each honored REVOKE's signature against the version's revocation
   *  key before accepting deactivation or a REVOKE-based UPDATE (spec §4.2.3
   *  #verify_signature). OFF by default = reference parity (the reference
   *  never verifies this); a host opts in via
   *  `getResolver({ strictRevocationSig: true })`. */
  strict_revocation_sig?: boolean;
  /** Resource-bound overrides (defaults: `MAX_LOG_ENTRIES` /
   *  `MAX_PREVIOUS_PER_ENTRY` from security.ts). A deployment may raise or
   *  lower them; exceeding one is an `internalError` (a service limit), never
   *  `invalidDidDocument`. */
  maxLogEntries?: number;
  maxPreviousRefs?: number;
  doc_location?: string;
  log_location?: string;
  location?: string;
  /** Per-request wall-clock/size guards for repo fetches (driver additions). */
  timeoutMs?: number;
  maxResponseBytes?: number;
  /** SSRF / open-fetch policy for repository URLs (security.ts). */
  repositoryPolicy?: RepositoryPolicy;
  /** Resolves a DID Rotation target to its verified DID document (used by
   *  the dag_update rotation branch when followAlsoKnownAs is set) — the
   *  host's own resolver stands in for the reference's
   *  DEFAULT_PUBLIC_RESOLVER HTTP call (REFERENCE-MAP §2); returns null when
   *  the target does not resolve to a valid, id-matching document. */
  resolveRotationTarget?: (
    did: string,
  ) => Promise<Record<string, unknown> | null>;
}

/** ⇔ LOG_HASH_OPTIONS (oydid.rb:38) — every log entry hash uses these. */
export const LOG_HASH_OPTIONS = {
  digest: "sha2-256",
  encode: "base58btc",
} as const satisfies OydOptions;

/* ── multibase (base58btc only — the method default; see REFERENCE-MAP) ── */

const B58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const B58_MAP = new Map([...B58_ALPHABET].map((c, i) => [c, i]));

function base58Encode(bytes: Uint8Array): string {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  const digits: number[] = [];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i] << 8;
      digits[i] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  return (
    "1".repeat(zeros) +
    digits
      .reverse()
      .map((d) => B58_ALPHABET[d])
      .join("")
  );
}

function base58Decode(text: string): Uint8Array {
  let zeros = 0;
  while (zeros < text.length && text[zeros] === "1") zeros++;
  const bytes: number[] = [];
  for (const char of text) {
    const value = B58_MAP.get(char);
    if (value === undefined) throw new Error("invalid base58 character");
    let carry = value;
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  return new Uint8Array([
    ...new Array<number>(zeros).fill(0),
    ...bytes.reverse(),
  ]);
}

/** ⇔ multi_encode (basic.rb:14) · spec §2 #format */
export function multiEncode(
  message: Uint8Array,
  options: OydOptions,
): Tuple<string> {
  const method = options.encode ?? DEFAULT_ENCODING;
  if (method === "base58btc") return ["z" + base58Encode(message), ""];
  return [null, "unsupported encoding: '" + method + "'"];
}

/** The longest multibase value this profile ever decodes: an Ed25519 key is
 *  ~48 base58 chars, a 64-byte signature ~88, a sha2-256 multihash ~48. This
 *  cap is far above every legitimate value and far below the response-size
 *  limit, so it stops a hostile ~1 MB field from driving the O(n²) base58
 *  decode (DoS) before its length is even known. */
const MAX_MULTIBASE_CHARS = 512;

/** ⇔ multi_decode (basic.rb:24) */
export function multiDecode(message: string): Tuple<Uint8Array> {
  // bound the input before the quadratic base58 decode (DoS guard)
  if (message.length > MAX_MULTIBASE_CHARS) {
    return [null, "malformed multibase value (too long)"];
  }
  try {
    if (message.startsWith("z")) return [base58Decode(message.slice(1)), ""];
    return [null, "unsupported multibase prefix"];
  } catch (error) {
    return [null, error instanceof Error ? error.message : "decode error"];
  }
}

/* ── hashing ── */

const utf8 = (text: string) => new TextEncoder().encode(text);

async function sha256(message: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", utf8(message)));
}

/** ⇔ multi_hash (basic.rb:36) · spec §4.2.2 #calculate_hash.
 *  sha2-256 branch only; other digests answer with an error tuple that the
 *  resolver maps to `representationNotSupported` (see REFERENCE-MAP §4). */
export async function multiHash(
  message: string,
  options: OydOptions,
): Promise<Tuple<string>> {
  const method = options.digest ?? DEFAULT_DIGEST;
  let digest: Uint8Array;
  let code: number;
  switch (method) {
    case "sha2-256":
      digest = await sha256(message);
      code = MULTICODEC_SHA2_256;
      break;
    default:
      return [null, "unsupported digest: '" + method + "'"];
  }
  // ⇔ [code, length, digest].pack("CCa#{length}")
  const packed = new Uint8Array(2 + digest.length);
  packed[0] = code;
  packed[1] = digest.length;
  packed.set(digest, 2);
  const encoded = multiEncode(packed, options);
  if (encoded[0] === null) return [null, encoded[1]];
  return [encoded[0], ""];
}

/** ⇔ hash (basic.rb:32) */
export async function hashDefault(message: string): Promise<string | null> {
  return (await multiHash(message, { digest: DEFAULT_DIGEST }))[0];
}

const DIGEST_NAMES: Readonly<Record<number, string>> = {
  0x12: "sha2-256",
  0x13: "sha2-512",
  0x14: "sha3-512",
  0x15: "sha3-384",
  0x16: "sha3-256",
  0x17: "sha3-224",
};

/** ⇔ get_digest (basic.rb:73) · spec §4.2.1 #digests */
export function getDigest(message: string): Tuple<string> {
  const [decoded, error] = multiDecode(message);
  if (decoded === null) return [null, error];
  if (decoded[0] === 0x02 && decoded[1] === 0x10) return ["blake2b-16", ""];
  if (decoded[0] === 0x04 && decoded[1] === 0x20) return ["blake2b-32", ""];
  if (decoded[0] === 0x08 && decoded[1] === 0x40) return ["blake2b-64", ""];
  const code = decoded[0];
  const length = decoded[1];
  // intermediate BLAKE2b sizes carry a code outside the multicodec registry
  // (0x0B–0x11, code = size - 6); require the length byte to match
  if (code >= 0x0b && code <= 0x11 && length === code + 6) {
    return ["blake2b-" + length, ""];
  }
  const name = DIGEST_NAMES[code];
  if (name !== undefined) return [name, ""];
  return [null, "unknown digest"];
}

/** ⇔ get_encoding (basic.rb:107) */
export function getEncoding(message: string): Tuple<string> {
  if (message.startsWith("z")) return ["base58btc", ""];
  return [null, "unsupported multibase prefix"];
}

/* ── canonical JSON ── */

function jcs(value: unknown): string {
  if (value === null || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number") return JSON.stringify(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(jcs).join(",") + "]";
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return (
      "{" +
      keys.map((k) => JSON.stringify(k) + ":" + jcs(record[k])).join(",") +
      "}"
    );
  }
  return "null";
}

/** ⇔ canonical (basic.rb:116) · spec §4.2.2 #calculate_hash step 2.
 *  Ruby's `to_json_c14n` is RFC 8785 (JCS); `jcs` above implements it for
 *  OYDID's data model (objects, arrays, strings, integers, booleans). */
export function canonical(message: unknown): string {
  if (typeof message === "string") {
    try {
      return jcs(JSON.parse(message));
    } catch {
      // ⇔ `JSON.parse(message) rescue message` — a non-JSON string
      // canonicalizes as a JSON string literal
      return jcs(message);
    }
  }
  return jcs(JSON.parse(JSON.stringify(message)));
}

/* ── identifiers and locations ── */

/** ⇔ percent_encode (basic.rb:125).
 *  Fidelity note: Ruby uses `.sub` (first occurrence) for "https://", "@"
 *  and "http://", but `.gsub` (all occurrences) for ":" — `replace` /
 *  `replaceAll` below mirror that split exactly. */
export function percentEncode(did: string): string {
  return did
    .replace("https://", "")
    .replace("@", "%40")
    .replace("http://", "http%3A%2F%2F")
    .replaceAll(":", "%3A")
    .replace("did%3Aoyd%3A", "did:oyd:");
}

/** ⇔ strip_location (basic.rb:1233) */
export function stripLocation(id: string): string {
  return String(id).split(LOCATION_PREFIX)[0].split(LOCATION_PREFIX_ESCAPED)[0];
}

/** ⇔ get_location (basic.rb:1237) */
export function getLocation(id: string): string {
  if (id.includes(LOCATION_PREFIX)) return id.split(LOCATION_PREFIX)[1];
  if (id.includes(LOCATION_PREFIX_ESCAPED)) {
    return id.split(LOCATION_PREFIX_ESCAPED)[1];
  }
  return DEFAULT_LOCATION;
}

/* ── Ed25519 key handling ── */

/** The two second-framing bytes OYDID Ed25519 keys carry after the `0xed`
 *  codec byte: `0x20` is the multihash-style length (32); `0x01` is the
 *  second byte of the unsigned varint of the multicodec code `0xed`
 *  (did:key / multicodec framing). Both wrap the same 32-byte key, and the
 *  reference (`code = first byte, key = last 32`) accepts either. */
const ED25519_FRAMING_BYTES: readonly number[] = [ED25519_KEY_BYTES, 0x01];

/** Decode a multibase public key to its raw 32 Ed25519 bytes. Validates the
 *  multicodec code (`0xed`), the total length (34), and that the framing
 *  byte is one OYDID uses — matching the reference, which works with both
 *  encodings (finding 7/8; REFERENCE-MAP §4). Returns null for p256 and
 *  other codecs (outside the supported profile). */
export function decodeEd25519PublicKey(publicKey: string): Uint8Array | null {
  const [decoded] = multiDecode(publicKey);
  if (decoded === null) return null;
  if (
    decoded.length !== 2 + ED25519_KEY_BYTES ||
    decoded[0] !== MULTICODEC_ED25519_PUB ||
    !ED25519_FRAMING_BYTES.includes(decoded[1] as number)
  ) {
    return null;
  }
  return decoded.slice(2);
}

/** The decoded key as hex for the `publicKeyHex` metadata field. The
 *  reference emits the ORIGINAL decoded bytes
 *  (`multi_decode(key).unpack('H*')`), framing byte included — so a
 *  `0xed 0x20` key is `ed20…` and a `0xed 0x01` key is `ed01…`; this
 *  preserves that byte rather than re-framing. */
export function ed25519KeyFramedHex(publicKey: string): string | null {
  const [decoded] = multiDecode(publicKey);
  if (decoded === null || decodeEd25519PublicKey(publicKey) === null) {
    return null;
  }
  return [...decoded].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** ⇔ verify (basic.rb:494, ed25519-pub branch) · spec §4.2.3
 *  #verify_signature. Strictly validates the key framing (finding 7); the
 *  p256-pub branch is not ported (REFERENCE-MAP §4). */
export async function verify(
  message: string,
  signature: string,
  publicKey: string,
): Promise<Tuple<boolean>> {
  try {
    const digest = decodeEd25519PublicKey(publicKey);
    if (digest === null) return [null, "unsupported key codec"];
    const [sig] = multiDecode(signature);
    if (sig === null || sig.length !== 64) return [false, ""];
    const key = await crypto.subtle.importKey(
      "raw",
      digest as BufferSource,
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    const ok = await crypto.subtle.verify(
      "Ed25519",
      key,
      sig as BufferSource,
      utf8(message) as BufferSource,
    );
    return [ok, ""];
  } catch {
    // ⇔ the reference's blanket `rescue` around the whole method
    return [null, "unknown key codec"];
  }
}

/* ── shared data shapes ── */

/** Log operation codes (spec §4.1 #log_ops; DELEGATE is implementation-
 *  defined in the reference, which compares raw integers with a
 *  `# TERMINATE`-style comment on each). Owned here alongside `LogEntry`;
 *  re-exported from log.ts. */
export const Op = {
  TERMINATE: 0,
  REVOKE: 1,
  CREATE: 2,
  UPDATE: 3,
  CLONE: 4,
  DELEGATE: 5,
} as const;

/** The set of valid operation codes — the closed union a validated
 *  `LogEntry.op` inhabits. */
export type OpCode = (typeof Op)[keyof typeof Op];

const OP_CODES: ReadonlySet<number> = new Set(Object.values(Op));

/** `DidInfo.error` states (⇔ the reference's numeric `currentDID["error"]`;
 *  a closed union rather than bare magic numbers). */
export const DidError = {
  NONE: 0,
  INVALID: 1, // signature / data verification failure
  RETRIEVAL: 2, // document or log could not be retrieved
  NOT_FOUND: 404,
  REVOKED: 410,
} as const;

export type DidErrorCode = (typeof DidError)[keyof typeof DidError];

/** The resolution state `Oydid.read` builds and `dag_update` walks
 *  (⇔ currentDID, oydid.rb:78). Mutated in place, exactly as the
 *  reference mutates its hash. */
export interface DidInfo {
  did: string;
  did_requested?: string;
  doc: DocRecord;
  /** The DAG-ordered, structurally verified log (the delegation-key source;
   *  the reference kept a separate raw `full_log`, dropped here — finding 2). */
  log: LogEntry[];
  doc_log_id: number | null;
  termination_log_id: number | null;
  error: DidErrorCode;
  message: string;
  /** Multibase DOCUMENT keys seen across every verified version during the
   *  walk — the set a pubkey-form identifier must match (spec §3.2.4
   *  #pubkey_identifier). Revocation keys are excluded: the pubkey form is
   *  defined on the document key only. */
  version_document_keys?: string[];
  /** True only when an authenticated DID-Rotation target was actually
   *  resolved through the host's drivers (followAlsoKnownAs). It licenses the
   *  composed document to carry the target's (foreign) `id`; without it the
   *  resolver enforces `document.id === requested did:oyd`, so a payload that
   *  merely *looks* like a DID document cannot spoof a foreign identifier. */
  rotated?: boolean;
}

/** One stored DID document record (`{doc, key, log}`; spec §2 #format). */
export interface DocRecord {
  doc: unknown;
  key: string;
  log: string;
}

/** One provenance-log entry (spec §4.1 #log_ops). `op` is a validated
 *  `OpCode` — `parseLogEntries` rejects unknown codes as malformed. */
export interface LogEntry {
  ts: number;
  op: OpCode;
  doc: string;
  /** Repository entries may carry `sig`/`previous` as null or omit
   *  `previous` entirely; the resolver supports that representation as-is
   *  (every consumer treats a missing `previous` as `[]`), and it is
   *  preserved rather than normalized so hash commitments over the entry
   *  match byte-for-byte (see parseDocRecord's note). */
  sig: string | null;
  previous?: string[] | null;
  [extra: string]: unknown;
}

/** ⇔ getDelegatedPubKeysFromFullDidDocument (basic.rb:366). Retained for
 *  reference parity but deliberately NOT wired into resolution: delegation
 *  is not honored, because the reference never authenticates DELEGATE
 *  entries (its `!!!OPEN` note) — see REFERENCE-MAP §"Security hardening" 2. */
export function getDelegatedPubKeysFromFullDidDocument(
  didDocument: { doc: DocRecord; log?: LogEntry[] },
  keyType: "doc" | "rev" = "doc",
): Tuple<string[]> {
  const keyField = didDocument.doc?.key;
  const keys =
    keyField == null
      ? null
      : keyType === "doc"
        ? [keyField.split(":")[0]]
        : [keyField.split(":")[1]];
  if (keys === null) return [null, "cannot retrieve current key"];

  for (const item of didDocument.log ?? []) {
    if (item.op === 5) {
      // DELEGATE
      const itemKeys = item.doc;
      if (keyType === "doc" && itemKeys.startsWith("doc:")) {
        keys.push(itemKeys.slice(4));
      } else if (keyType === "rev" && itemKeys.startsWith("rev:")) {
        keys.push(itemKeys.slice(4));
      }
    }
  }
  return [[...new Set(keys)], ""];
}

/* ── repository retrieval ── */

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_RESPONSE_BYTES = 1024 * 1024;

/** Read a response body with a hard byte bound, cancelling the stream the
 *  moment it exceeds the limit — the limit bounds downloaded bytes, not
 *  post-decode string length. */
async function readBoundedBody(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array | null> {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/** A lone UTF-16 surrogate half — a high surrogate not followed by a low
 *  one, or a low surrogate not preceded by a high one. `JSON.parse` happily
 *  produces these from `\uD800`-style escapes. */
const LONE_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

/** Reject parsed repository data RFC 8785 cannot canonicalize: non-finite
 *  numbers (`1e999` parses to Infinity) and lone Unicode surrogates (in
 *  values or keys). Canonical JSON feeds identifiers, log hashes and
 *  signature commitments, so hashing a lossy serialization of such input
 *  would be silently wrong — fail closed at the single point where all
 *  repository data enters instead. Iterative walk (no recursion), so deeply
 *  nested hostile JSON cannot overflow the stack. Returns a short reason, or
 *  null when the value is clean. */
function checkIJson(root: unknown): string | null {
  const stack: unknown[] = [root];
  while (stack.length > 0) {
    const value = stack.pop();
    if (typeof value === "number") {
      if (!Number.isFinite(value)) return "non-finite number";
    } else if (typeof value === "string") {
      if (LONE_SURROGATE.test(value)) return "lone Unicode surrogate";
    } else if (Array.isArray(value)) {
      for (const element of value) stack.push(element);
    } else if (typeof value === "object" && value !== null) {
      for (const [key, entry] of Object.entries(value)) {
        if (LONE_SURROGATE.test(key)) return "lone Unicode surrogate";
        stack.push(entry);
      }
    }
  }
  return null;
}

/** Detect duplicate object member names in a VALID JSON text (the caller
 *  runs this only after `JSON.parse` succeeded). I-JSON — which RFC 8785
 *  builds on — forbids duplicate names, but `JSON.parse` silently keeps the
 *  LAST duplicate, so post-parse validation cannot see them: hashing the
 *  collapsed object would accept input a conformant JCS verifier rejects.
 *  Single iterative pass (no recursion), a per-object name `Set` on an
 *  explicit stack; member names are unescaped via `JSON.parse` of the quoted
 *  slice so `"a"` and `"a"` collide as JSON semantics require. */
function hasDuplicateMember(text: string): boolean {
  // stack of open containers: a Set for an object (its seen member names),
  // null for an array
  const stack: Array<Set<string> | null> = [];
  // whether the next string in the current object position is a member name
  let expectKey = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      const start = i;
      i++;
      while (i < text.length) {
        if (text[i] === "\\") i += 2;
        else if (text[i] === '"') break;
        else i++;
      }
      const top = stack[stack.length - 1];
      if (top instanceof Set && expectKey) {
        const name = JSON.parse(text.slice(start, i + 1)) as string;
        if (top.has(name)) return true;
        top.add(name);
        expectKey = false;
      }
    } else if (char === "{") {
      stack.push(new Set());
      expectKey = true;
    } else if (char === "[") {
      stack.push(null);
      expectKey = false;
    } else if (char === "}" || char === "]") {
      stack.pop();
      expectKey = false;
    } else if (char === ",") {
      expectKey = stack[stack.length - 1] instanceof Set;
    }
  }
  return false;
}

/** Infrastructure shared by the three retrieval functions — not part of the
 *  reference surface (HTTParty handles this inline there). Adds the
 *  timeout/size guards a Worker needs when fetching attacker-supplied
 *  custom `%40host` repositories: a declared Content-Length over the limit
 *  is rejected before the body is read, and the body itself is streamed
 *  against a byte counter. */
async function fetchJson(
  url: string,
  options: OydOptions,
): Promise<Tuple<unknown>> {
  const maxBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  // SSRF guard (finding 6): validate the destination before any request,
  // and refuse to follow redirects (which could hop to a blocked host).
  const policyError = checkRepositoryUrl(url, options.repositoryPolicy);
  if (policyError !== null) return [null, policyError];
  try {
    // `redirect: "manual"` (not "error", which the Workers runtime rejects)
    // surfaces a redirect as a 3xx / opaque response instead of following it
    // to a possibly-blocked host — treated as a policy failure below.
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      redirect: "manual",
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
    if (
      response.type === "opaqueredirect" ||
      (response.status >= 300 && response.status < 400)
    ) {
      return [null, "repository redirect not permitted"];
    }
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (declaredLength > maxBytes) {
      return [null, "response too large from " + new URL(url).origin];
    }
    const bytes = await readBoundedBody(response, maxBytes);
    if (bytes === null) {
      return [null, "response too large from " + new URL(url).origin];
    }
    const text = new TextDecoder().decode(bytes);
    if (!response.ok) {
      // Error classification is driven by the HTTP STATUS, never by the
      // repository's message text: the body is repository-controlled, and a
      // hostile repository could otherwise steer the DIF error code by
      // echoing marker substrings ("don't match", "unsupported digest", …)
      // into resolver.ts errorCodeFor. The repo's text is read for exactly
      // one purpose — recognizing the reference's deactivation signal, which
      // is only valid on 410 Gone.
      let repoMessage = "";
      try {
        const body = JSON.parse(text) as { error?: unknown };
        if (typeof body.error === "string") repoMessage = body.error;
      } catch {
        // non-JSON error body — the status alone decides
      }
      if (response.status === 410 && repoMessage === "revoked") {
        // ⇔ the reference repository's deactivation signal (parity)
        return [null, "revoked"];
      }
      if (response.status === 404) return [null, "not found"];
      return [
        null,
        "repository error " + response.status + " from " + new URL(url).origin,
      ];
    }
    const parsed = JSON.parse(text) as unknown;
    const ijson = checkIJson(parsed);
    if (ijson !== null) {
      return [
        null,
        "malformed repository response (" +
          ijson +
          ") from " +
          new URL(url).origin,
      ];
    }
    if (hasDuplicateMember(text)) {
      return [
        null,
        "malformed repository response (duplicate object member) from " +
          new URL(url).origin,
      ];
    }
    return [parsed, ""];
  } catch (error) {
    return [
      null,
      error instanceof Error && error.name === "TimeoutError"
        ? "timeout retrieving " + new URL(url).origin
        : "invalid response from " + url,
    ];
  }
}

/* ── structural validation of repository responses ── */

/** Type guard for the `{doc, key, log}` record shape (spec §2 #format). */
function isDocRecord(value: unknown): value is DocRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record["key"] === "string" &&
    typeof record["log"] === "string" &&
    "doc" in record
  );
}

/** Type guard for one provenance-log entry (spec §4.1 #log_ops). `op` must
 *  be a known `OpCode`: an unknown operation is rejected here rather than
 *  cast, so `LogEntry.op: OpCode` never lies (reviewer #5). */
function isLogEntry(value: unknown): value is LogEntry {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record["ts"] === "number" &&
    Number.isFinite(record["ts"]) &&
    typeof record["op"] === "number" &&
    OP_CODES.has(record["op"]) &&
    typeof record["doc"] === "string" &&
    (typeof record["sig"] === "string" || record["sig"] == null) &&
    (record["previous"] == null ||
      (Array.isArray(record["previous"]) &&
        record["previous"].every((p) => typeof p === "string")))
  );
}

/** A repository response is untrusted input: validate the shape with a type
 *  guard instead of casting (the reference leans on Ruby's dynamic typing
 *  and NoMethodError here). The validated object is returned as-is, NOT
 *  reconstructed to only-known fields: every hash commitment is taken over
 *  the whole record/entry (`canonical(record)`, `canonical(entry)`), so
 *  stripping extra properties would let a repository that *added* fields
 *  pass a commitment computed over the stripped shape. Retaining the exact
 *  bytes is the fail-closed choice here. */
function parseDocRecord(value: unknown, origin: string): Tuple<DocRecord> {
  return isDocRecord(value)
    ? [value, ""]
    : [null, "malformed document record from " + origin];
}

/** Validate a provenance-log array — `Array.every` with a type predicate
 *  narrows the array to `LogEntry[]`, so no assertion is needed. */
function parseLogEntries(value: unknown, origin: string): Tuple<LogEntry[]> {
  if (!Array.isArray(value) || !value.every(isLogEntry)) {
    return [null, "malformed log from " + origin];
  }
  return [value, ""];
}

/** ⇔ the location normalization prologue shared by retrieve_document /
 *  retrieve_document_raw / retrieve_log (https prefix + %-unescaping). */
function normalizeLocation(location: string): string {
  let loc = location === "" ? DEFAULT_LOCATION : location;
  if (!loc.startsWith("http")) loc = "https://" + loc;
  return loc.replace("%3A%2F%2F", "://").replace("%3A", ":");
}

/** Whether the method-specific id is a bare public key rather than a hash
 *  (⇔ `didHash.start_with?("z6M") && length == 48`,
 *  dids_controller.rb:187). */
export function isPubKeyIdentifier(didHash: string): boolean {
  return didHash.startsWith("z6M") && didHash.length === 48;
}

/** A version identifier is the hash of that version's document — verify the
 *  commitment (spec §4.2.2 #calculate_hash). The reference keeps this check
 *  disabled (commented out in dag_update) because its repository guarantees
 *  it at write time; an independent resolver must not extend that trust —
 *  REFERENCE-MAP §1. Applied to the version-exact `/doc_raw` responses
 *  only: `/doc/{id}` deliberately serves the LATEST document for old
 *  version identifiers (observed on the spec's own updated-DID sample), so
 *  the initial fetch is bound to the identifier through the verified log
 *  chain instead (see resolver.ts). */
async function verifyDocCommitment(
  identifier: string,
  doc: DocRecord,
): Promise<Tuple<boolean>> {
  if (isPubKeyIdentifier(identifier)) {
    const docKey = String(doc.key ?? "").split(":")[0];
    if (docKey !== identifier) {
      return [null, "DID identifier and DID document don't match"];
    }
    return [true, ""];
  }
  const digest = getDigest(identifier);
  const encoding = getEncoding(identifier);
  if (digest[0] === null) return [null, digest[1]];
  if (encoding[0] === null) return [null, encoding[1]];
  const computed = await multiHash(canonical(doc), {
    digest: digest[0],
    encode: encoding[0],
  });
  if (computed[0] === null) return [null, computed[1]];
  if (computed[0] !== identifier) {
    return [null, "DID identifier and DID document don't match"];
  }
  return [true, ""];
}

/** ⇔ retrieve_document (basic.rb:1251, HTTP branch) · spec §3.2.5
 *  #http_binding. No hash commitment here: `/doc/{id}` serves the latest
 *  document for an old version identifier by design (see
 *  verifyDocCommitment above) — the identifier is instead bound to the
 *  verified log chain in resolver.ts. */
export async function retrieveDocument(
  docIdentifier: string,
  docLocation: string,
  options: OydOptions,
): Promise<Tuple<DocRecord>> {
  const location = normalizeLocation(docLocation);
  // ⇔ `option_str = "?followAlsoKnownAs=true"` (basic.rb:1288)
  const optionQuery = options.followAlsoKnownAs
    ? "?followAlsoKnownAs=true"
    : "";
  const [body, message] = await fetchJson(
    location + "/doc/" + docIdentifier + optionQuery,
    options,
  );
  if (body === null) return [null, message];
  return parseDocRecord(body, location);
}

/** ⇔ retrieve_document_raw (basic.rb:1296, HTTP branch) — plus the enabled
 *  version-hash commitment check (`/doc_raw` is version-exact). */
export async function retrieveDocumentRaw(
  docHash: string,
  docLocation: string,
  options: OydOptions,
): Promise<Tuple<{ doc: DocRecord; log: LogEntry[] }>> {
  const hash = stripLocation(docHash).replace(/^did:oyd:/, "");
  const location = normalizeLocation(docLocation);
  const [body, message] = await fetchJson(
    location + "/doc_raw/" + hash,
    options,
  );
  if (body === null) return [null, message];
  const shell =
    typeof body === "object" && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  if (shell === null)
    return [null, "malformed document record from " + location];
  const [doc, docMessage] = parseDocRecord(shell["doc"], location);
  if (doc === null) return [null, docMessage];
  const [log, logMessage] = parseLogEntries(shell["log"] ?? [], location);
  if (log === null) return [null, logMessage];
  const committed = await verifyDocCommitment(hash, doc);
  if (committed[0] === null) return [null, committed[1]];
  return [{ doc, log }, ""];
}

/** ⇔ retrieve_log (log.rb:26, HTTP branch) · spec §4.2.4 #retrieve_log */
export async function retrieveLog(
  didHash: string,
  logLocation: string,
  options: OydOptions,
): Promise<Tuple<LogEntry[]>> {
  const location = normalizeLocation(logLocation);
  const [body, message] = await fetchJson(
    location + "/log/" + didHash,
    options,
  );
  if (body === null) return [null, message];
  return parseLogEntries(body, location);
}
