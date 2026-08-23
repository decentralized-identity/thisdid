import { ed25519 } from "@noble/curves/ed25519";
import { sha256 } from "@noble/hashes/sha256";
import { keccak_256 } from "@noble/hashes/sha3";
const DEFAULT_TIMEOUT_MS = 6000;
const MAX_RESPONSE_BYTES = 1024 * 1024;
/** DID accounts are small (services + keys); bound before decoding. */
const MAX_ACCOUNT_BYTES = 64 * 1024;
const DID_SOL_PROGRAM = "didso1Dpqpm4CsiCjzP766BGY89CAdD6ZBL68cRhFPc";
const LEGACY_DID_SOL_PROGRAM = "idDa4XeCjVwKcprVAo812coUQbovSZ4kDGJf2sPaBnM";
const MODERN_SEED = "did-account";
const LEGACY_SEED = "sol";
const PDA_MARKER = "ProgramDerivedAddress";
const W3ID_CONTEXT = "https://w3id.org/did/v1.0";
const MODERN_SOL_CONTEXT = "https://w3id.org/sol/v2.0";
const DEFAULT_FRAGMENT = "default";
/** Program `VerificationMethodFlags` bits. */
const FLAG_AUTHENTICATION = 1 << 0;
const FLAG_ASSERTION = 1 << 1;
const FLAG_KEY_AGREEMENT = 1 << 2;
const FLAG_CAPABILITY_INVOCATION = 1 << 3;
const FLAG_CAPABILITY_DELEGATION = 1 << 4;
const FLAG_DID_DOC_HIDDEN = 1 << 5;
/** Program `VerificationMethodType` discriminants. */
const METHOD_TYPES = {
    0: "Ed25519VerificationKey2018",
    1: "EcdsaSecp256k1RecoveryMethod2020",
    2: "EcdsaSecp256k1VerificationKey2019",
};
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
// ── base58 ──────────────────────────────────────────────────────────────────
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58Decode(encoded) {
    let value = 0n;
    for (const char of encoded) {
        const index = BASE58_ALPHABET.indexOf(char);
        if (index < 0)
            return undefined;
        value = value * 58n + BigInt(index);
    }
    let hex = value.toString(16);
    if (hex.length % 2)
        hex = "0" + hex;
    const bytes = hex === "0" ? [] : (hex.match(/.{2}/g) ?? []).map((b) => parseInt(b, 16));
    let leading = 0;
    for (const char of encoded) {
        if (char === "1")
            leading++;
        else
            break;
    }
    return new Uint8Array([...new Array(leading).fill(0), ...bytes]);
}
function base58Encode(bytes) {
    let value = 0n;
    for (const byte of bytes)
        value = value * 256n + BigInt(byte);
    let out = "";
    while (value > 0n) {
        out = BASE58_ALPHABET[Number(value % 58n)] + out;
        value /= 58n;
    }
    for (const byte of bytes) {
        if (byte === 0)
            out = "1" + out;
        else
            break;
    }
    return out || "1";
}
// ── program-derived addresses ───────────────────────────────────────────────
function onEd25519Curve(bytes) {
    try {
        ed25519.ExtendedPoint.fromHex(toHex(bytes));
        return true;
    }
    catch {
        return false;
    }
}
const toHex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
/** Solana findProgramAddress: highest bump whose hash is off-curve. */
function findProgramAddress(seeds, programId) {
    const marker = new TextEncoder().encode(PDA_MARKER);
    for (let bump = 255; bump >= 0; bump--) {
        const preimage = new Uint8Array([
            ...seeds.flatMap((s) => [...s]),
            bump,
            ...programId,
            ...marker,
        ]);
        const hash = sha256(preimage);
        if (!onEd25519Curve(hash))
            return hash;
    }
    throw new ResolutionError("internalError", "no valid PDA bump");
}
// ── borsh reading ───────────────────────────────────────────────────────────
class Reader {
    data;
    offset = 0;
    view;
    constructor(data) {
        this.data = data;
        this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    }
    need(n) {
        if (this.offset + n > this.data.length) {
            throw new ResolutionError("invalidDidDocument", "malformed on-chain DID account");
        }
    }
    u8() {
        this.need(1);
        return this.data[this.offset++];
    }
    u16() {
        this.need(2);
        const v = this.view.getUint16(this.offset, true);
        this.offset += 2;
        return v;
    }
    u32() {
        this.need(4);
        const v = this.view.getUint32(this.offset, true);
        this.offset += 4;
        return v;
    }
    skip(n) {
        this.need(n);
        this.offset += n;
    }
    bytes(n) {
        this.need(n);
        const v = this.data.subarray(this.offset, this.offset + n);
        this.offset += n;
        return v;
    }
    string() {
        const length = this.u32();
        if (length > MAX_ACCOUNT_BYTES) {
            throw new ResolutionError("invalidDidDocument", "malformed on-chain DID account");
        }
        return new TextDecoder().decode(this.bytes(length));
    }
    vec(read) {
        const length = this.u32();
        if (length > 4096) {
            throw new ResolutionError("invalidDidDocument", "malformed on-chain DID account");
        }
        return Array.from({ length }, read);
    }
    vecBytes() {
        const length = this.u32();
        if (length > MAX_ACCOUNT_BYTES) {
            throw new ResolutionError("invalidDidDocument", "malformed on-chain DID account");
        }
        return this.bytes(length).slice();
    }
}
/** Current program: Anchor discriminator + borsh `DidAccount`. */
function decodeModernAccount(data) {
    const reader = new Reader(data);
    reader.skip(8); // anchor account discriminator
    reader.u8(); // version
    reader.u8(); // bump
    reader.skip(8); // nonce
    const method = () => ({
        fragment: reader.string(),
        flags: reader.u16(),
        methodType: reader.u8(),
        keyData: reader.vecBytes(),
    });
    const initial = method();
    const rest = reader.vec(method);
    const services = reader.vec(() => ({
        fragment: reader.string(),
        serviceType: reader.string(),
        serviceEndpoint: reader.string(),
    }));
    const nativeControllers = reader.vec(() => reader.bytes(32).slice());
    const otherControllers = reader.vec(() => reader.string());
    return {
        methods: [initial, ...rest],
        services,
        nativeControllers,
        otherControllers,
        solContextVersion: "2.0",
    };
}
/** Legacy program: raw borsh `LegacyDidAccount`, mapped per its `migrate()`. */
function decodeLegacyAccount(data, authority) {
    const reader = new Reader(data);
    reader.u8(); // account_version
    const storedAuthority = reader.bytes(32);
    if (base58Encode(storedAuthority) !== base58Encode(authority)) {
        throw new ResolutionError("invalidDidDocument", "legacy account authority mismatch");
    }
    const version = reader.string();
    const nativeControllers = reader.vec(() => reader.bytes(32).slice());
    const storedMethods = reader.vec(() => ({
        id: reader.string(),
        verificationType: reader.string(),
        pubkey: reader.bytes(32).slice(),
    }));
    const authentication = reader.vec(() => reader.string());
    const capabilityInvocation = reader.vec(() => reader.string());
    const capabilityDelegation = reader.vec(() => reader.string());
    const keyAgreement = reader.vec(() => reader.string());
    const assertionMethod = reader.vec(() => reader.string());
    const services = reader.vec(() => {
        const service = {
            fragment: reader.string(),
            serviceType: reader.string(),
            serviceEndpoint: reader.string(),
        };
        reader.string(); // description — dropped, as in the on-chain migration
        return service;
    });
    const flagsFor = (fragment) => (authentication.includes(fragment) ? FLAG_AUTHENTICATION : 0) |
        (assertionMethod.includes(fragment) ? FLAG_ASSERTION : 0) |
        (keyAgreement.includes(fragment) ? FLAG_KEY_AGREEMENT : 0) |
        (capabilityInvocation.includes(fragment) ? FLAG_CAPABILITY_INVOCATION : 0) |
        (capabilityDelegation.includes(fragment) ? FLAG_CAPABILITY_DELEGATION : 0);
    const methods = [
        {
            fragment: DEFAULT_FRAGMENT,
            flags: flagsFor(DEFAULT_FRAGMENT),
            methodType: 0,
            keyData: authority,
        },
        ...storedMethods.map((m) => ({
            fragment: m.id,
            flags: flagsFor(m.id),
            methodType: 0, // legacy methods are Ed25519, as in migrate()
            keyData: m.pubkey,
        })),
    ];
    return {
        methods,
        services,
        nativeControllers,
        otherControllers: [],
        solContextVersion: version || "1",
    };
}
// ── document composition (ported from mapVerificationMethodsToDidComponents) ─
/** EIP-55 checksummed hex address for EcdsaSecp256k1RecoveryMethod2020. */
function checksumAddress(bytes) {
    const hex = toHex(bytes);
    const hash = toHex(keccak_256(new TextEncoder().encode(hex)));
    let out = "0x";
    for (let i = 0; i < hex.length; i++) {
        out += parseInt(hash[i], 16) >= 8 ? hex[i].toUpperCase() : hex[i];
    }
    return out;
}
function composeDocument(did, cluster, state) {
    const verificationMethod = [];
    const relationships = {};
    const push = (bucket, fragment) => (relationships[bucket] ??= []).push(`${did}#${fragment}`);
    for (const method of state.methods) {
        if (method.flags & FLAG_DID_DOC_HIDDEN)
            continue;
        if (method.flags & FLAG_AUTHENTICATION)
            push("authentication", method.fragment);
        if (method.flags & FLAG_ASSERTION)
            push("assertionMethod", method.fragment);
        if (method.flags & FLAG_KEY_AGREEMENT)
            push("keyAgreement", method.fragment);
        if (method.flags & FLAG_CAPABILITY_INVOCATION) {
            push("capabilityInvocation", method.fragment);
        }
        if (method.flags & FLAG_CAPABILITY_DELEGATION) {
            push("capabilityDelegation", method.fragment);
        }
        const type = METHOD_TYPES[method.methodType];
        if (!type) {
            throw new ResolutionError("invalidDidDocument", `unknown verification method type ${method.methodType}`);
        }
        const vm = {
            id: `${did}#${method.fragment}`,
            type,
            controller: did,
        };
        if (method.methodType === 0) {
            if (method.keyData.length !== 32) {
                throw new ResolutionError("invalidDidDocument", "malformed Ed25519 key");
            }
            vm.publicKeyBase58 = base58Encode(method.keyData);
        }
        else if (method.methodType === 1) {
            if (method.keyData.length !== 20) {
                throw new ResolutionError("invalidDidDocument", "malformed eth address");
            }
            vm.ethereumAddress =
                checksumAddress(method.keyData);
        }
        else {
            vm.publicKeyHex = toHex(method.keyData);
        }
        verificationMethod.push(vm);
    }
    const service = state.services.map((s) => ({
        id: `${did}#${s.fragment}`,
        type: s.serviceType,
        serviceEndpoint: s.serviceEndpoint,
    }));
    const clusterPrefix = cluster === "mainnet" ? "" : `${cluster}:`;
    const controller = [
        ...state.nativeControllers.map((key) => `did:sol:${clusterPrefix}${base58Encode(key)}`),
        ...state.otherControllers,
    ];
    return {
        "@context": [
            W3ID_CONTEXT,
            `https://w3id.org/sol/v${state.solContextVersion}`,
        ],
        id: did,
        ...(controller.length ? { controller } : {}),
        verificationMethod,
        ...relationships,
        ...(service.length ? { service } : {}),
    };
}
/** Generative document: authority key only, capabilityInvocation. */
function generativeState(authority) {
    return {
        methods: [
            {
                fragment: DEFAULT_FRAGMENT,
                flags: FLAG_CAPABILITY_INVOCATION,
                methodType: 0,
                keyData: authority,
            },
        ],
        services: [],
        nativeControllers: [],
        otherControllers: [],
        solContextVersion: "2.0",
    };
}
// ── resolver ────────────────────────────────────────────────────────────────
export function getResolver(options) {
    const rpcUrls = options?.rpcUrls ?? {};
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
    async function fetchAccounts(rpcUrl, addresses) {
        const response = await fetch(rpcUrl, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: "sol-did-resolver",
                method: "getMultipleAccounts",
                params: [addresses, { encoding: "base64", commitment: "confirmed" }],
            }),
            signal: AbortSignal.timeout(timeoutMs),
        });
        if (!response.ok) {
            throw new ResolutionError("networkError", `RPC HTTP ${response.status}`);
        }
        const text = await readBounded(response);
        if (text === null) {
            throw new ResolutionError("networkError", "response exceeds size bound");
        }
        const body = JSON.parse(text);
        if (body.error) {
            throw new ResolutionError("networkError", String(body.error.message ?? "RPC error").slice(0, 160));
        }
        const values = body.result?.value;
        if (!Array.isArray(values)) {
            throw new ResolutionError("invalidResponse", "malformed RPC response");
        }
        return values.map((value) => {
            if (!value)
                return null;
            const bytes = Uint8Array.from(atob(value.data[0]), (c) => c.charCodeAt(0));
            if (bytes.length > MAX_ACCOUNT_BYTES) {
                throw new ResolutionError("invalidDidDocument", "on-chain account exceeds size bound");
            }
            return { owner: value.owner, data: bytes };
        });
    }
    const sol = async (did) => {
        try {
            const segments = did.split(":");
            if (segments[0] !== "did" || segments[1] !== "sol") {
                return errorResult("invalidDid");
            }
            let cluster = "mainnet";
            let authorityB58;
            if (segments.length === 3) {
                authorityB58 = segments[2];
            }
            else if (segments.length === 4) {
                cluster = segments[2];
                authorityB58 = segments[3];
                if (!["devnet", "testnet", "localnet", "mainnet"].includes(cluster)) {
                    return errorResult("invalidDid", `unknown cluster \`${cluster}\``);
                }
            }
            else {
                return errorResult("invalidDid");
            }
            const authority = authorityB58.length <= 64 ? base58Decode(authorityB58) : undefined;
            if (!authority || authority.length !== 32) {
                return errorResult("invalidDid", "identifier is not a 32-byte key");
            }
            const rpcUrl = rpcUrls[cluster];
            if (!rpcUrl) {
                // Fail closed: without chain access a generative-only answer could
                // hide on-chain key rotations or revocations.
                return errorResult("notConfigured", `no RPC endpoint configured for cluster \`${cluster}\``);
            }
            const programId = base58Decode(DID_SOL_PROGRAM);
            const legacyProgramId = base58Decode(LEGACY_DID_SOL_PROGRAM);
            const modernPda = findProgramAddress([new TextEncoder().encode(MODERN_SEED), authority], programId);
            const legacyPda = findProgramAddress([authority, new TextEncoder().encode(LEGACY_SEED)], legacyProgramId);
            const [modern, legacy] = await fetchAccounts(rpcUrl, [
                base58Encode(modernPda),
                base58Encode(legacyPda),
            ]);
            // A DATA-BEARING account at a DID PDA owned by an unexpected program is
            // an integrity anomaly and fails closed. A zero-data account is normal:
            // anyone can create a system-owned stub at any address by transferring
            // lamports, and only the deriving program can ever allocate data at its
            // own PDA — so lamport dust must keep resolving generatively.
            const unexpectedOwner = (account, expected) => account !== null &&
                account.owner !== expected &&
                account.data.length > 0;
            if (unexpectedOwner(modern, DID_SOL_PROGRAM) ||
                unexpectedOwner(legacy, LEGACY_DID_SOL_PROGRAM)) {
                return errorResult("invalidDidDocument", "account at a DID PDA is owned by an unexpected program");
            }
            let state;
            if (modern && modern.owner === DID_SOL_PROGRAM) {
                state = decodeModernAccount(modern.data);
            }
            else if (legacy && legacy.owner === LEGACY_DID_SOL_PROGRAM) {
                state = decodeLegacyAccount(legacy.data, authority);
            }
            else {
                state = generativeState(authority);
            }
            return {
                didResolutionMetadata: { contentType: "application/did+ld+json" },
                didDocument: composeDocument(did, cluster, state),
                didDocumentMetadata: {},
            };
        }
        catch (cause) {
            if (cause instanceof ResolutionError) {
                return errorResult(cause.code, cause.message);
            }
            return errorResult("networkError", cause instanceof Error ? cause.message.slice(0, 200) : undefined);
        }
    };
    return { sol };
}
//# sourceMappingURL=resolver.js.map