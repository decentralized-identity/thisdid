import { sha256, sha512 } from "@noble/hashes/sha2.js";
import { ripemd160 } from "@noble/hashes/legacy.js";
/** Public JSON-RPC endpoints, keyed by the chain's own network_id. */
const DEFAULT_RPC_URLS = {
    "0": "https://xrplcluster.com",
    "1": "https://s.altnet.rippletest.net:51234",
    "2": "https://s.devnet.rippletest.net:51234",
};
const NETWORK_LABELS = {
    "0": "mainnet",
    "1": "testnet",
    "2": "devnet",
};
const DEFAULT_TIMEOUT_MS = 6000;
const MAX_RESPONSE_BYTES = 256 * 1024;
const DID_CONTEXT = "https://www.w3.org/ns/did/v1";
const MULTIKEY_CONTEXT = "https://w3id.org/security/multikey/v1";
/** 33-byte compressed public key: secp256k1 (02/03) or ed25519 (ED prefix). */
const PUBKEY_RE = /^(02|03|ED)[0-9A-F]{64}$/i;
function errorResult(error, message) {
    return {
        didResolutionMetadata: { error, ...(message ? { message } : {}) },
        didDocument: null,
        didDocumentMetadata: {},
    };
}
// ── XRPL base58check (validated against live mainnet addresses) ─────────────
const XRPL_ALPHABET = "rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz";
const BTC_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58Decode(encoded, alphabet) {
    let value = 0n;
    for (const char of encoded) {
        const index = alphabet.indexOf(char);
        if (index < 0)
            return null;
        value = value * 58n + BigInt(index);
    }
    const bytes = [];
    while (value > 0n) {
        bytes.unshift(Number(value & 0xffn));
        value >>= 8n;
    }
    for (const char of encoded) {
        if (char === alphabet[0])
            bytes.unshift(0);
        else
            break;
    }
    return Uint8Array.from(bytes);
}
function base58Encode(bytes, alphabet) {
    let value = 0n;
    for (const byte of bytes)
        value = (value << 8n) | BigInt(byte);
    let out = "";
    while (value > 0n) {
        out = alphabet[Number(value % 58n)] + out;
        value /= 58n;
    }
    for (const byte of bytes) {
        if (byte === 0)
            out = alphabet[0] + out;
        else
            break;
    }
    return out;
}
/** Classic-address → 20-byte AccountID; null when malformed or bad checksum. */
export function decodeAccountId(address) {
    if (!/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(address))
        return null;
    const raw = base58Decode(address, XRPL_ALPHABET);
    if (!raw || raw.length !== 25 || raw[0] !== 0x00)
        return null;
    const payload = raw.slice(0, 21);
    const checksum = raw.slice(21);
    const expected = sha256(sha256(payload)).slice(0, 4);
    for (let i = 0; i < 4; i++)
        if (checksum[i] !== expected[i])
            return null;
    return payload.slice(1);
}
/** 20-byte AccountID → classic address (version 0x00, double-SHA checksum). */
export function encodeAddress(accountId) {
    const payload = new Uint8Array(21);
    payload.set(accountId, 1);
    const checksum = sha256(sha256(payload)).slice(0, 4);
    const full = new Uint8Array(25);
    full.set(payload);
    full.set(checksum, 21);
    return base58Encode(full, XRPL_ALPHABET);
}
/** Master public key (33 bytes) → AccountID, per XRPL address encoding. */
export function accountIdFromPublicKey(publicKey) {
    return ripemd160(sha256(publicKey));
}
/** DID entry object ID: SHA-512Half(0x0049 ‖ AccountID) — for metadata. */
export function didObjectId(accountId) {
    const keyed = new Uint8Array(2 + accountId.length);
    keyed[0] = 0x00;
    keyed[1] = 0x49;
    keyed.set(accountId, 2);
    return Array.from(sha512(keyed).slice(0, 32))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
        .toUpperCase();
}
// ── blob + multikey helpers ─────────────────────────────────────────────────
function hexToBytes(hex) {
    if (!/^([0-9A-Fa-f]{2})+$/.test(hex))
        return null;
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
}
const strictUtf8 = new TextDecoder("utf-8", { fatal: true });
function hexToUtf8(hex) {
    const bytes = hexToBytes(hex);
    if (!bytes)
        return null;
    try {
        return strictUtf8.decode(bytes);
    }
    catch {
        return null;
    }
}
/** Multikey multibase: z + base58btc(multicodec ‖ key). */
function multikey(publicKey) {
    // ed25519-pub = 0xed 0x01, secp256k1-pub = 0xe7 0x01 (varint multicodec).
    const codec = publicKey[0] === 0xed ? [0xed, 0x01] : [0xe7, 0x01];
    const raw = publicKey[0] === 0xed ? publicKey.slice(1) : publicKey;
    const prefixed = new Uint8Array(codec.length + raw.length);
    prefixed.set(codec);
    prefixed.set(raw, codec.length);
    return "z" + base58Encode(prefixed, BTC_ALPHABET);
}
// ── authored-document structural validation ─────────────────────────────────
const RELATIONSHIP_PROPS = [
    "authentication",
    "assertionMethod",
    "keyAgreement",
    "capabilityInvocation",
    "capabilityDelegation",
];
const isStringArray = (value) => Array.isArray(value) &&
    value.length > 0 &&
    value.every((v) => typeof v === "string" && v.length > 0);
