/**
 * did:dht resolver for the DIF `did-resolver` interface.
 *
 * A clean-room driver for DID DHT: a `did:dht:<z-base-32-key>` names an
 * Ed25519 Identity Key whose DID document lives as a compressed DNS packet
 * in BitTorrent's Mainline DHT (BEP44 mutable item), reachable over HTTP
 * through a Pkarr relay. Resolution is ONE relay GET, then fully offline,
 * VERIFIED reconstruction:
 *
 *   - the relay payload is `signature (64) ‖ seq (8, big-endian) ‖ v` and
 *     the Ed25519 signature over the bencoded `3:seqi<seq>e1:v<len>:<v>`
 *     is checked against the Identity Key from the DID itself — a relay
 *     (or the DHT) can withhold a record but can never forge one;
 *   - `v` is an RFC1035 DNS packet (compression pointers supported); the
 *     `_did.<id>.` root TXT record maps aliases to `_kN._did.` key records
 *     and `_sN._did.` service records, reversed here per the DID DHT
 *     property mapping (root `deactivated` → deactivated: true);
 *   - key records carry raw public keys (registry types 0 Ed25519,
 *     1 secp256k1, 2 P-256, 3 X25519); EC keys are decompressed to full
 *     `x`/`y` JWKs, unnamed keys get their RFC 7638 JWK Thumbprint as the
 *     verification method id, and `_k0`'s bytes MUST equal the Identity
 *     Key — all per the spec and its registries.
 *
 * The DIF spec (did-dht, W3C-registered) is complete and the Mainline +
 * Pkarr relay rails are live (relay resolution-verified 24 Aug 2026), but
 * records expire unless their owners republish — an absent record answers
 * `notFound`, deliberately NOT the spec's optional identity-key-only
 * fallback document, which would resurrect expired or deactivated DIDs.
 * Resolution-only by construction: no publishing, no republishing.
 */
import type {
  DIDDocument,
  DIDResolutionResult,
  ResolverRegistry,
  Service,
  VerificationMethod,
} from "did-resolver";
import { ed25519, x25519 } from "@noble/curves/ed25519";
import { secp256k1 } from "@noble/curves/secp256k1";
import { p256 } from "@noble/curves/p256";
import { sha256 } from "@noble/hashes/sha256";

export interface DhtResolverOptions {
  /**
   * Pkarr relay base URL(s), tried in order on TRANSPORT failures (a relay
   * 404 — no record on the DHT — is a real answer and never falls through).
   */
  relayUrls?: string[];
  /** Per-request wall-clock bound. Default 6000 ms. */
  timeoutMs?: number;
}

/** The canonical public Pkarr relay (resolution-verified 24 Aug 2026). */
const DEFAULT_RELAY_URLS = ["https://relay.pkarr.org"];
const DEFAULT_TIMEOUT_MS = 6000;
/** BEP44 values are ≤1000 bytes; sig+seq+value stays under 1072. */
const MAX_PAYLOAD_BYTES = 1072;
const DID_CONTEXT = "https://www.w3.org/ns/did/v1";

function errorResult(error: string, message?: string): DIDResolutionResult {
  return {
    didResolutionMetadata: { error, ...(message ? { message } : {}) },
    didDocument: null,
    didDocumentMetadata: {},
  };
}

// ── z-base-32 (the Mainline identifier encoding) ────────────────────────────

const Z32_ALPHABET = "ybndrfg8ejkmcpqxot1uwisza345h769";
const Z32_INDEX = new Map([...Z32_ALPHABET].map((c, i) => [c, i]));

/** 52-char z-base-32 identifier → 32-byte Ed25519 public key; null if bad. */
export function zBase32Decode(encoded: string): Uint8Array | null {
  if (!/^[ybndrfg8ejkmcpqxot1uwisza345h769]{52}$/.test(encoded)) return null;
  const bytes = new Uint8Array(32);
  let buffer = 0;
  let bits = 0;
  let offset = 0;
  for (const char of encoded) {
    buffer = (buffer << 5) | (Z32_INDEX.get(char) as number);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      if (offset < 32) bytes[offset++] = (buffer >> bits) & 0xff;
    }
  }
  return offset === 32 ? bytes : null;
}

