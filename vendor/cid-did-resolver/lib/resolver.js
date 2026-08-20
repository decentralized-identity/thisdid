import { CID } from "multiformats/cid";
import * as jsonCodec from "multiformats/codecs/json";
import { sha256 as cidHasher } from "multiformats/hashes/sha2";
import { secp256k1 } from "@noble/curves/secp256k1";
import { sha256 } from "@noble/hashes/sha256";
const DEFAULT_GATEKEEPER_URL = "https://archon.technology/api/v1";
const DEFAULT_TIMEOUT_MS = 6000;
const DEFAULT_MAX_EVENTS = 1024;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
/** Bound on one operation's serialized size (mirrors Gatekeeper maxOpBytes). */
const MAX_OP_CHARS = 256 * 1024;
/** DID suffix is a base32 CIDv1 — bound before parsing. */
const MAX_SUFFIX_CHARS = 128;
/** Asset controllers are DIDs too; bound the resolution recursion. */
const MAX_CONTROLLER_DEPTH = 3;
const VALID_REGISTRATION_VERSIONS = new Set([1]);
const VALID_REGISTRATION_TYPES = new Set(["agent", "asset"]);
/** A verification failure — resolution error, never an exception upward. */
class ChainError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}
function errorResult(error, message) {
    return {
        didResolutionMetadata: { error, ...(message ? { message } : {}) },
        didDocument: null,
        didDocumentMetadata: {},
    };
}
/**
 * RFC 8785 (JCS) canonical JSON. Sufficient and exact for Gatekeeper
 * operations: values originate from JSON.parse, so number serialization via
 * JSON.stringify matches JCS's ECMAScript ToString requirement, and
 * JSON.stringify's string escaping is the JCS escaping.
 */
