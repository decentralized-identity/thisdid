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
import { type RepositoryPolicy } from "./security.js";
export declare const LOCATION_PREFIX = "@";
export declare const LOCATION_PREFIX_ESCAPED = "%40";
export declare const DEFAULT_LOCATION = "https://oydid.ownyourdata.eu";
export declare const DEFAULT_DIGEST = "sha2-256";
export declare const DEFAULT_ENCODING = "base58btc";
/** Multicodec code for an Ed25519 public key (spec §3.1.1 #key_roles). */
export declare const MULTICODEC_ED25519_PUB = 237;
/** Multicodec code for a sha2-256 multihash (spec §4.2.1 #digests). */
export declare const MULTICODEC_SHA2_256 = 18;
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
    resolveRotationTarget?: (did: string) => Promise<Record<string, unknown> | null>;
}
/** ⇔ LOG_HASH_OPTIONS (oydid.rb:38) — every log entry hash uses these. */
export declare const LOG_HASH_OPTIONS: {
    readonly digest: "sha2-256";
    readonly encode: "base58btc";
};
/** ⇔ multi_encode (basic.rb:14) · spec §2 #format */
export declare function multiEncode(message: Uint8Array, options: OydOptions): Tuple<string>;
/** ⇔ multi_decode (basic.rb:24) */
export declare function multiDecode(message: string): Tuple<Uint8Array>;
/** ⇔ multi_hash (basic.rb:36) · spec §4.2.2 #calculate_hash.
 *  sha2-256 branch only; other digests answer with an error tuple that the
 *  resolver maps to `representationNotSupported` (see REFERENCE-MAP §4). */
export declare function multiHash(message: string, options: OydOptions): Promise<Tuple<string>>;
/** ⇔ hash (basic.rb:32) */
export declare function hashDefault(message: string): Promise<string | null>;
/** ⇔ get_digest (basic.rb:73) · spec §4.2.1 #digests */
export declare function getDigest(message: string): Tuple<string>;
/** ⇔ get_encoding (basic.rb:107) */
export declare function getEncoding(message: string): Tuple<string>;
/** ⇔ canonical (basic.rb:116) · spec §4.2.2 #calculate_hash step 2.
 *  Ruby's `to_json_c14n` is RFC 8785 (JCS); `jcs` above implements it for
 *  OYDID's data model (objects, arrays, strings, integers, booleans). */
export declare function canonical(message: unknown): string;
/** ⇔ percent_encode (basic.rb:125).
 *  Fidelity note: Ruby uses `.sub` (first occurrence) for "https://", "@"
 *  and "http://", but `.gsub` (all occurrences) for ":" — `replace` /
 *  `replaceAll` below mirror that split exactly. */
export declare function percentEncode(did: string): string;
/** ⇔ strip_location (basic.rb:1233) */
export declare function stripLocation(id: string): string;
/** ⇔ get_location (basic.rb:1237) */
export declare function getLocation(id: string): string;
/** Decode a multibase public key to its raw 32 Ed25519 bytes, validating
 *  BOTH the multicodec code AND the declared length byte (finding 7/8: the
 *  reference accepts any 34-byte `0xed…` value and ignores the length byte).
 *  Returns null for anything that is not a well-formed Ed25519 key —
 *  including the p256 and other codecs, which are not part of the supported
 *  profile (REFERENCE-MAP §4). */
export declare function decodeEd25519PublicKey(publicKey: string): Uint8Array | null;
/** The 34-byte multicodec-framed form of a validated Ed25519 key (for the
 *  `publicKeyHex` metadata field, which the reference emits code+length
 *  included). */
export declare function ed25519KeyFramedHex(publicKey: string): string | null;
/** ⇔ verify (basic.rb:494, ed25519-pub branch) · spec §4.2.3
 *  #verify_signature. Strictly validates the key framing (finding 7); the
 *  p256-pub branch is not ported (REFERENCE-MAP §4). */
export declare function verify(message: string, signature: string, publicKey: string): Promise<Tuple<boolean>>;
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
export declare function getDelegatedPubKeysFromFullDidDocument(didDocument: {
    doc: DocRecord;
    log?: LogEntry[];
}, keyType?: "doc" | "rev"): Tuple<string[]>;
/** Whether the method-specific id is a bare public key rather than a hash
 *  (⇔ `didHash.start_with?("z6M") && length == 48`,
 *  dids_controller.rb:187). */
export declare function isPubKeyIdentifier(didHash: string): boolean;
/** ⇔ retrieve_document (basic.rb:1251, HTTP branch) · spec §3.2.5
 *  #http_binding. No hash commitment here: `/doc/{id}` serves the latest
 *  document for an old version identifier by design (see
 *  verifyDocCommitment above) — the identifier is instead bound to the
 *  verified log chain in resolver.ts. */
export declare function retrieveDocument(docIdentifier: string, docLocation: string, options: OydOptions): Promise<Tuple<DocRecord>>;
/** ⇔ retrieve_document_raw (basic.rb:1296, HTTP branch) — plus the enabled
 *  version-hash commitment check (`/doc_raw` is version-exact). */
export declare function retrieveDocumentRaw(docHash: string, docLocation: string, options: OydOptions): Promise<Tuple<{
    doc: DocRecord;
    log: LogEntry[];
}>>;
/** ⇔ retrieve_log (log.rb:26, HTTP branch) · spec §4.2.4 #retrieve_log */
export declare function retrieveLog(didHash: string, logLocation: string, options: OydOptions): Promise<Tuple<LogEntry[]>>;
//# sourceMappingURL=basic.d.ts.map