const isStringOrStringArray = (value) => (typeof value === "string" && value.length > 0) || isStringArray(value);
/** Verification-method key-material properties this resolver accepts. */
const KEY_MATERIAL_PROPS = [
    "publicKeyMultibase",
    "publicKeyBase58",
    "publicKeyHex",
    "publicKeyJwk",
    "blockchainAccountId",
];
const isPlainObject = (value) => !!value && typeof value === "object" && !Array.isArray(value);
/**
 * A DID URL fragment OWNED by the resolved DID: either a relative `#frag`
 * or `<did>#frag` under the exact queried DID. Anything else (a foreign
 * DID's URL, a bare string) is not resolvable within the served document —
 * remember that this resolver normalizes the document `id` to the queried
 * DID, so ids under an authored alias would dangle.
 */
function ownFragmentOf(id, did) {
    if (typeof id !== "string")
        return null;
    if (id.startsWith("#"))
        return id.length > 1 ? id.slice(1) : null;
    if (id.startsWith(`${did}#`) && id.length > did.length + 1) {
        return id.slice(did.length + 1);
    }
    return null;
}
/** DID Core serviceEndpoint: a string, a map, or a set of strings/maps. */
function isValidServiceEndpoint(value) {
    if (typeof value === "string")
        return value.length > 0;
    if (Array.isArray(value)) {
        return (value.length > 0 &&
            value.every((v) => (typeof v === "string" && v.length > 0) || isPlainObject(v)));
    }
    return isPlainObject(value);
}
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]+$/;
const B64URL_RE = /^[A-Za-z0-9_-]+$/;
const isBase64url = (value) => typeof value === "string" && value.length > 0 && B64URL_RE.test(value);
const isNonEmptyString = (value) => typeof value === "string" && value.length > 0;
/** JWK members that carry PRIVATE or symmetric key material (RFC 7518). */
const PRIVATE_JWK_MEMBERS = ["d", "p", "q", "dp", "dq", "qi", "oth", "k"];
/**
 * A public JWK with the members ITS key type requires — nothing less, and
 * nothing PRIVATE: the authored document is served verbatim, so a JWK
 * carrying `d` (EC/OKP/RSA) or the RSA CRT members would leak a private key
 * someone mistakenly put on-ledger. Such a blob is rejected outright.
 */
function isValidPublicJwk(value) {
    if (!isPlainObject(value))
        return false;
    if (PRIVATE_JWK_MEMBERS.some((m) => value[m] !== undefined))
        return false;
    switch (value.kty) {
        case "OKP":
            return isNonEmptyString(value.crv) && isBase64url(value.x);
        case "EC":
            return (isNonEmptyString(value.crv) &&
                isBase64url(value.x) &&
                isBase64url(value.y));
        case "RSA":
            return isBase64url(value.n) && isBase64url(value.e);
        default:
            return false;
    }
}
/**
 * Key material must LOOK LIKE key material, not merely be a string: real
 * public keys are ≥32 bytes, so base58 forms run ≥40 chars and hex ≥64;
 * multibase must be base58btc (`z…`); a JWK must carry the members its own
 * `kty` requires (OKP: crv + x; EC: crv + x + y; RSA: n + e — base64url,
 * unsupported key types rejected); blockchainAccountId must be CAIP-10.
 * Floors are set below every real key encoding so nothing genuine is
 * rejected while placeholder junk is.
 */
