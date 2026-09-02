/**
 * Transliteration of `resolution_result`
 * (uniresolver-plugin/app/controllers/dids_controller.rb:180) from the
 * OYDID reference, pinned at OwnYourData/oydid@48a62c9, exposed through the
 * DIF did-resolver interface (spec v0.6 §3.2.1 #resolution_result, §3.2.3
 * #deactivation). The legacy-resolver fallback is not ported
 * (REFERENCE-MAP §3); the alsoKnownAs DID-Rotation follow is an explicit
 * host opt-in, OFF by default, delivered through the host's own Resolvable
 * (REFERENCE-MAP §2) — a universal-resolver driver answers only for the
 * requested DID, while a standalone host (e.g. a local CLI) may follow.
 */
import type {
  DIDDocument,
  DIDResolutionResult,
  ParsedDID,
  Resolvable,
  ResolverRegistry,
} from "did-resolver";
import {
  decodeEd25519PublicKey,
  DidError,
  ed25519KeyFramedHex,
  getDigest,
  getEncoding,
  getLocation,
  isPubKeyIdentifier,
  stripLocation,
  type DidInfo,
  type OydOptions,
} from "./basic.js";
import { MAX_ROTATION_DEPTH, type RepositoryPolicy } from "./security.js";
import { Op, REVOKED_ERROR_CODE } from "./log.js";
import { read } from "./read.js";
import {
  documentId,
  versionIds,
  versionMetadata,
  w3c,
  type W3cDocument,
} from "./w3c.js";

/** The DIF DID-resolution error codes this driver emits. */
type DifErrorCode =
  | "invalidDid"
  | "invalidDidDocument"
  | "notFound"
  | "representationNotSupported"
  | "internalError";

function errorResult(
  error: DifErrorCode,
  message?: string,
): DIDResolutionResult {
  return {
    didResolutionMetadata: { error, ...(message ? { message } : {}) },
    didDocument: null,
    didDocumentMetadata: {},
  };
}

/** Reference error strings that mean "this representation is not ported"
 *  rather than "this DID does not resolve" (REFERENCE-MAP §4). */
const UNSUPPORTED_MARKERS = [
  "unsupported digest",
  "unsupported encoding",
  "unsupported multibase",
  "unsupported key codec",
  "unknown digest",
] as const;

/** Failures of the DID's own data — signatures, commitments, log
 *  structure — as opposed to a genuinely absent DID. */
const INVALID_MARKERS = [
  "don't match",
  "does not match",
  "does not commit",
  "ambiguous",
  "malformed",
  "wrong number of CREATE",
  "missing TERMINATE",
  "missing signature",
  "cannot resolve DID",
  "unauthorized UPDATE",
  "duplicate log entry",
  "dangling back-reference",
] as const;

/** Transport problems — the repository could not be consulted at all,
 *  including policy refusals (SSRF guard) and revocation-lookup failures. */
const TRANSPORT_MARKERS = [
  "timeout retrieving",
  "invalid response from",
  "response too large",
  "repository ", // SSRF policy (checkRepositoryUrl)
  "revocation log unavailable",
  "log entries exceed",
  "too many back-references",
] as const;

/** DIF error taxonomy (REFERENCE-MAP §8) — the reference HTTP API can only
 *  distinguish 404/410/500; the DIF interface has codes for what actually
 *  happened, so verification failures, transport failures and absent DIDs
 *  are reported distinctly. */
function errorCodeFor(message: string): DifErrorCode {
  if (UNSUPPORTED_MARKERS.some((marker) => message.includes(marker))) {
    return "representationNotSupported";
  }
  if (INVALID_MARKERS.some((marker) => message.includes(marker))) {
    return "invalidDidDocument";
  }
  if (TRANSPORT_MARKERS.some((marker) => message.includes(marker))) {
    return "internalError";
  }
  return "notFound";
}

const keyHex = (key: string): string | null => {
  const raw = decodeEd25519PublicKey(key);
  return raw === null
    ? null
    : [...raw].map((b) => b.toString(16).padStart(2, "0")).join("");
};

