import { sha256 } from "@noble/hashes/sha256";
const DEFAULT_TIMEOUT_MS = 6000;
const MAX_RESPONSE_BYTES = 1024 * 1024;
/** base64url of a 34-byte sha256 multihash is exactly 46 chars ("Ei…"). */
const SUFFIX_RE = /^Ei[A-Za-z0-9_-]{44}$/;
/** Bound the encoded initial state before any decode work. */
const MAX_INITIAL_STATE_CHARS = 16 * 1024;
/** Sidetree protocol bound on the canonicalized delta. */
const MAX_CANONICAL_DELTA_CHARS = 1000;
const KEY_PURPOSES = new Set([
    "authentication",
    "assertionMethod",
    "keyAgreement",
    "capabilityInvocation",
    "capabilityDelegation",
]);
const ID_FRAGMENT_RE = /^[A-Za-z0-9_-]{1,50}$/;
class ResolutionError extends Error {
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
/** RFC 8785 (JCS) canonical JSON — exact for JSON-parsed values. */
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
function base64urlEncode(bytes) {
    let binary = "";
    for (const byte of bytes)
        binary += String.fromCharCode(byte);
    return btoa(binary)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}
/** Sidetree "hash": base64url(0x12 0x20 ‖ sha256(canonical payload)). */
function multihash(canonical) {
    const digest = sha256(new TextEncoder().encode(canonical));
    const bytes = new Uint8Array(2 + digest.length);
    bytes[0] = 0x12;
    bytes[1] = 0x20;
    bytes.set(digest, 2);
    return base64urlEncode(bytes);
}
/** Apply the delta's patches per the Sidetree protocol document model. */
function applyPatches(patches) {
    let publicKeys = [];
    let services = [];
    for (const patch of patches) {
        switch (patch.action) {
            case "replace":
                publicKeys = [...(patch.document?.publicKeys ?? [])];
                services = [...(patch.document?.services ?? [])];
                break;
            case "add-public-keys":
                publicKeys = [...publicKeys, ...(patch.publicKeys ?? [])];
                break;
            case "remove-public-keys": {
                const removed = new Set(patch.ids ?? []);
                publicKeys = publicKeys.filter((k) => !removed.has(k.id ?? ""));
                break;
            }
            case "add-services":
                services = [...services, ...(patch.services ?? [])];
                break;
            case "remove-services": {
                const removed = new Set(patch.ids ?? []);
                services = services.filter((s) => !removed.has(s.id ?? ""));
                break;
            }
            default:
                throw new ResolutionError("invalidDidDocument", `unsupported patch action \`${String(patch.action)}\``);
        }
    }
    return { publicKeys, services };
}
/** Compose the DID document from patch state (reference-verified shape). */
function composeDocument(did, publicKeys, services) {
    const verificationMethod = [];
    const relationships = {};
    const seen = new Set();
    for (const key of publicKeys) {
        if (!key.id || !ID_FRAGMENT_RE.test(key.id) || seen.has(key.id)) {
            throw new ResolutionError("invalidDidDocument", "public key ids must be unique 1-50 char base64url fragments");
        }
        seen.add(key.id);
        if (!key.publicKeyJwk || typeof key.type !== "string") {
            throw new ResolutionError("invalidDidDocument", "malformed public key");
        }
        verificationMethod.push({
            id: `#${key.id}`,
            controller: did,
            type: key.type,
            publicKeyJwk: key.publicKeyJwk,
        });
        for (const purpose of key.purposes ?? []) {
            if (!KEY_PURPOSES.has(purpose)) {
                throw new ResolutionError("invalidDidDocument", `unknown key purpose \`${purpose}\``);
            }
            (relationships[purpose] ??= []).push(`#${key.id}`);
        }
    }
    const service = [];
    const seenServices = new Set();
    for (const entry of services) {
        if (!entry.id ||
            !ID_FRAGMENT_RE.test(entry.id) ||
            seenServices.has(entry.id) ||
            typeof entry.type !== "string" ||
            entry.serviceEndpoint === undefined) {
            throw new ResolutionError("invalidDidDocument", "malformed service");
        }
        seenServices.add(entry.id);
        service.push({
            id: `#${entry.id}`,
            type: entry.type,
            serviceEndpoint: entry.serviceEndpoint,
        });
    }
    return {
        id: did,
        "@context": ["https://www.w3.org/ns/did/v1", { "@base": did }],
        ...(service.length ? { service } : {}),
        ...(verificationMethod.length ? { verificationMethod } : {}),
        ...relationships,
    };
}
/** Offline, verified long-form resolution (Sidetree §Long-Form DID URIs). */
function resolveLongForm(did, suffix, encodedState) {
    if (encodedState.length > MAX_INITIAL_STATE_CHARS) {
        throw new ResolutionError("invalidDid", "initial state exceeds size bound");
    }
    const bytes = base64urlDecode(encodedState);
    if (!bytes) {
        throw new ResolutionError("invalidDid", "initial state is not base64url");
    }
    let state;
    try {
        state = JSON.parse(new TextDecoder().decode(bytes));
    }
    catch {
        throw new ResolutionError("invalidDid", "initial state is not JSON");
    }
    const { suffixData, delta } = state ?? {};
    if (!suffixData || !delta) {
        throw new ResolutionError("invalidDid", "initial state must carry suffixData and delta");
    }
    // The payload must be the exact canonical encoding — anything else would
    // let one DID have many spellings.
    if (base64urlEncode(new TextEncoder().encode(jcs(state))) !== encodedState) {
        throw new ResolutionError("invalidDid", "initial state is not canonically encoded");
    }
    // Content-addressed identity: suffix commits to suffixData, which commits
    // to the delta.
    if (multihash(jcs(suffixData)) !== suffix) {
        throw new ResolutionError("invalidDid", "DID suffix does not match its initial state");
    }
    const canonicalDelta = jcs(delta);
    if (canonicalDelta.length > MAX_CANONICAL_DELTA_CHARS) {
        throw new ResolutionError("invalidDidDocument", "delta exceeds the Sidetree size bound");
    }
    if (multihash(canonicalDelta) !== suffixData.deltaHash) {
        throw new ResolutionError("invalidDidDocument", "deltaHash does not commit to the delta");
    }
    const { publicKeys, services } = applyPatches(delta.patches ?? []);
    return {
        didResolutionMetadata: { contentType: "application/did+ld+json" },
        didDocument: composeDocument(did, publicKeys, services),
        didDocumentMetadata: {
            method: {
                published: false,
                recoveryCommitment: suffixData.recoveryCommitment,
                updateCommitment: delta.updateCommitment,
            },
            // The DIF type says `string`, but the spec (and the reference
            // implementation) emit an array of equivalent DID strings.
            equivalentId: [`did:ion:${suffix}`],
        },
    };
}
/** Sidetree / Universal Resolver error spellings → DIF codes. */
function normalizeError(raw, status) {
    const flat = String(typeof raw === "object" && raw !== null
        ? (raw.code ??
            raw.error ??
            "")
        : (raw ?? ""))
        .replace(/[_\s-]/g, "")
        .toLowerCase();
    if (flat.includes("notfound"))
        return "notFound";
    if (flat.includes("deactivated"))
        return "deactivated";
    if (flat.includes("invaliddid") || flat.includes("didstring")) {
        return "invalidDid";
    }
    if (flat)
        return flat === "internalerror" ? "internalError" : "upstreamError";
    return status === 404 ? "notFound" : "upstreamError";
}
export function getResolver(options) {
    const base = (options?.endpointUrl ?? "").replace(/\/+$/, "");
    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
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
    /** Anchored (short-form) resolution via the configured endpoint. */
    async function resolveShortForm(did, resolutionOptions) {
        if (!base) {
            throw new ResolutionError("notConfigured", "no anchored-state endpoint configured; short-form did:ion is delegated to the routing chain");
        }
        const params = new URLSearchParams();
        const extra = resolutionOptions;
        if (typeof extra.versionId === "string") {
            params.set("versionId", extra.versionId);
        }
        if (typeof extra.versionTime === "string") {
            params.set("versionTime", extra.versionTime);
        }
        const query = params.size > 0 ? `?${params.toString()}` : "";
        const response = await fetch(`${base}/identifiers/${encodeURIComponent(did)}${query}`, {
            headers: {
                accept: 'application/ld+json;profile="https://w3id.org/did-resolution"',
            },
            signal: AbortSignal.timeout(timeoutMs),
        });
        const text = await readBounded(response);
        if (text === null) {
            throw new ResolutionError("networkError", "response exceeds size bound");
        }
        let body;
        try {
            body = JSON.parse(text);
        }
        catch {
            throw new ResolutionError(response.ok ? "invalidResponse" : "upstreamError", `endpoint HTTP ${response.status}`);
        }
        const upstreamError = body.didResolutionMetadata?.error ??
            (typeof body.code === "string" ? body : undefined);
        const didDocument = body.didDocument ?? null;
        const documentMetadata = body.didDocumentMetadata ?? {};
        if (!response.ok || upstreamError || !didDocument?.id) {
            // A deactivated DID is a successful resolution with a tombstone.
            if (documentMetadata.deactivated === true) {
                return {
                    didResolutionMetadata: { contentType: "application/did+ld+json" },
                    didDocument: didDocument ?? { id: did },
                    didDocumentMetadata: documentMetadata,
                };
            }
            throw new ResolutionError(normalizeError(upstreamError, response.status), "");
        }
        // The answer must be for this DID — canonical or equivalent forms count.
        const canonicalId = documentMetadata.canonicalId;
        const equivalent = Array.isArray(documentMetadata.equivalentId)
            ? documentMetadata.equivalentId
            : [];
        if (didDocument.id !== did &&
            canonicalId !== did &&
            !equivalent.includes(did)) {
            throw new ResolutionError("invalidDidDocument", "endpoint returned a document for a different DID");
        }
        return {
            didResolutionMetadata: { contentType: "application/did+ld+json" },
            didDocument,
            didDocumentMetadata: documentMetadata,
        };
    }
    const ion = async (did, _parsed, _resolver, resolutionOptions) => {
        try {
            const segments = did.split(":");
            if (segments[0] !== "did" || segments[1] !== "ion") {
                return errorResult("invalidDid");
            }
            if (segments[2] === "test") {
                return errorResult("notFound", "the ION test network was sunset and is not resolvable");
            }
            if (!SUFFIX_RE.test(segments[2] ?? "")) {
                return errorResult("invalidDid", "malformed ION suffix");
            }
            if (segments.length === 4) {
                return resolveLongForm(did, segments[2], segments[3]);
            }
            if (segments.length !== 3) {
                return errorResult("invalidDid");
            }
            return await resolveShortForm(did, resolutionOptions ?? {});
        }
        catch (cause) {
            if (cause instanceof ResolutionError) {
                return errorResult(cause.code, cause.message || undefined);
            }
            return errorResult("networkError", cause instanceof Error ? cause.message.slice(0, 200) : undefined);
        }
    };
    return { ion };
}
//# sourceMappingURL=resolver.js.map