/** 32-byte public key → 52-char z-base-32 identifier. */
export function zBase32Encode(bytes: Uint8Array): string {
  let out = "";
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += Z32_ALPHABET[(buffer >> bits) & 0x1f];
    }
  }
  if (bits > 0) out += Z32_ALPHABET[(buffer << (5 - bits)) & 0x1f];
  return out;
}

// ── BEP44 signature ─────────────────────────────────────────────────────────

/**
 * Verify the Ed25519 signature over the bencoded mutable item
 * (`3:seqi<seq>e1:v<len>:<value>`), per BEP44 and the Pkarr relay design.
 */
export function verifyBep44(
  publicKey: Uint8Array,
  signature: Uint8Array,
  seq: bigint,
  value: Uint8Array,
): boolean {
  const prefix = new TextEncoder().encode(`3:seqi${seq}e1:v${value.length}:`);
  const message = new Uint8Array(prefix.length + value.length);
  message.set(prefix, 0);
  message.set(value, prefix.length);
  try {
    return ed25519.verify(signature, message, publicKey);
  } catch {
    return false;
  }
}

// ── RFC1035 DNS packet parsing (TXT and NS answers) ─────────────────────────

interface DnsRecord {
  name: string;
  type: number;
  /** TXT character-strings concatenated; NS target name. */
  data: string;
}

function parseName(
  bytes: Uint8Array,
  start: number,
): { name: string; next: number } | null {
  const labels: string[] = [];
  let pos = start;
  let next = -1;
  let jumps = 0;
  for (;;) {
    if (pos >= bytes.length) return null;
    const length = bytes[pos];
    if (length === 0) {
      if (next < 0) next = pos + 1;
      break;
    }
    if ((length & 0xc0) === 0xc0) {
      // Compression pointer (RFC1035 §4.1.4); bounded against loops.
      if (pos + 1 >= bytes.length || ++jumps > 32) return null;
      if (next < 0) next = pos + 2;
      pos = ((length & 0x3f) << 8) | bytes[pos + 1];
      continue;
    }
    if (pos + 1 + length > bytes.length) return null;
    labels.push(
      String.fromCharCode(...bytes.subarray(pos + 1, pos + 1 + length)),
    );
    pos += 1 + length;
  }
  return { name: labels.join(".").toLowerCase() + ".", next };
}

/** Parse the answer records of an authoritative DNS packet. */
export function parseDnsPacket(bytes: Uint8Array): DnsRecord[] | null {
  if (bytes.length < 12) return null;
  const questionCount = (bytes[4] << 8) | bytes[5];
  const answerCount = (bytes[6] << 8) | bytes[7];
  let pos = 12;
  for (let i = 0; i < questionCount; i++) {
    const name = parseName(bytes, pos);
    if (!name || name.next + 4 > bytes.length) return null;
    pos = name.next + 4;
  }
  const records: DnsRecord[] = [];
  for (let i = 0; i < answerCount; i++) {
    const name = parseName(bytes, pos);
    if (!name || name.next + 10 > bytes.length) return null;
    pos = name.next;
    const type = (bytes[pos] << 8) | bytes[pos + 1];
    const rdLength = (bytes[pos + 8] << 8) | bytes[pos + 9];
    pos += 10;
    if (pos + rdLength > bytes.length) return null;
    const rdata = bytes.subarray(pos, pos + rdLength);
    if (type === 16) {
      // TXT: concatenate the character-strings.
      let data = "";
      let cursor = 0;
      while (cursor < rdata.length) {
        const length = rdata[cursor];
        if (cursor + 1 + length > rdata.length) return null;
        data += String.fromCharCode(
          ...rdata.subarray(cursor + 1, cursor + 1 + length),
        );
        cursor += 1 + length;
      }
      records.push({ name: name.name, type, data });
    } else if (type === 2) {
      const target = parseName(bytes, pos);
      if (!target) return null;
      records.push({ name: name.name, type, data: target.name });
    }
    pos += rdLength;
  }
  return records;
}

// ── property un-mapping ─────────────────────────────────────────────────────

/** `id=M;t=N;k=O` → map; values keep their case, keys are lowercased. */
function parsePairs(data: string): Map<string, string> {
  const pairs = new Map<string, string>();
  for (const part of data.split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0) pairs.set(part.slice(0, eq).toLowerCase(), part.slice(eq + 1));
  }
  return pairs;
}