function jcs(value) {
    if (value === null || typeof value !== "object")
        return JSON.stringify(value);
    if (Array.isArray(value))
        return "[" + value.map(jcs).join(",") + "]";
    const record = value;
    return ("{" +
        Object.keys(record)
            .sort()
            .filter((k) => record[k] !== undefined)
            .map((k) => JSON.stringify(k) + ":" + jcs(record[k]))
            .join(",") +
        "}");
}
function base64urlDecode(encoded) {
    if (!/^[A-Za-z0-9_-]+$/.test(encoded))
        return undefined;
    try {
        const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/") +
            "=".repeat((4 - (encoded.length % 4)) % 4);
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++)
            bytes[i] = binary.charCodeAt(i);
        return bytes;
    }
    catch {
        return undefined;
    }
}
/** CIDv1 (json codec, sha256, base32) of an operation — Gatekeeper opid/versionId. */
async function operationCid(operation) {
    const canonical = jcs(operation);
    if (canonical.length > MAX_OP_CHARS) {
        throw new ChainError("invalidDidDocument", "operation exceeds size bound");
    }
    const digest = await cidHasher.digest(new TextEncoder().encode(canonical));
    return CID.createV1(jsonCodec.code, digest).toString();
}
/** Compressed secp256k1 point from a JWK's x/y members. */
function compressedKey(jwk) {
    if (jwk.kty !== "EC" || jwk.crv !== "secp256k1") {
        throw new ChainError("invalidDidDocument", "verification key is not a secp256k1 key");
    }
    const x = typeof jwk.x === "string" ? base64urlDecode(jwk.x) : undefined;
    const y = typeof jwk.y === "string" ? base64urlDecode(jwk.y) : undefined;
    if (x?.length !== 32 || y?.length !== 32) {
        throw new ChainError("invalidDidDocument", "malformed key coordinates");
    }
    const point = new Uint8Array(33);
    point[0] = (y[31] & 1) === 0 ? 0x02 : 0x03;
    point.set(x, 1);
    return point;
}
/** Verify an operation's proof: sha256(JCS(op − proof)) signed compact secp256k1. */
function verifySignature(operation, jwk) {
    const proofValue = operation.proof?.proofValue;
    if (typeof proofValue !== "string")
        return false;
    const signature = base64urlDecode(proofValue);
    if (signature?.length !== 64)
        return false;
    const copy = { ...operation };
    delete copy.proof;
    const msgHash = sha256(new TextEncoder().encode(jcs(copy)));
    try {
        return secp256k1.verify(signature, msgHash, compressedKey(jwk));
    }
    catch (cause) {
        if (cause instanceof ChainError)
            throw cause;
        return false;
    }
}
function validRegistration(registration) {
    return Boolean(registration &&
        VALID_REGISTRATION_VERSIONS.has(registration.version) &&
        VALID_REGISTRATION_TYPES.has(registration.type) &&
        typeof registration.registry === "string" &&
        registration.registry.length > 0);
}
/** Gatekeeper's timestamp normalization (second precision, Z suffix). */
function standardDatetime(time) {
    return new Date(String(time)).toISOString().replace(/\.\d{3}Z$/, "Z");
}
/** Initial document from the genesis operation (Gatekeeper `generateDoc`). */
function generateDoc(did, anchor) {
    const registration = anchor.registration;
    if (registration.type === "agent") {
        return {
            didDocument: {
                "@context": ["https://www.w3.org/ns/did/v1"],
                id: did,
                verificationMethod: [
                    {
                        id: "#key-1",
                        controller: did,
                        type: "EcdsaSecp256k1VerificationKey2019",
                        publicKeyJwk: anchor.publicJwk,
                    },
                ],
                authentication: ["#key-1"],
                assertionMethod: ["#key-1"],
            },
            didDocumentMetadata: { created: anchor.created },
            didDocumentData: {},
            didDocumentRegistration: registration,
        };
    }
    // asset
    return {
        didDocument: {
            "@context": ["https://www.w3.org/ns/did/v1"],
            id: did,
            controller: anchor.controller,
        },
        didDocumentMetadata: { created: anchor.created },
        didDocumentData: anchor.data,
        didDocumentRegistration: registration,
    };
}
/** First verification-method key of a document — the update-authorizing key. */
function firstKey(doc) {
    const vm = doc.verificationMethod?.[0];
    if (!vm?.publicKeyJwk) {
        throw new ChainError("invalidDidDocument", "document has no verification key to authorize updates");
    }
    return vm.publicKeyJwk;
}
export function getResolver(options) {
    const base = (options?.gatekeeperUrl ?? DEFAULT_GATEKEEPER_URL).replace(/\/+$/, "");
    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxEvents = options?.maxEvents ?? DEFAULT_MAX_EVENTS;
    async function readBounded(response) {
        if (Number(response.headers.get("content-length") ?? 0) > MAX_RESPONSE_BYTES) {
            return null;
        }
        if (!response.body)
            return "";
        const reader = response.body.getReader();
        const chunks = [];
        let total = 0;
        try {
            for (;;) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                total += value.byteLength;
                if (total > MAX_RESPONSE_BYTES) {
                    await reader.cancel();
                    return null;
                }
                chunks.push(value);
            }
        }
        finally {
            reader.releaseLock();
        }
        const bytes = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.byteLength;
        }
        return new TextDecoder().decode(bytes);
    }
    /** Fetch a DID's full event chain from the Gatekeeper. */
    async function fetchEvents(did) {
        const response = await fetch(`${base}/dids/export`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                accept: "application/json",
            },
            body: JSON.stringify({ dids: [did] }),
            signal: AbortSignal.timeout(timeoutMs),
        });
        if (!response.ok) {
            throw new ChainError("networkError", `gatekeeper HTTP ${response.status}`);
        }
        const text = await readBounded(response);
        if (text === null) {
            throw new ChainError("networkError", "response exceeds size bound");
        }
        const body = JSON.parse(text);
        const events = Array.isArray(body) ? body[0] : null;
        if (!Array.isArray(events) || events.length === 0)
            return null;
        if (events.length > maxEvents) {
            throw new ChainError("invalidDidDocument", "event chain exceeds bound");
        }
        return events;
    }
    /**
     * Verify and fold a DID's event chain into its document state.
     * `versionTime` bounds updates for controller-at-time resolution;
     * `confirm` stops at the first registry-unconfirmed event (both mirror
     * Gatekeeper `resolveDID` options).
     */
    async function foldChain(did, events, opts) {
        const suffix = did.split(":")[2];
        const anchor = events[0]?.operation;
        if (!anchor || anchor.type !== "create") {
            throw new ChainError("invalidDidDocument", "chain does not start with create");
        }
        if (!validRegistration(anchor.registration)) {
            throw new ChainError("invalidDidDocument", "invalid genesis registration");
        }
        // Content-addressed identity: the DID IS the CID of its genesis operation.
        const genesisCid = await operationCid(anchor);
        if (genesisCid !== suffix) {
            throw new ChainError("invalidDidDocument", "DID does not match the CID of its genesis operation");
        }
        // Genesis signature.
        if (anchor.registration.type === "agent") {
            if (anchor.proof?.verificationMethod !== "#key-1" || !anchor.publicJwk) {
                throw new ChainError("invalidDidDocument", "malformed agent genesis");
            }
            if (!verifySignature(anchor, anchor.publicJwk)) {
                throw new ChainError("invalidDidDocument", "genesis signature invalid");
            }
        }
        else {
            const controllerDid = String(anchor.proof?.verificationMethod ?? "").split("#")[0];
            if (!controllerDid || anchor.controller !== controllerDid) {
                throw new ChainError("invalidDidDocument", "asset signer is not controller");
            }
            const controller = await resolveState(controllerDid, {
                versionTime: anchor.proof?.created,
                confirm: true,
                depth: opts.depth + 1,
            });
            if (!verifySignature(anchor, firstKey(controller.didDocument))) {
                throw new ChainError("invalidDidDocument", "asset genesis signature invalid");
            }
        }
        const doc = generateDoc(did, anchor);
        const created = standardDatetime(doc.didDocumentMetadata.created);
        const canonicalId = anchor.registration.prefix ? did : undefined;
        let versionNum = 1;
        let confirmed = true;
        for (const event of events) {
            const operation = event.operation;
            if (!operation) {
                throw new ChainError("invalidDidDocument", "event without operation");
            }
            const versionId = await operationCid(operation);
            if (operation.type === "create") {
                doc.didDocumentMetadata = {
                    created,
                    ...(canonicalId ? { canonicalId } : {}),
                    versionId,
                    versionSequence: versionNum.toString(),
                    confirmed,
                };
                continue;
            }
            if (opts.versionTime &&
                new Date(String(event.time)) > new Date(opts.versionTime)) {
                break;
            }
            confirmed =
                confirmed && doc.didDocumentRegistration?.registry === event.registry;
            if (opts.confirm && !confirmed)
                break;
            if (doc.didDocumentMetadata.deactivated) {
                throw new ChainError("invalidDidDocument", "operation after deactivation");
            }
            // Signature by the then-current key (controller's for assets).
            if (doc.didDocument.controller) {
                const controller = await resolveState(String(doc.didDocument.controller), {
                    versionTime: operation.proof?.created,
                    confirm: true,
                    depth: opts.depth + 1,
                });
                if (!verifySignature(operation, firstKey(controller.didDocument))) {
                    throw new ChainError("invalidDidDocument", "update signature invalid");
                }
            }
            else if (!verifySignature(operation, firstKey(doc.didDocument))) {
                throw new ChainError("invalidDidDocument", "update signature invalid");
            }
            // Hash linkage to the previous operation.
            if (!operation.previd ||
                operation.previd !== doc.didDocumentMetadata.versionId) {
                throw new ChainError("invalidDidDocument", "broken previd chain link");
            }
            const updated = standardDatetime(event.time);
            if (operation.type === "update") {
                versionNum += 1;
                const next = operation.doc ?? {};
                if (next.didDocument !== undefined)
                    doc.didDocument = next.didDocument;
                if (next.didDocumentData !== undefined) {
                    doc.didDocumentData = next.didDocumentData;
                }
                if (next.didDocumentRegistration !== undefined) {
                    doc.didDocumentRegistration = next.didDocumentRegistration;
                }
                doc.didDocumentMetadata = {
                    created,
                    updated,
                    ...(canonicalId ? { canonicalId } : {}),
                    versionId,
                    versionSequence: versionNum.toString(),
                    confirmed,
                };
                continue;
            }
            if (operation.type === "delete") {
                versionNum += 1;
                doc.didDocument = { id: did };
                doc.didDocumentData = {};
                doc.didDocumentMetadata = {
                    deactivated: true,
                    created,
                    deleted: updated,
                    ...(canonicalId ? { canonicalId } : {}),
                    versionId,
                    versionSequence: versionNum.toString(),
                    confirmed,
                };
                continue;
            }
            throw new ChainError("invalidDidDocument", `unknown operation type ${String(operation.type)}`);
        }
        return doc;
    }
    /** Fetch + verify + fold one DID (recursion entry for asset controllers). */
    async function resolveState(did, opts) {
        if (opts.depth > MAX_CONTROLLER_DEPTH) {
            throw new ChainError("invalidDidDocument", "controller chain too deep");
        }
        const segments = did.split(":");
        if (segments.length !== 3 ||
            segments[0] !== "did" ||
            segments[1] !== "cid" ||
            segments[2].length > MAX_SUFFIX_CHARS) {
            throw new ChainError("invalidDid", "malformed did:cid identifier");
        }
        try {
            CID.parse(segments[2]);
        }
        catch {
            throw new ChainError("invalidDid", "identifier is not a valid CID");
        }
        const events = await fetchEvents(did);
        if (!events)
            throw new ChainError("notFound", "no events for DID");
        return foldChain(did, events, opts);
    }
    const cid = async (did) => {
        try {
            const state = await resolveState(did, { depth: 0 });
            return {
                didResolutionMetadata: { contentType: "application/did+ld+json" },
                didDocument: state.didDocument,
                didDocumentMetadata: state.didDocumentMetadata,
            };
        }
        catch (cause) {
            if (cause instanceof ChainError) {
                return errorResult(cause.code, cause.message);
            }
            return errorResult("networkError", cause instanceof Error ? cause.message.slice(0, 200) : undefined);
        }
    };
    return { cid };
}
//# sourceMappingURL=resolver.js.map