function isValidKeyMaterial(prop, value) {
    switch (prop) {
        case "publicKeyMultibase":
            return (typeof value === "string" &&
                value.length >= 40 &&
                value[0] === "z" &&
                BASE58_RE.test(value.slice(1)));
        case "publicKeyBase58":
            return (typeof value === "string" && value.length >= 40 && BASE58_RE.test(value));
        case "publicKeyHex":
            return typeof value === "string" && /^([0-9A-Fa-f]{2}){32,}$/.test(value);
        case "publicKeyJwk":
            return isValidPublicJwk(value);
        case "blockchainAccountId":
            return (typeof value === "string" &&
                /^[-a-z0-9]{3,8}:[-_a-zA-Z0-9]{1,32}:[-.%a-zA-Z0-9]{1,128}$/.test(value));
        default:
            return false;
    }
}
/**
 * The `DIDDocument` ledger field is NOT checked for validity by the ledger —
 * before adopting an authored blob as the resolution result, require it to
 * be structurally USABLE, not merely shaped: every verification method has
 * an own-DID id, a type, EXACTLY ONE supported key-material property whose
 * value passes encoding validation, and a DID-syntax controller when
 * present; every relationship entry is either an embedded valid method or a
 * reference that RESOLVES to a declared/embedded method; every service has
 * an own-DID id, a type, and a DID-Core-valid endpoint (string, map, or set
 * thereof — never a scalar); ids are UNIQUE across methods and services (a
 * duplicate fragment is a conflicting definition, not a merge). A blob
 * failing any rule falls back to the implicit document with the raw hex
 * retained in metadata.
 */