const B64URL =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function base64UrlDecode(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of value) {
    buffer = (buffer << 6) | B64URL.indexOf(char);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(bytes);
}

function base64UrlEncode(bytes: Uint8Array): string {
  let out = "";
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 6) {
      bits -= 6;
      out += B64URL[(buffer >> bits) & 0x3f];
    }
  }
  if (bits > 0) out += B64URL[(buffer << (6 - bits)) & 0x3f];
  return out;
}

/** The slice of a noble curve needed for SEC1 point decompression. */
interface EcCurve {
  Point: {
    fromBytes(bytes: Uint8Array): { toBytes(compressed?: boolean): Uint8Array };
  };
}

interface KeyTypeSpec {
  kty: "OKP" | "EC";
  crv: string;
  alg: string;
  /** Byte length of the raw key as published (Ed25519/X25519). */
  rawLength?: number;
  /** EC curve for point decompression to x/y coordinates. */
  curve?: EcCurve;
}

/** The spec registry's Key Type Index (0–3), with default algorithms. */
const KEY_TYPES: Record<string, KeyTypeSpec> = {
  "0": { kty: "OKP", crv: "Ed25519", alg: "EdDSA", rawLength: 32 },
  "1": { kty: "EC", crv: "secp256k1", alg: "ES256K", curve: secp256k1 },
  "2": { kty: "EC", crv: "P-256", alg: "ES256", curve: p256 },
  "3": { kty: "OKP", crv: "X25519", alg: "ECDH-ES+A256KW", rawLength: 32 },
};

/** Build the JWK for a key record; null when the bytes don't fit the type. */
function jwkOf(
  type: KeyTypeSpec,
  keyBytes: Uint8Array,
  alg: string,
): Record<string, string> | null {
  if (type.curve) {
    // Compressed (33) or uncompressed (65) SEC1 point → affine x/y.
    try {
      const point = type.curve.Point.fromBytes(keyBytes);
      const raw = point.toBytes(false);
      return {
        kty: type.kty,
        crv: type.crv,
        alg,
        x: base64UrlEncode(raw.subarray(1, 33)),
        y: base64UrlEncode(raw.subarray(33, 65)),
      };
    } catch {
      return null;
    }
  }
  if (keyBytes.length !== type.rawLength) return null;
  if (type.crv === "X25519") {
    // Sanity: a valid Montgomery point produces a shared-secret basepoint op.
    try {
      x25519.getSharedSecret(new Uint8Array(32).fill(1), keyBytes);
    } catch {
      return null;
    }
  }
  return { kty: type.kty, crv: type.crv, alg, x: base64UrlEncode(keyBytes) };
}

/** RFC 7638 JWK Thumbprint (lexicographic required members, SHA-256). */
export function jwkThumbprint(jwk: Record<string, string>): string {
  const members =
    jwk.kty === "EC"
      ? { crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y }
      : { crv: jwk.crv, kty: jwk.kty, x: jwk.x };
  return base64UrlEncode(
    sha256(new TextEncoder().encode(JSON.stringify(members))),
  );
}

const RELATIONSHIPS: [string, string][] = [
  ["auth", "authentication"],
  ["asm", "assertionMethod"],
  ["agm", "keyAgreement"],
  ["inv", "capabilityInvocation"],
  ["del", "capabilityDelegation"],
];

interface Reconstruction {
  document: DIDDocument;
  types?: number[];
  gateways?: string[];
  deactivated: boolean;
}

/**
 * Reverse the DID DHT property mapping: records → DID document. Returns an
 * error string instead of throwing so callers can attribute it.
 */