/** Spec §3.2.4 (#pubkey_identifier): a pubkey-form identifier binds iff its
 *  raw key equals the DOCUMENT public key of some verified version (both
 *  framings compared as raw bytes). The revocation key is NOT an identifier
 *  form, so only the document half of each version's `docKey:revKey` counts.
 *  Falls back to the current document's key (split[0]) if no version history
 *  was recorded. */
function pubkeyBindsToVersion(identifier: string, result: DidInfo): boolean {
  const idHex = keyHex(identifier);
  if (idHex === null) return false;
  const documentKeys =
    result.version_document_keys && result.version_document_keys.length > 0
      ? result.version_document_keys
      : result.doc.key.split(":").slice(0, 1);
  return documentKeys.some((key) => keyHex(key) === idHex);
}

/** The composed document is an open shape; the DIF interface wants a
 *  DIDDocument. Guard the one invariant that matters (`id` is a string)
 *  instead of blind-casting. */
function asDidDocument(document: W3cDocument): DIDDocument | null {
  return typeof document["id"] === "string"
    ? (document as unknown as DIDDocument)
    : null;
}

/** Host-facing configuration (a DIF driver defaults to answering only for
 *  the requested DID; a standalone host such as a CLI opts into following
 *  DID Rotation through its own registered drivers). */
export interface OydResolverOptions {
  /** Follow a revoked DID's alsoKnownAs rotation (⇔ the reference
   *  resolver's FOLLOW_ALSOKNOWNAS, which defaults to true there). */
  followAlsoKnownAs?: boolean;
  /** Verify each honored REVOKE's signature against the version's revocation
   *  key AND its `doc` commitment to the revoked version's `{doc, key}`
   *  (spec §4.1 / §4.2.3). **ON by default** — the method author ruled these
   *  checks mandatory (D2/D3): the reference is adopting them as its own
   *  default, and every one of the 1,117 production revocations passes both,
   *  so nothing legitimate breaks. Set `false` to opt OUT into the legacy
   *  reference-parity behavior (hash-commitment trust only) — useful for
   *  parity testing against a pre-0.9.4 reference. */
  strictRevocationSig?: boolean;
  /** Bind a pubkey-form (`z6M…`) identifier to a document key of the DID's
   *  verified history before serving it. **OFF by default** — the method
   *  author ruled (D8) that the pubkey form is a repository lookup, NOT
   *  self-certifying, so the default follows the reference; callers needing
   *  self-certification should use the hash form. Opting in rejects
   *  repository-trust-only aliases (the `z6MkrJVn…` shape) as
   *  `invalidDidDocument`. */
  strictPubkeyBinding?: boolean;
  /** Override the resource bounds (defaults from security.ts). Exceeding one
   *  is an `internalError` (a service limit), not `invalidDidDocument`. */
  maxLogEntries?: number;
  maxPreviousRefs?: number;
  /** Repository-fetch SSRF policy (scheme list, host allowlist, private-host
   *  toggle). Default: https-only, no private/loopback/link-local/mapped
   *  hosts. A strict deployment should pin `allowHosts`. */
  repositoryPolicy?: RepositoryPolicy;
}

/** ⇔ resolution_result (dids_controller.rb:180). DID-URL fragments are the
 *  caller's layer (see dereferenceFragment below). */