function isStructurallyValidDocument(doc, did) {
    const isDidSyntax = (v) => typeof v === "string" && /^did:[a-z0-9]+:\S+$/.test(v) && !v.includes("#");
    const isControllerValue = (v) => isDidSyntax(v) ||
        (Array.isArray(v) && v.length > 0 && v.every(isDidSyntax));
    if (doc.controller !== undefined && !isControllerValue(doc.controller)) {
        return false;
    }
    if (doc.alsoKnownAs !== undefined && !isStringArray(doc.alsoKnownAs)) {
        return false;
    }
    /** Validate one verification method; returns its fragment, or null. */
    const methodFragment = (value) => {
        if (!isPlainObject(value))
            return null;
        const fragment = ownFragmentOf(value.id, did);
        if (fragment === null)
            return null;
        if (typeof value.type !== "string" || value.type.length === 0)
            return null;
        if (value.controller !== undefined &&
            !isControllerValue(value.controller)) {
            return null;
        }
        const material = KEY_MATERIAL_PROPS.filter((p) => value[p] !== undefined);
        if (material.length !== 1)
            return null;
        return isValidKeyMaterial(material[0], value[material[0]])
            ? fragment
            : null;
    };
    const fragments = new Set();
    const claimFragment = (fragment) => {
        // A duplicate fragment is a conflicting definition — reject, never merge.
        if (fragment === null || fragments.has(fragment))
            return false;
        fragments.add(fragment);
        return true;
    };
    if (doc.verificationMethod !== undefined) {
        if (!Array.isArray(doc.verificationMethod))
            return false;
        for (const vm of doc.verificationMethod) {
            if (!claimFragment(methodFragment(vm)))
                return false;
        }
    }
    // Embedded relationship methods first, so references may point at them.
    for (const rel of RELATIONSHIP_PROPS) {
        const value = doc[rel];
        if (value === undefined)
            continue;
        if (!Array.isArray(value))
            return false;
        for (const entry of value) {
            if (typeof entry === "string")
                continue;
            if (!claimFragment(methodFragment(entry)))
                return false;
        }
    }
    // References must resolve to a declared or embedded method — no dangling.
    for (const rel of RELATIONSHIP_PROPS) {
        const value = doc[rel];
        if (!Array.isArray(value))
            continue;
        for (const entry of value) {
            if (typeof entry !== "string")
                continue;
            const fragment = ownFragmentOf(entry, did);
            if (fragment === null || !fragments.has(fragment))
                return false;
        }
    }
    if (doc.service !== undefined) {
        if (!Array.isArray(doc.service))
            return false;
        for (const entry of doc.service) {
            if (!isPlainObject(entry) ||
                !isStringOrStringArray(entry.type) ||
                !isValidServiceEndpoint(entry.serviceEndpoint)) {
                return false;
            }
            // Document ids are unique across methods AND services (DID Core), and
            // `uri` is reserved for the ledger's own URI service appended later.
            const fragment = ownFragmentOf(entry.id, did);
            if (fragment === "uri" || !claimFragment(fragment))
                return false;
        }
    }
    return true;
}
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
// ── resolver ────────────────────────────────────────────────────────────────
export function getResolver(options) {
    const rpcUrls = { ...DEFAULT_RPC_URLS, ...(options?.rpcUrls ?? {}) };
    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const xrpl = async (did) => {
        try {
            const segments = did.split(":");
            if (segments.length !== 4 ||
                segments[0] !== "did" ||
                segments[1] !== "xrpl") {
                return errorResult("invalidDid", "expected did:xrpl:<network-id>:<address-or-public-key>");
            }
            const [, , networkId, idString] = segments;
            if (!/^\d{1,10}$/.test(networkId)) {
                return errorResult("invalidDid", "network-id must be a decimal number");
            }
            // Identify the account: classic address, or master public key.
            let accountId = null;
            let publicKey = null;
            if (PUBKEY_RE.test(idString)) {
                publicKey = hexToBytes(idString.toUpperCase());
                if (publicKey)
                    accountId = accountIdFromPublicKey(publicKey);
            }
            else {
                accountId = decodeAccountId(idString);
            }
            if (!accountId) {
                return errorResult("invalidDid", "identifier is neither a valid classic address nor a 33-byte public key");
            }
            const address = encodeAddress(accountId);
            const rpcBase = rpcUrls[networkId]?.replace(/\/+$/, "");
            if (!rpcBase) {
                return errorResult("notConfigured", `no XRPL endpoint configured for network-id \`${networkId}\``);
            }
            const network = NETWORK_LABELS[networkId] ?? `network-${networkId}`;
            const response = await fetch(rpcBase, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    method: "ledger_entry",
                    params: [{ did: address, ledger_index: "validated" }],
                }),
                signal: AbortSignal.timeout(timeoutMs),
            });
            if (!response.ok) {
                return errorResult("networkError", `XRPL RPC HTTP ${response.status}`);
            }
            const text = await readBounded(response);
            if (text === null) {
                return errorResult("networkError", "response exceeds size bound");
            }
            let result;
            try {
                result = JSON.parse(text).result;
                if (!result || typeof result !== "object")
                    throw new Error("shape");
            }
            catch {
                return errorResult("networkError", "malformed XRPL RPC response");
            }
            // equivalentId: both forms of the DID name the same ledger entry.
            const equivalent = publicKey !== null ? [`did:xrpl:${networkId}:${address}`] : [];
            if (result.error === "entryNotFound") {
                // No DID entry on the ledger → the XLS-40 IMPLICIT document.
                return implicitResult(did, network, publicKey, equivalent);
            }
            if (result.error || !result.node) {
                return errorResult("networkError", result.error_message ?? result.error ?? "empty XRPL RPC result");
            }
            const node = result.node;
            if (node.Account !== address) {
                return errorResult("networkError", "ledger entry account mismatch");
            }
            const metadata = {
                network,
                deactivated: false,
                objectId: node.index,
                previousTxnId: node.PreviousTxnID,
                previousTxnLgrSeq: node.PreviousTxnLgrSeq,
                ...(typeof result.ledger_index === "number"
                    ? { ledgerIndex: result.ledger_index }
                    : {}),
                ...(equivalent.length ? { equivalentId: equivalent } : {}),
            };
            // On-ledger DIDDocument blob: served only when it decodes to a JSON
            // object that passes DID-document structural validation — the ledger
            // does not check this field, so an authored-but-invalid document falls
            // back to the implicit document (raw blob kept in metadata) instead of
            // being normalized into a malformed resolution result.
            let document = null;
            if (node.DIDDocument) {
                const decoded = hexToUtf8(node.DIDDocument);
                let authored;
                try {
                    authored = decoded === null ? undefined : JSON.parse(decoded);
                }
                catch {
                    authored = undefined;
                }
                if (authored &&
                    typeof authored === "object" &&
                    !Array.isArray(authored) &&
                    !isStructurallyValidDocument(authored, did)) {
                    metadata.didDocumentBlobError = "invalidDidDocument";
                    authored = undefined;
                }
                if (authored &&
                    typeof authored === "object" &&
                    !Array.isArray(authored)) {
                    const doc = authored;
                    const authoredId = typeof doc.id === "string" ? doc.id : undefined;
                    const alsoKnownAs = new Set(Array.isArray(doc.alsoKnownAs)
                        ? doc.alsoKnownAs.filter((v) => typeof v === "string")
                        : []);
                    if (authoredId && authoredId !== did)
                        alsoKnownAs.add(authoredId);
                    document = {
                        "@context": doc["@context"] ?? DID_CONTEXT,
                        ...doc,
                        id: did,
                        ...(alsoKnownAs.size ? { alsoKnownAs: [...alsoKnownAs] } : {}),
                    };
                }
                else {
                    metadata.didDocumentBlobHex = node.DIDDocument.toUpperCase();
                }
            }
            if (!document) {
                document = implicitDocument(did, publicKey);
            }
            // URI blob → LinkedResource service + metadata (never fetched here).
            if (node.URI) {
                const uri = hexToUtf8(node.URI);
                if (uri !== null) {
                    metadata.uri = uri;
                    const services = Array.isArray(document.service)
                        ? [...document.service]
                        : [];
                    if (!services.some((s) => s.id === `${did}#uri`)) {
                        services.push({
                            id: `${did}#uri`,
                            type: "LinkedResource",
                            serviceEndpoint: uri,
                        });
                    }
                    document.service = services;
                }
                else {
                    metadata.uriHex = node.URI.toUpperCase();
                }
            }
            // Data blob: public attestations — metadata only.
            if (node.Data) {
                const data = hexToUtf8(node.Data);
                if (data !== null)
                    metadata.attestationData = data;
                else
                    metadata.attestationDataHex = node.Data.toUpperCase();
            }
            return {
                didResolutionMetadata: { contentType: "application/did+ld+json" },
                didDocument: document,
                didDocumentMetadata: metadata,
            };
        }
        catch (cause) {
            return errorResult("networkError", cause instanceof Error ? cause.message.slice(0, 200) : undefined);
        }
    };
    return { xrpl };
}
/** The spec's implicit document: master key for pubkey DIDs, minimal otherwise. */
function implicitDocument(did, publicKey) {
    if (!publicKey) {
        return { "@context": DID_CONTEXT, id: did };
    }
    const keyId = `${did}#master-key`;
    return {
        "@context": [DID_CONTEXT, MULTIKEY_CONTEXT],
        id: did,
        verificationMethod: [
            {
                id: keyId,
                type: "Multikey",
                controller: did,
                publicKeyMultibase: multikey(publicKey),
            },
        ],
        authentication: [keyId],
        assertionMethod: [keyId],
        capabilityInvocation: [keyId],
    };
}
function implicitResult(did, network, publicKey, equivalent) {
    return {
        didResolutionMetadata: { contentType: "application/did+ld+json" },
        didDocument: implicitDocument(did, publicKey),
        didDocumentMetadata: {
            network,
            implicit: true,
            deactivated: false,
            ...(equivalent.length ? { equivalentId: equivalent } : {}),
        },
    };
}
//# sourceMappingURL=resolver.js.map