export function reconstructDocument(
  records: DnsRecord[],
  did: string,
  identityKey: Uint8Array,
): Reconstruction | string {
  const id = did.slice("did:dht:".length);
  const rootName = `_did.${id}.`;
  const sub = (label: string): string | undefined => {
    // Spec: non-root names end in `_did.`; tolerate a fully-qualified form.
    const record = records.find(
      (r) =>
        r.type === 16 &&
        (r.name === `${label}._did.` || r.name === `${label}._did.${id}.`),
    );
    return record?.data;
  };

  const root = records.find((r) => r.type === 16 && r.name === rootName);
  if (!root) return "packet has no _did root record";
  if (root.data.trim().toLowerCase() === "deactivated") {
    return { document: { id: did }, deactivated: true };
  }
  const rootMap = parsePairs(root.data);
  if (rootMap.get("v") !== "0") {
    return `unsupported did:dht packet version ${rootMap.get("v") ?? "(none)"}`;
  }

  const document: DIDDocument = { "@context": DID_CONTEXT, id: did };

  const controller = sub("_cnt");
  if (controller) {
    const list = controller.split(",").filter(Boolean);
    document.controller = list.length === 1 ? list[0] : list;
  }
  const alsoKnownAs = sub("_aka");
  if (alsoKnownAs) {
    document.alsoKnownAs = alsoKnownAs.split(",").filter(Boolean);
  }

  // Verification methods, from the root's vm alias list.
  const aliases = (rootMap.get("vm") ?? "").split(",").filter(Boolean);
  if (!aliases.includes("k0")) return "root record lists no identity key (k0)";
  const idByAlias = new Map<string, string>();
  const methods: VerificationMethod[] = [];
  for (const alias of aliases) {
    if (!/^k\d+$/.test(alias)) return `malformed key alias \`${alias}\``;
    const data = sub(`_${alias}`);
    if (!data) return `missing key record for alias \`${alias}\``;
    const pairs = parsePairs(data);
    const typeSpec = KEY_TYPES[pairs.get("t") ?? ""];
    if (!typeSpec) return `unregistered key type \`${pairs.get("t")}\``;
    const keyBytes = base64UrlDecode(pairs.get("k") ?? "");
    if (!keyBytes || keyBytes.length === 0) {
      return `undecodable key bytes for \`${alias}\``;
    }
    const jwk = jwkOf(typeSpec, keyBytes, pairs.get("a") ?? typeSpec.alg);
    if (!jwk)
      return `key bytes for \`${alias}\` do not fit type ${pairs.get("t")}`;

    let methodId: string;
    if (alias === "k0") {
      // The identity key IS the DID: same curve, same bytes, id `0`.
      if (typeSpec.crv !== "Ed25519") return "identity key must be Ed25519";
      if (
        keyBytes.length !== 32 ||
        keyBytes.some((byte, i) => byte !== identityKey[i])
      ) {
        return "identity key record does not match the DID's key";
      }
      methodId = "0";
    } else {
      methodId = pairs.get("id") || jwkThumbprint(jwk);
    }
    jwk.kid = methodId;
    idByAlias.set(alias, `${did}#${methodId}`);
    methods.push({
      id: `${did}#${methodId}`,
      type: "JsonWebKey",
      controller: pairs.get("c") ?? did,
      publicKeyJwk: jwk as { kty: string } & Record<string, string>,
    });
  }
  document.verificationMethod = methods;

  for (const [short, property] of RELATIONSHIPS) {
    const value = rootMap.get(short);
    if (!value) continue;
    const references: string[] = [];
    for (const alias of value.split(",").filter(Boolean)) {
      const reference = idByAlias.get(alias);
      if (!reference)
        return `relationship \`${short}\` names unknown \`${alias}\``;
      references.push(reference);
    }
    (document as Record<string, unknown>)[property] = references;
  }

  const serviceAliases = (rootMap.get("svc") ?? "").split(",").filter(Boolean);
  if (serviceAliases.length) {
    const services: Service[] = [];
    for (const alias of serviceAliases) {
      if (!/^s\d+$/.test(alias)) return `malformed service alias \`${alias}\``;
      const data = sub(`_${alias}`);
      if (!data) return `missing service record for alias \`${alias}\``;
      const pairs = parsePairs(data);
      const serviceId = pairs.get("id");
      const type = pairs.get("t");
      const endpoint = pairs.get("se");
      if (!serviceId || !type || !endpoint) {
        return `incomplete service record for alias \`${alias}\``;
      }
      const endpoints = endpoint.split(",").filter(Boolean);
      services.push({
        id: `${did}#${serviceId}`,
        type,
        serviceEndpoint: endpoints.length === 1 ? endpoints[0] : endpoints,
      });
    }
    document.service = services;
  }

  const types = sub("_typ");
  const gateways = records
    .filter((r) => r.type === 2 && r.name === rootName)
    .map((r) => r.data);
  return {
    document,
    deactivated: false,
    ...(types
      ? {
          types: types
            .replace(/^id=/, "")
            .split(",")
            .map(Number)
            .filter(Number.isInteger),
        }
      : {}),
    ...(gateways.length ? { gateways } : {}),
  };
}

