import { ed25519KeyFramedHex, getDigest, getEncoding, getLocation, isPubKeyIdentifier, stripLocation, } from "./basic.js";
import { MAX_ROTATION_DEPTH } from "./security.js";
import { Op, REVOKED_ERROR_CODE } from "./log.js";
import { read } from "./read.js";
import { documentId, versionIds, versionMetadata, w3c, } from "./w3c.js";
function errorResult(error, message) {
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
];
/** Failures of the DID's own data — signatures, commitments, log
 *  structure — as opposed to a genuinely absent DID. */
const INVALID_MARKERS = [
    "don't match",
    "does not match",
    "malformed",
    "wrong number of CREATE",
    "missing TERMINATE",
    "missing signature",
    "cannot resolve DID",
    "unauthorized UPDATE",
    "duplicate log entry",
    "dangling back-reference",
];
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
];
/** DIF error taxonomy (REFERENCE-MAP §8) — the reference HTTP API can only
 *  distinguish 404/410/500; the DIF interface has codes for what actually
 *  happened, so verification failures, transport failures and absent DIDs
 *  are reported distinctly. */
function errorCodeFor(message) {
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
/** The composed document is an open shape; the DIF interface wants a
 *  DIDDocument. Guard the one invariant that matters (`id` is a string)
 *  instead of blind-casting. */
function asDidDocument(document) {
    return typeof document["id"] === "string"
        ? document
        : null;
}
/** ⇔ resolution_result (dids_controller.rb:180). DID-URL fragments are the
 *  caller's layer (see dereferenceFragment below). */
export async function resolutionResult(did, config = {}, resolveRotationTarget) {
    const options = {};
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
    let result;
    let readMessage;
    try {
        [result, readMessage] = await read(did, options);
    }
    catch (error) {
        // ⇔ `(Oydid.read(did, options) rescue [nil, ""])` — with the exception
        // message preserved for diagnostics rather than discarded (the shape
        // validation in basic.ts makes this a genuine last resort)
        [result, readMessage] = [null, error instanceof Error ? error.message : ""];
    }
    // A revoked DID is reported two ways: as error 410 when this process
    // resolved the log itself, and as the message "revoked" when the hosting
    // repository answered 410 (⇔ dids_controller.rb:195)
    const revoked = (result !== null && result.error === REVOKED_ERROR_CODE) ||
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
        return errorResult(errorCodeFor(readMessage), readMessage !== "" ? readMessage : undefined);
    }
    if (result.error !== 0) {
        return errorResult(result.error === 404 ? "notFound" : errorCodeFor(result.message), result.message);
    }
    // Identifier binding (REFERENCE-MAP §1): `/doc/{id}` serves the latest
    // document, so the REQUESTED identifier must be bound to the verified
    // chain — it must appear as a version (a CREATE/UPDATE entry's doc) in
    // the walked log, or, for a bare-public-key identifier, as the document
    // key itself.
    const bound = isPubKeyIdentifier(didHash)
        ? result.doc.key.split(":")[0] === didHash
        : (result.log ?? []).some((el) => (el.op === Op.CREATE || el.op === Op.UPDATE) &&
            stripLocation(el.doc).replace(/^did:oyd:/, "") === didHash);
    if (!bound) {
        return errorResult("invalidDidDocument", "DID identifier and DID document don't match");
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
    if (typeof composed["error"] === "string") {
        return errorResult("representationNotSupported", composed["error"]);
    }
    const document = asDidDocument(composed);
    if (document === null) {
        return errorResult("invalidDidDocument");
    }
    const didDocumentMetadata = {
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
async function resolveOyd(did, parsed, resolver, config) {
    if (parsed.method !== "oyd" || parsed.id === "") {
        return errorResult("invalidDid");
    }
    // rotation targets resolve through the parent Resolvable — the host's own
    // driver registry stands in for the reference's DEFAULT_PUBLIC_RESOLVER.
    // A host driver is not trusted blindly (finding 10): the target must
    // resolve without error to a structurally valid document whose `id`
    // equals the requested rotation DID, within a bounded number of hops.
    let rotationHops = 0;
    const resolveRotationTarget = async (rotateDID) => {
        if (++rotationHops > MAX_ROTATION_DEPTH)
            return null;
        const rotated = await resolver.resolve(rotateDID);
        if (rotated.didResolutionMetadata?.error)
            return null;
        const document = rotated.didDocument;
        if (typeof document !== "object" ||
            document === null ||
            document.id !== rotateDID) {
            return null;
        }
        return document;
    };
    return resolutionResult(did, config, resolveRotationTarget);
}
/** DIF did-resolver registry entry for did:oyd. Standalone hosts (e.g. a
 *  local CLI) may opt into DID-Rotation following; the default answers only
 *  for the requested DID, which is what a universal-resolver driver must
 *  do. */
export function getResolver(config = {}) {
    return {
        oyd: (did, parsed, resolver) => resolveOyd(did, parsed, resolver, config),
    };
}
/** ⇔ the fragment branch of resolution_result (dids_controller.rb:437) —
 *  exposed as a pure helper so callers that dereference DID URLs (the
 *  reference server does; a CLI can) reuse the reference behavior: the
 *  verification method whose id ends in `#fragment`, carrying the
 *  document's @context. Returns null when no method matches. */
export function dereferenceFragment(document, fragment) {
    const methods = document["verificationMethod"];
    if (!Array.isArray(methods))
        return null;
    for (const method of methods) {
        const vm = method;
        if (String(vm["id"] ?? "")
            .split("#")
            .pop() === fragment) {
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
//# sourceMappingURL=resolver.js.map