export async function resolutionResult(
  did: string,
  config: OydResolverOptions = {},
  resolveRotationTarget?: OydOptions["resolveRotationTarget"],
): Promise<DIDResolutionResult> {
  const options: OydOptions = {};
  const didHash = stripLocation(did).replace(/^did:oyd:/, "");

  // check for pub-key identifier (⇔ dids_controller.rb:187)
  if (!isPubKeyIdentifier(didHash)) {
    options.digest = getDigest(didHash)[0] ?? undefined;
    options.encode = getEncoding(didHash)[0] ?? undefined;
  }
  // rotation targets resolve through the host's own drivers; without the
  // opt-in, a driver answers for the requested DID only
  options.followAlsoKnownAs = config.followAlsoKnownAs === true;
  if (options.followAlsoKnownAs && resolveRotationTarget) {
    options.resolveRotationTarget = resolveRotationTarget;
  }
  // strict revocation checks default ON (author's D2/D3 rulings — mandatory
  // intent, zero production breakage); `false` opts out into legacy parity
  options.strict_revocation_sig = config.strictRevocationSig !== false;
  // pubkey binding defaults OFF (author's D8 ruling — the pubkey form is a
  // repository lookup, not self-certifying); an explicit opt-in binds
  if (config.strictPubkeyBinding === true) {
    options.strict_pubkey_binding = true;
  }
  if (config.maxLogEntries !== undefined) {
    options.maxLogEntries = config.maxLogEntries;
  }
  if (config.maxPreviousRefs !== undefined) {
    options.maxPreviousRefs = config.maxPreviousRefs;
  }
  if (config.repositoryPolicy !== undefined) {
    options.repositoryPolicy = config.repositoryPolicy;
  }

  let result: DidInfo | null;
  let readMessage: string;
  try {
    [result, readMessage] = await read(did, options);
  } catch (error) {
    // ⇔ `(Oydid.read(did, options) rescue [nil, ""])` — with the exception
    // message preserved for diagnostics rather than discarded (the shape
    // validation in basic.ts makes this a genuine last resort)
    [result, readMessage] = [null, error instanceof Error ? error.message : ""];
  }

  // A revoked DID is reported two ways: as error 410 when this process
  // resolved the log itself, and as the message "revoked" when the hosting
  // repository answered 410 (⇔ dids_controller.rb:195)
  const revoked =
    (result !== null && result.error === REVOKED_ERROR_CODE) ||
    readMessage === "revoked";
  if (revoked) {
    // A revoked DID resolves successfully — the answer is "deactivated",
    // not "not found" (DID Core 7.1.3; spec §3.2.3 #deactivation)
    return {
      didDocument: null,
      didResolutionMetadata: {},
      didDocumentMetadata: { deactivated: true },
    };
  }
  if (result === null) {
    return errorResult(
      errorCodeFor(readMessage),
      readMessage !== "" ? readMessage : undefined,
    );
  }
  if (result.error !== DidError.NONE) {
    return errorResult(
      result.error === DidError.NOT_FOUND
        ? "notFound"
        : errorCodeFor(result.message),
      result.message,
    );
  }

  // Identifier binding (REFERENCE-MAP §1): `/doc/{id}` serves the latest
  // document, so the REQUESTED identifier must be bound to the verified
  // chain. A hash-form identifier must appear as a version (a CREATE/UPDATE
  // entry's doc) in the walked log. A pubkey-form identifier (spec §3.2.4)
  // must equal a document key of SOME version in the verified history —
  // compared on the raw 32 key bytes so the two framings (`0xed 0x20` /
  // `0xed 0x01`) match, and across all versions so a rotated key still binds.
  // Pubkey-form binding is applied only under `strictPubkeyBinding` — the
  // author's D8 ruling: the pubkey form is a repository lookup, NOT
  // self-certifying (callers needing self-certification use the hash form),
  // so the DEFAULT follows the reference. Hash-form identifiers stay bound
  // to the verified chain unconditionally (they ARE self-certifying).
  const bound = isPubKeyIdentifier(didHash)
    ? options.strict_pubkey_binding !== true ||
      pubkeyBindsToVersion(didHash, result)
    : (result.log ?? []).some(
        (el) =>
          (el.op === Op.CREATE || el.op === Op.UPDATE) &&
          stripLocation(el.doc).replace(/^did:oyd:/, "") === didHash,
      );
  if (!bound) {
    return errorResult(
      "invalidDidDocument",
      "DID identifier and DID document don't match",
    );
  }

  const [pubDocKey = "", pubRevKey = ""] = result.doc.key.split(":");
  // ⇔ the keys array (dids_controller.rb:266) — publicKeyHex is the
  // code+length-framed key. BOTH keys are strictly validated (finding 8):
  // an unsupported doc key is representationNotSupported, an invalid
  // revocation key is a defective document, never a silent empty hex.
  const docKeyHex = ed25519KeyFramedHex(pubDocKey);
  if (docKeyHex === null) {
    // p256-pub and other codecs are not ported (REFERENCE-MAP §4)
    return errorResult("representationNotSupported", "unsupported key codec");
  }
  const revKeyHex = ed25519KeyFramedHex(pubRevKey);
  if (revKeyHex === null) {
    return errorResult("invalidDidDocument", "invalid revocation key");
  }
  const keys = [
    {
      kid: documentId(result) + "#key-doc",
      kms: "local",
      type: "Ed25519",
      publicKeyHex: docKeyHex,
    },
    {
      kid: documentId(result) + "#key-rev",
      kms: "local",
      type: "Ed25519",
      publicKeyHex: revKeyHex,
    },
  ];

  // ⇔ `Oydid.w3c(Marshal.load(Marshal.dump(result)), {})` — the deep copy
  // keeps w3c's in-place payload edits away from the metadata below
  const composed = w3c(structuredClone(result), {});
  if (!composed.ok) {
    return errorResult("representationNotSupported", composed.error);
  }
  const document = asDidDocument(composed.document);
  if (document === null) {
    return errorResult("invalidDidDocument");
  }

  // Identity invariant: a did:oyd must resolve to a document whose `id` IS
  // the requested did:oyd — compared EXACTLY against `documentId(result)`
  // (the percent-encoded DID URI, location suffix included), which is what
  // legitimate composition always produces. The stored payload is untrusted —
  // a payload shaped like a W3C DID document (w3c's already-a-DID
  // passthrough) or one carrying its own `id` (the service merge) could
  // otherwise set the output `id` to a foreign identifier, a bare non-DID
  // string, or a same-key-different-location variant. The only license to
  // carry a foreign `id` is an authenticated DID-Rotation actually followed
  // through the host's drivers (`result.rotated`).
  if (result.rotated !== true && document.id !== documentId(result)) {
    return errorResult(
      "invalidDidDocument",
      "resolved document id does not match the requested DID",
    );
  }

  // Authority invariant: the composed document must still carry the
  // AUTHORITATIVE verification methods the verified log says control this
  // DID — not merely the key bytes somewhere. Composition itself is kept
  // byte-identical to the reference (its payload merge lets `inner` fields
  // override), so a committed payload could otherwise REPLACE
  // `verificationMethod` — or retain the real key bytes only in inert
  // methods with foreign ids/controllers/types while the authoritative
  // `#key-doc`/`#key-rev` disappear (reachable for pubkey-form ids, whose
  // creator knows the id in advance). Guard, don't rewrite: unless an
  // authenticated rotation was followed, each required method must exist
  // with its exact id, this DID as controller, the profile's type, and the
  // matching raw key bytes (so either Ed25519 framing passes); otherwise
  // fail closed.
  if (result.rotated !== true) {
    const did = documentId(result);
    const methods = Array.isArray(document.verificationMethod)
      ? document.verificationMethod
      : [];
    // a null / non-object entry is a malformed document — and unguarded
    // property access on it would THROW outside read()'s try/catch,
    // rejecting the resolve promise instead of returning a DID error
    const wellFormed = methods.every(
      (entry) => typeof entry === "object" && entry !== null,
    );
    const authoritative: ReadonlyArray<[string, string]> = [
      [did + "#key-doc", pubDocKey],
      [did + "#key-rev", pubRevKey],
    ];
    const survives =
      wellFormed &&
      authoritative.every(([methodId, expectedKey]) => {
        // EXACTLY one method may carry the authoritative id: with a
        // duplicate (first occurrence valid, second attacker-controlled) a
        // relying party's selection is ambiguous — different consumers pick
        // different entries — so a duplicated id fails the invariant.
        const matches = methods.filter((entry) => entry.id === methodId);
        if (matches.length !== 1) return false;
        const method = matches[0];
        const expectedHex = keyHex(expectedKey);
        return (
          method.controller === did &&
          method.type === "Ed25519VerificationKey2020" &&
          expectedHex !== null &&
          keyHex(String(method.publicKeyMultibase ?? "")) === expectedHex
        );
      });
    if (!survives) {
      return errorResult(
        "invalidDidDocument",
        "resolved document does not carry the DID's verified keys",
      );
    }
  }

  const didDocumentMetadata: Record<string, unknown> = {
    keys,
    registry: getLocation(String(result.did)),
    log_hash: String(result.doc.log),
    log: result.log,
    document_log_id: result.doc_log_id ?? 0,
    termination_log_id: result.termination_log_id ?? 0,
  };
  const [canonicalId, equivalentIds] = versionIds(result);
  didDocumentMetadata["canonicalId"] = canonicalId;
  if (equivalentIds.length > 0) {
    didDocumentMetadata["equivalentId"] = equivalentIds;
  }
  for (const [key, value] of Object.entries(versionMetadata(result))) {
    didDocumentMetadata[key] = value;
  }

  return {
    didResolutionMetadata: { contentType: "application/did+ld+json" },
    didDocument: document,
    didDocumentMetadata,
  };
}