// ── resolver ────────────────────────────────────────────────────────────────

export function getResolver(options?: DhtResolverOptions): ResolverRegistry {
  const relays = (options?.relayUrls ?? DEFAULT_RELAY_URLS).map((u) =>
    u.replace(/\/+$/, ""),
  );
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const dht = async (did: string): Promise<DIDResolutionResult> => {
    try {
      const segments = did.split(":");
      if (
        segments.length !== 3 ||
        segments[0] !== "did" ||
        segments[1] !== "dht"
      ) {
        return errorResult("invalidDid", "expected did:dht:<z-base-32-key>");
      }
      const identityKey = zBase32Decode(segments[2]);
      if (!identityKey) {
        return errorResult(
          "invalidDid",
          "identifier must be a 52-char z-base-32 Ed25519 public key",
        );
      }
      if (!relays.length) {
        return errorResult("notConfigured", "no Pkarr relay configured");
      }

      // A 404 is the DHT's real answer (no record) and never falls through;
      // transport failures try the next relay.
      let payload: Uint8Array | null = null;
      let missing = false;
      let lastTransportError = "no relay answered";
      for (const relay of relays) {
        try {
          const response = await fetch(`${relay}/${segments[2]}`, {
            signal: AbortSignal.timeout(timeoutMs),
          });
          if (response.status === 404) {
            missing = true;
            break;
          }
          if (!response.ok) {
            lastTransportError = `Pkarr relay HTTP ${response.status}`;
            continue;
          }
          const buffer = new Uint8Array(await response.arrayBuffer());
          if (buffer.length > MAX_PAYLOAD_BYTES) {
            lastTransportError = "payload exceeds the BEP44 size bound";
            continue;
          }
          payload = buffer;
          break;
        } catch (cause) {
          lastTransportError =
            cause instanceof Error
              ? cause.message.slice(0, 200)
              : "fetch failed";
        }
      }
      if (missing) {
        return errorResult(
          "notFound",
          "no record on the DHT — expired, never published, or deactivated by expiry",
        );
      }
      if (payload === null) {
        return errorResult("networkError", lastTransportError);
      }
      if (payload.length < 72) {
        return errorResult("networkError", "payload shorter than sig+seq");
      }

      const signature = payload.subarray(0, 64);
      let seq = 0n;
      for (let i = 64; i < 72; i++) seq = (seq << 8n) | BigInt(payload[i]);
      const value = payload.subarray(72);
      if (!verifyBep44(identityKey, signature, seq, value)) {
        return errorResult(
          "invalidDidDocument",
          "BEP44 signature does not verify against the DID's identity key",
        );
      }

      const records = parseDnsPacket(value);
      if (!records) {
        return errorResult("invalidDidDocument", "undecodable DNS packet");
      }
      const outcome = reconstructDocument(records, did, identityKey);
      if (typeof outcome === "string") {
        return errorResult("invalidDidDocument", outcome);
      }
      if (outcome.deactivated) {
        return {
          didResolutionMetadata: { contentType: "application/did+ld+json" },
          didDocument: null,
          didDocumentMetadata: {
            deactivated: true,
            network: "mainline",
            seq: seq.toString(),
          },
        };
      }
      return {
        didResolutionMetadata: { contentType: "application/did+ld+json" },
        didDocument: outcome.document,
        didDocumentMetadata: {
          network: "mainline",
          deactivated: false,
          seq: seq.toString(),
          signatureVerified: true,
          ...(outcome.types ? { typeIndex: outcome.types } : {}),
          ...(outcome.gateways
            ? { authoritativeGateways: outcome.gateways }
            : {}),
        },
      };
    } catch (cause) {
      return errorResult(
        "networkError",
        cause instanceof Error ? cause.message.slice(0, 200) : undefined,
      );
    }
  };

  return { dht } as ResolverRegistry;
}
