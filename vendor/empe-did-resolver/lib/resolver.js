/**
 * Public Tendermint RPC endpoints (testnet resolution-verified live
 * 24 Aug 2026, from the cosmos/chain-registry `empe-testnet-2` entry).
 * Mainnet has NOT launched — the empty list yields `notConfigured`.
 */
const DEFAULT_RPC_URLS = {
    mainnet: [],
    testnet: ["https://rpc-testnet.empe.io"],
};
const QUERY_PATH = "/empe.diddoc.Query/DidDocument";
const DEFAULT_TIMEOUT_MS = 6000;
const MAX_RESPONSE_BYTES = 256 * 1024;
const DID_CONTEXT = "https://www.w3.org/ns/did/v1";
const METHOD_ID_RE = /^[0-9a-f]{40}$/;
function errorResult(error, message) {
    return {
        didResolutionMetadata: { error, ...(message ? { message } : {}) },
        didDocument: null,
        didDocumentMetadata: {},
    };
}
/**
 * Decode one protobuf message into its fields, in order. Returns null on
 * malformed input or wire types the diddoc schema never uses (the module's
 * messages are entirely strings, sub-messages and small varints).
 */
export function decodeMessage(bytes) {
    const fields = [];
    let pos = 0;
    const varint = () => {
        let value = 0;
        let shift = 0;
        while (pos < bytes.length) {
            const byte = bytes[pos++];
            value += (byte & 0x7f) * 2 ** shift;
            shift += 7;
            if ((byte & 0x80) === 0) {
                return Number.isSafeInteger(value) ? value : null;
            }
            if (shift > 49)
                return null;
        }
        return null;
    };
    while (pos < bytes.length) {
        const tag = varint();
        if (tag === null)
            return null;
        const fieldNumber = Math.floor(tag / 8);
        const wireType = tag % 8;
        if (fieldNumber === 0)
            return null;
        if (wireType === 0) {
            const value = varint();
            if (value === null)
                return null;
            fields.push({ fieldNumber, varint: value });
        }
        else if (wireType === 2) {
            const length = varint();
            if (length === null || pos + length > bytes.length)
                return null;
            fields.push({ fieldNumber, bytes: bytes.subarray(pos, pos + length) });
            pos += length;
        }
        else {
            return null;
        }
    }
    return fields;
}
const utf8 = new TextDecoder();
function stringsOf(fields, fieldNumber) {
    return fields
        .filter((f) => f.fieldNumber === fieldNumber && f.bytes)
        .map((f) => utf8.decode(f.bytes));
}
function messagesOf(fields, fieldNumber) {
    return fields
        .filter((f) => f.fieldNumber === fieldNumber && f.bytes)
        .map((f) => f.bytes);
}
// ── diddoc message mapping (field numbers from the chain's own codec) ───────
/** `/empe.diddoc.JsonWebKey`: 1 kty, 2 crv, 3 x, 4 y. */
function decodeJwk(bytes) {
    const fields = decodeMessage(bytes);
    if (!fields)
        return null;
    const jwk = {};
    const names = { 1: "kty", 2: "crv", 3: "x", 4: "y" };
    for (const [num, name] of Object.entries(names)) {
        const [value] = stringsOf(fields, Number(num));
        if (value)
            jwk[name] = value;
    }
    return jwk.kty ? jwk : null;
}
/**
 * `/empe.diddoc.DidVerificationMethod`: 1 id, 2 type, 3 controller,
 * 4 publicKeyBase58, 5 publicKeyMultibase, 6 publicKeyJwk.
 */
function decodeVerificationMethod(bytes) {
    const fields = decodeMessage(bytes);
    if (!fields)
        return null;
    const [id] = stringsOf(fields, 1);
    const [type] = stringsOf(fields, 2);
    const [controller] = stringsOf(fields, 3);
    if (!id || !type)
        return null;
    const method = { id, type, controller: controller ?? "" };
    const [base58] = stringsOf(fields, 4);
    if (base58)
        method.publicKeyBase58 = base58;
    const [multibase] = stringsOf(fields, 5);
    if (multibase)
        method.publicKeyMultibase = multibase;
    const [jwkBytes] = messagesOf(fields, 6);
    if (jwkBytes) {
        const jwk = decodeJwk(jwkBytes);
        if (!jwk)
            return null;
        method.publicKeyJwk = jwk;
    }
    return method;
}
/**
 * `/empe.diddoc.DidVerificationRelationship`: 1 referenceId,
 * 2 embeddedMethod — exactly one of the two.
 */