async function resolveOyd(
  did: string,
  parsed: ParsedDID,
  resolver: Resolvable,
  config: OydResolverOptions,
): Promise<DIDResolutionResult> {
  if (parsed.method !== "oyd" || parsed.id === "") {
    return errorResult("invalidDid");
  }
  // rotation targets resolve through the parent Resolvable — the host's own
  // driver registry stands in for the reference's DEFAULT_PUBLIC_RESOLVER.
  // A host driver is not trusted blindly (finding 10): the target must
  // resolve without error to a structurally valid document whose `id`
  // equals the requested rotation DID, within a bounded number of hops.
  let rotationHops = 0;
  const resolveRotationTarget: OydOptions["resolveRotationTarget"] = async (
    rotateDID,
  ) => {
    if (++rotationHops > MAX_ROTATION_DEPTH) return null;
    const rotated = await resolver.resolve(rotateDID);
    if (rotated.didResolutionMetadata?.error) return null;
    const document = rotated.didDocument;
    if (
      typeof document !== "object" ||
      document === null ||
      document.id !== rotateDID
    ) {
      return null;
    }
    return document as unknown as Record<string, unknown>;
  };
  return resolutionResult(did, config, resolveRotationTarget);
}

/** DIF did-resolver registry entry for did:oyd. Standalone hosts (e.g. a
 *  local CLI) may opt into DID-Rotation following; the default answers only
 *  for the requested DID, which is what a universal-resolver driver must
 *  do. */
export function getResolver(config: OydResolverOptions = {}): ResolverRegistry {
  return {
    oyd: (did: string, parsed: ParsedDID, resolver: Resolvable) =>
      resolveOyd(did, parsed, resolver, config),
  };
}

/** ⇔ the fragment branch of resolution_result (dids_controller.rb:437) —
 *  exposed as a pure helper so callers that dereference DID URLs (the
 *  reference server does; a CLI can) reuse the reference behavior: the
 *  verification method whose id ends in `#fragment`, carrying the
 *  document's @context. Returns null when no method matches. */
export function dereferenceFragment(
  document: W3cDocument,
  fragment: string,
): W3cDocument | null {
  const methods = document["verificationMethod"];
  if (!Array.isArray(methods)) return null;
  for (const method of methods) {
    const vm = method as Record<string, unknown>;
    if (
      String(vm["id"] ?? "")
        .split("#")
        .pop() === fragment
    ) {
      return {
        "@context": document["@context"],
        id: vm["id"],
        type: vm["type"],
        controller: vm["controller"],
        publicKeyMultibase: vm["publicKeyMultibase"],
      };
    }
  }
  return null;
}
