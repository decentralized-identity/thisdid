import { sha256 } from "@noble/hashes/sha256";
import { blake2b } from "@noble/hashes/blake2b";
/** Chain ids read live from the networks themselves, 24 Aug 2026. */
const CHAIN_IDS = {
    mainnet: "NetXdQprcVkpaWU",
    shadownet: "NetXsqzbfFenSTS",
};
/** TzKT indexer bases (resolution-verified live 24 Aug 2026). */
const DEFAULT_TZKT_URLS = {
    mainnet: ["https://api.tzkt.io"],
    shadownet: ["https://api.shadownet.tzkt.io"],
};
const DEFAULT_TIMEOUT_MS = 6000;
const MAX_RESPONSE_BYTES = 64 * 1024;
const DID_CONTEXT = "https://www.w3.org/ns/did/v1";
function errorResult(error, message) {
    return {
        didResolutionMetadata: { error, ...(message ? { message } : {}) },
        didDocument: null,
        didDocumentMetadata: {},
    };
}
// ── Tezos base58check ───────────────────────────────────────────────────────
const BTC_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58Decode(encoded) {
    let value = 0n;
    for (const char of encoded) {
        const index = BTC_ALPHABET.indexOf(char);
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
        if (char === BTC_ALPHABET[0])
            bytes.unshift(0);
        else
            break;
    }
    return Uint8Array.from(bytes);
}
/** base58check payload after `prefix`, checksum-verified; null when bad. */
export function decodeChecked(encoded, prefix, payloadLength) {
    const raw = base58Decode(encoded);
    if (!raw || raw.length !== prefix.length + payloadLength + 4)
        return null;
    for (let i = 0; i < prefix.length; i++) {
        if (raw[i] !== prefix[i])
            return null;
    }
    const body = raw.subarray(0, raw.length - 4);
    const checksum = sha256(sha256(body)).subarray(0, 4);
    for (let i = 0; i < 4; i++) {
        if (raw[body.length + i] !== checksum[i])
            return null;
    }
    return raw.subarray(prefix.length, body.length);
}
/** Tezos version prefixes (bytes) — addresses and public keys. */
const ADDRESS_PREFIXES = {
    tz1: [6, 161, 159],
    tz2: [6, 161, 161],
    tz3: [6, 161, 164],
    KT1: [2, 90, 121],
};
const KEY_PREFIXES = {
    edpk: { bytes: [13, 15, 37, 217], length: 32, address: "tz1" },
    sppk: { bytes: [3, 254, 226, 86], length: 33, address: "tz2" },
    p2pk: { bytes: [3, 178, 139, 127], length: 33, address: "tz3" },
};
const VM_TYPES = {
    tz1: "Ed25519PublicKeyBLAKE2BDigestSize20Base58CheckEncoded2021",
    tz2: "EcdsaSecp256k1RecoveryMethod2020",
    tz3: "P256PublicKeyBLAKE2BDigestSize20Base58CheckEncoded2021",
};
/**
 * True when `publicKey` (edpk/sppk/p2pk base58check) is the very key whose
 * BLAKE2b-20 digest is the address payload — the reveal relationship.
 */