function decodeRelationship(bytes) {
    const fields = decodeMessage(bytes);
    if (!fields)
        return null;
    const [reference] = stringsOf(fields, 1);
    if (reference)
        return reference;
    const [embedded] = messagesOf(fields, 2);
    if (embedded)
        return decodeVerificationMethod(embedded);
    return null;
}
/** `/empe.diddoc.DidDocumentService`: 1 id, 2 type, 3 serviceEndpoint[]. */
function decodeService(bytes) {
    const fields = decodeMessage(bytes);
    if (!fields)
        return null;
    const [id] = stringsOf(fields, 1);
    const [type] = stringsOf(fields, 2);
    const endpoints = stringsOf(fields, 3);
    if (!id || !type || endpoints.length === 0)
        return null;
    return {
        id,
        type,
        serviceEndpoint: endpoints.length === 1 ? endpoints[0] : endpoints,
    };
}
const RELATIONSHIPS = [
    [5, "authentication"],
    [6, "assertionMethod"],
    [7, "keyAgreement"],
    [8, "capabilityInvocation"],
    [9, "capabilityDelegation"],
];
/**
 * `/empe.diddoc.DidDocument`: 1 id, 2 context[], 3 controller[],
 * 4 verificationMethod[], 5–9 relationships, 10 service[], 11 alsoKnownAs[].
 * Returns an error string instead of throwing so callers can attribute it.
 */
export function decodeDidDocument(bytes) {
    const fields = decodeMessage(bytes);
    if (!fields)
        return "malformed DidDocument protobuf";
    const [id] = stringsOf(fields, 1);
    if (!id)
        return "DidDocument has no id";
    const contexts = stringsOf(fields, 2);
    const document = {
        "@context": (contexts.length === 0
            ? DID_CONTEXT
            : contexts.length === 1
                ? contexts[0]
                : contexts),
        id,
    };
    const controllers = stringsOf(fields, 3);
    if (controllers.length === 1)
        document.controller = controllers[0];
    else if (controllers.length > 1)
        document.controller = controllers;
    const methods = [];
    for (const raw of messagesOf(fields, 4)) {
        const method = decodeVerificationMethod(raw);
        if (!method)
            return "malformed verification method";
        methods.push(method);
    }
    if (methods.length)
        document.verificationMethod = methods;
    for (const [fieldNumber, property] of RELATIONSHIPS) {
        const entries = [];
        for (const raw of messagesOf(fields, fieldNumber)) {
            const entry = decodeRelationship(raw);
            if (!entry)
                return `malformed ${property} entry`;
            entries.push(entry);
        }
        if (entries.length) {
            document[property] = entries;
        }
    }
    const services = [];
    for (const raw of messagesOf(fields, 10)) {
        const service = decodeService(raw);
        if (!service)
            return "malformed service entry";
        services.push(service);
    }
    if (services.length)
        document.service = services;
    const alsoKnownAs = stringsOf(fields, 11);
    if (alsoKnownAs.length)
        document.alsoKnownAs = alsoKnownAs;
    return document;
}
/** `QueryGetDidDocumentRequest { did }` → hex for the abci_query data arg. */
export function encodeRequest(did) {
    const bytes = new TextEncoder().encode(did);
    const header = Uint8Array.from([0x0a, bytes.length]);
    return [...header, ...bytes]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}
