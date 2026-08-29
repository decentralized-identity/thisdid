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

/** ⇔ multi_decode (basic.rb:24) */
export function multiDecode(message: string): Tuple<Uint8Array> {
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

/** Decode a multibase public key to its raw 32 Ed25519 bytes, validating
 *  BOTH the multicodec code AND the declared length byte (finding 7/8: the
 *  reference accepts any 34-byte `0xed…` value and ignores the length byte).
 *  Returns null for anything that is not a well-formed Ed25519 key —
 *  including the p256 and other codecs, which are not part of the supported
 *  profile (REFERENCE-MAP §4). */
export function decodeEd25519PublicKey(publicKey: string): Uint8Array | null {
  const [decoded] = multiDecode(publicKey);
  if (decoded === null) return null;
  // varint(0xed) is the two bytes 0xed 0x01; the multihash-style prefix used
  // by OYDID keys is [code, length, …32 bytes]
  if (
    decoded.length !== 2 + ED25519_KEY_BYTES ||
    decoded[0] !== MULTICODEC_ED25519_PUB ||
    decoded[1] !== ED25519_KEY_BYTES
  ) {
    return null;
  }
  return decoded.slice(2);
}

/** The 34-byte multicodec-framed form of a validated Ed25519 key (for the
 *  `publicKeyHex` metadata field, which the reference emits code+length
 *  included). */
export function ed25519KeyFramedHex(publicKey: string): string | null {
  const raw = decodeEd25519PublicKey(publicKey);
  if (raw === null) return null;
  const framed = new Uint8Array([
    MULTICODEC_ED25519_PUB,
    ED25519_KEY_BYTES,
    ...raw,
  ]);
  return [...framed].map((b) => b.toString(16).padStart(2, "0")).join("");
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
  error: number;
  message: string;
}

/** One stored DID document record (`{doc, key, log}`; spec §2 #format). */
export interface DocRecord {
  doc: unknown;
  key: string;
  log: string;
}

/** One provenance-log entry (spec §4.1 #log_ops). */
export interface LogEntry {
  ts: number;
  op: number;
  doc: string;
  sig: string | null;
  previous: string[];
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
      // ⇔ `retVal.parsed_response["error"].to_s rescue ""` + fallback
      let message = "";
      try {
        const body = JSON.parse(text) as { error?: unknown };
        if (typeof body.error === "string") message = body.error;
      } catch {
        // non-JSON error body — fall through to the generic message
      }
      if (message === "") message = "invalid response from " + url;
      return [null, message];
    }
    return [JSON.parse(text) as unknown, ""];
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

/** A repository response is untrusted input: validate the `{doc, key, log}`
 *  record shape instead of casting (the reference leans on Ruby's dynamic
 *  typing and NoMethodError here). */
function parseDocRecord(value: unknown, origin: string): Tuple<DocRecord> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return [null, "malformed document record from " + origin];
  }
  const record = value as Record<string, unknown>;
  if (typeof record["key"] !== "string" || typeof record["log"] !== "string") {
    return [null, "malformed document record from " + origin];
  }
  if (!("doc" in record)) {
    return [null, "malformed document record from " + origin];
  }
  return [record as unknown as DocRecord, ""];
}

/** Validate a provenance-log array (`{ts, op, doc, sig, previous[]}` per
 *  entry — spec §4.1 #log_ops). */
function parseLogEntries(value: unknown, origin: string): Tuple<LogEntry[]> {
  if (!Array.isArray(value)) return [null, "malformed log from " + origin];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) {
      return [null, "malformed log from " + origin];
    }
    const record = entry as Record<string, unknown>;
    if (
      typeof record["ts"] !== "number" ||
      typeof record["op"] !== "number" ||
      typeof record["doc"] !== "string" ||
      !(typeof record["sig"] === "string" || record["sig"] == null) ||
      !(
        record["previous"] == null ||
        (Array.isArray(record["previous"]) &&
          (record["previous"] as unknown[]).every((p) => typeof p === "string"))
      )
    ) {
      return [null, "malformed log from " + origin];
    }
  }
  return [value as LogEntry[], ""];
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