export function keyMatchesAddress(publicKey, address) {
    const keySpec = KEY_PREFIXES[publicKey.slice(0, 4)];
    if (!keySpec || keySpec.address !== address.slice(0, 3))
        return false;
    const keyBytes = decodeChecked(publicKey, keySpec.bytes, keySpec.length);
    if (!keyBytes)
        return false;
    const payload = decodeChecked(address, ADDRESS_PREFIXES[address.slice(0, 3)], 20);
    if (!payload)
        return false;
    const digest = blake2b(keyBytes, { dkLen: 20 });
    for (let i = 0; i < 20; i++) {
        if (digest[i] !== payload[i])
            return false;
    }
    return true;
}
// ── TzKT public-key discovery ───────────────────────────────────────────────
async function readBounded(response) {
    if (Number(response.headers.get("content-length") ?? 0) > MAX_RESPONSE_BYTES) {
        return null;
    }
    const text = await response.text();
    return text.length > MAX_RESPONSE_BYTES ? null : text;
}
async function discoverKey(endpoints, address, timeoutMs) {
    for (const base of endpoints) {
        try {
            const response = await fetch(`${base}/v1/accounts/${address}?select=publicKey,revealed`, {
                headers: { accept: "application/json" },
                signal: AbortSignal.timeout(timeoutMs),
            });
            if (!response.ok)
                continue;
            const text = await readBounded(response);
            if (text === null)
                continue;
            const parsed = JSON.parse(text);
            if (!parsed || typeof parsed !== "object")
                continue;
            if (!parsed.revealed || typeof parsed.publicKey !== "string") {
                return { state: "unrevealed" };
            }
            return keyMatchesAddress(parsed.publicKey, address)
                ? { state: "verified", publicKey: parsed.publicKey }
                : { state: "mismatch" };
        }
        catch {
            // transport failure — try the next endpoint
        }
    }
    return { state: "unavailable" };
}
// ── resolver ────────────────────────────────────────────────────────────────
export function getResolver(options) {
    const tzktUrls = { ...DEFAULT_TZKT_URLS, ...(options?.tzktUrls ?? {}) };
    const chainIds = { ...CHAIN_IDS, ...(options?.chainIds ?? {}) };
    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const tz = async (did) => {
        try {
            const segments = did.split(":");
            if (segments[0] !== "did" ||
                segments[1] !== "tz" ||
                segments.length < 3 ||
                segments.length > 4) {
                return errorResult("invalidDid", "expected did:tz:(<network>:)?<address>");
            }
            const address = segments[segments.length - 1];
            const network = segments.length === 4 ? segments[2] : "mainnet";
            if (!/^[a-z0-9]{1,32}$/.test(network)) {
                return errorResult("invalidDid", "malformed network segment");
            }
            const prefix = address.slice(0, 3);
            if (prefix === "tz4") {
                return errorResult("invalidDid", "tz4 (BLS) addresses postdate the did:tz specification");
            }
            if (!(prefix in ADDRESS_PREFIXES) || address.length !== 36) {
                return errorResult("invalidDid", "address must be a 36-char tz1/tz2/tz3/KT1 base58check string");
            }
            if (!decodeChecked(address, ADDRESS_PREFIXES[prefix], 20)) {
                return errorResult("invalidDid", "address fails its base58 checksum");
            }
            if (prefix === "KT1") {
                return errorResult("notConfigured", "KT1 smart-contract DIDs need TZIP-19 DID-manager views — not configured");
            }
            const chainId = chainIds[network];
            if (!chainId) {
                return errorResult("notConfigured", `no chain id known for network \`${network}\``);
            }
            const vmId = `${did}#blockchainAccountId`;
            const verificationMethod = {
                id: vmId,
                type: VM_TYPES[prefix],
                controller: did,
                blockchainAccountId: `tezos:${chainId}:${address}`,
            };
            // Chain enrichment: include the revealed public key only when it
            // re-derives the address. Discovery failure degrades to offline.
            const configured = tzktUrls[network];
            const endpoints = (Array.isArray(configured) ? configured : configured ? [configured] : []).map((u) => u.replace(/\/+$/, ""));
            const discovery = endpoints.length
                ? await discoverKey(endpoints, address, timeoutMs)
                : { state: "unavailable" };
            if (discovery.state === "verified") {
                verificationMethod.publicKeyBase58 = discovery.publicKey;
            }
            const document = {
                "@context": DID_CONTEXT,
                id: did,
                verificationMethod: [verificationMethod],
                authentication: [vmId],
                assertionMethod: [vmId],
            };
            return {
                didResolutionMetadata: { contentType: "application/did+ld+json" },
                didDocument: document,
                didDocumentMetadata: {
                    network,
                    deactivated: false,
                    implicit: true,
                    keyDiscovery: discovery.state,
                },
            };
        }
        catch (cause) {
            return errorResult("networkError", cause instanceof Error ? cause.message.slice(0, 200) : undefined);
        }
    };
    return { tz };
}
//# sourceMappingURL=resolver.js.map