// ── transport ───────────────────────────────────────────────────────────────
async function readBounded(response) {
    if (Number(response.headers.get("content-length") ?? 0) > MAX_RESPONSE_BYTES) {
        return null;
    }
    const text = await response.text();
    return text.length > MAX_RESPONSE_BYTES ? null : text;
}
function base64Decode(value) {
    try {
        const binary = atob(value);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++)
            bytes[i] = binary.charCodeAt(i);
        return bytes;
    }
    catch {
        return null;
    }
}
// ── resolver ────────────────────────────────────────────────────────────────
export function getResolver(options) {
    const rpcUrls = { ...DEFAULT_RPC_URLS, ...(options?.rpcUrls ?? {}) };
    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const empe = async (did) => {
        try {
            const segments = did.split(":");
            if (segments[0] !== "did" ||
                segments[1] !== "empe" ||
                segments.length < 3 ||
                segments.length > 4) {
                return errorResult("invalidDid", "expected did:empe:(<network>:)?<40-hex-identifier>");
            }
            const tag = segments[segments.length - 1];
            if (!METHOD_ID_RE.test(tag)) {
                return errorResult("invalidDid", "identifier must be 40 lowercase hex characters");
            }
            const network = segments.length === 4 ? segments[2] : "mainnet";
            // `did:empe:mainnet:<id>` is not a defined form — mainnet DIDs have
            // no network segment. A malformed segment is invalid either way.
            if (segments.length === 4 &&
                (!/^[a-z0-9]{1,32}$/.test(network) || network === "mainnet")) {
                return errorResult("invalidDid", "malformed network segment");
            }
            const configured = rpcUrls[network];
            const endpoints = (Array.isArray(configured) ? configured : configured ? [configured] : []).map((u) => u.replace(/\/+$/, ""));
            if (!endpoints.length) {
                return errorResult("notConfigured", network === "mainnet"
                    ? "Empeiria has no public mainnet yet — no endpoint to query"
                    : `no Empeiria RPC endpoint configured for network \`${network}\``);
            }
            // The chain rejects POSTed JSON-RPC from some frontends — the GET form
            // of abci_query is the portable one. Transport failures fall through
            // to the next endpoint; a consensus answer (code 0 or a not-found
            // code) never does.
            const query = `/abci_query?path=%22${QUERY_PATH}%22&data=0x${encodeRequest(did)}`;
            let answer = null;
            let lastTransportError = "no endpoint answered";
            for (const endpoint of endpoints) {
                try {
                    const response = await fetch(endpoint + query, {
                        headers: { accept: "application/json" },
                        signal: AbortSignal.timeout(timeoutMs),
                    });
                    if (!response.ok) {
                        lastTransportError = `Empeiria RPC HTTP ${response.status}`;
                        continue;
                    }
                    const text = await readBounded(response);
                    if (text === null) {
                        lastTransportError = "response exceeds size bound";
                        continue;
                    }
                    let parsed;
                    try {
                        parsed = JSON.parse(text);
                    }
                    catch {
                        lastTransportError = "malformed Empeiria RPC response";
                        continue;
                    }
                    const abci = parsed.result?.response;
                    if (!abci || typeof abci !== "object") {
                        lastTransportError = "Empeiria RPC answer has no response";
                        continue;
                    }
                    answer = abci;
                    break;
                }
                catch (cause) {
                    lastTransportError =
                        cause instanceof Error
                            ? cause.message.slice(0, 200)
                            : "fetch failed";
                }
            }
            if (answer === null) {
                return errorResult("networkError", lastTransportError);
            }
            if (answer.code !== 0) {
                // ABCI code 6 with "DID Document not found" is the chain's
                // consensus not-found answer (validated live 24 Aug 2026).
                if (/not found/i.test(answer.log ?? "")) {
                    return errorResult("notFound", "no DID document on the chain");
                }
                return errorResult("networkError", `Empeiria query error ${answer.code}: ${(answer.log ?? "").slice(0, 160)}`);
            }
            if (!answer.value) {
                return errorResult("notFound", "no DID document on the chain");
            }
            const raw = base64Decode(answer.value);
            if (!raw) {
                return errorResult("networkError", "undecodable query value");
            }
            const envelope = decodeMessage(raw);
            const docBytes = envelope ? messagesOf(envelope, 1)[0] : undefined;
            if (!docBytes) {
                return errorResult("invalidDidDocument", "query response holds no DidDocument");
            }
            const document = decodeDidDocument(docBytes);
            if (typeof document === "string") {
                return errorResult("invalidDidDocument", document);
            }
            if (document.id !== did) {
                // Also the network guard: a node on another Empeiria network would
                // answer a differently-namespaced id.
                return errorResult("invalidDidDocument", "stored document id does not match the queried DID");
            }
            return {
                didResolutionMetadata: { contentType: "application/did+ld+json" },
                didDocument: document,
                didDocumentMetadata: { network, deactivated: false },
            };
        }
        catch (cause) {
            return errorResult("networkError", cause instanceof Error ? cause.message.slice(0, 200) : undefined);
        }
    };
    return { empe };
}
//# sourceMappingURL=resolver.js.map