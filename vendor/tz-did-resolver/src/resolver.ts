/**
 * did:tz resolver for the DIF `did-resolver` interface.
 *
 * A clean-room driver for the Tezos DID method: a
 * `did:tz:(<network>:)?<address>` derives its DID document from the address
 * itself (the spec's layer-1 "tier 1 derivation", validated against the
 * Spruce reference implementation in `spruceid/ssi`):
 *
 *   - the address is base58check-validated (Tezos 3-byte version prefixes,
 *     double-SHA-256 checksum); `tz1`/`tz2`/`tz3` map to
 *     Ed25519 / secp256k1 / P-256 verification method types exactly as the
 *     reference does, with a CAIP-10 `blockchainAccountId`
 *     (`tezos:<chain-id>:<address>`);
 *   - the document is then ENRICHED from the chain: one TzKT indexer call
 *     discovers the account's revealed public key, which is only included
 *     after this driver re-derives the address from it (base58check decode,
 *     BLAKE2b-20 hash) — a lying indexer cannot plant a key. TzKT being
 *     unreachable degrades to the pure offline derivation, never to an
 *     error;
 *   - `KT1` smart-contract DIDs need TZIP-19 DID-manager view execution
 *     (the spec's tier 2) and report `notConfigured`, as do the spec's
 *     long-dead named testnets; `tz4` (BLS) addresses postdate the spec and
 *     are rejected as invalid.
 *
 * Networks are pinned by chain id: mainnet (`NetXdQprcVkpaWU`) and the
 * current Shadownet testnet (`NetXsqzbfFenSTS`), both verified live
 * 24 Aug 2026 (Ghostnet was terminated in 2026). Resolution-only by
 * construction; every valid account DID resolves (generative method).
 */
import type {
  DIDDocument,
  DIDResolutionResult,
  ResolverRegistry,
} from "did-resolver";
import { sha256 } from "@noble/hashes/sha256";
import { blake2b } from "@noble/hashes/blake2b";

export interface TzResolverOptions {
  /**
   * Network → TzKT API base URL(s) for public-key discovery. A string pins
   * one endpoint; an array is tried in order on transport failures.
   * Discovery failures degrade to the offline document, never to an error.
   */
  tzktUrls?: Record<string, string | string[]>;
  /** Extra network → CAIP-2 chain id (genesis) mappings. */
  chainIds?: Record<string, string>;
  /** Per-request wall-clock bound. Default 6000 ms. */
  timeoutMs?: number;
}

/** Chain ids read live from the networks themselves, 24 Aug 2026. */
const CHAIN_IDS: Record<string, string> = {
  mainnet: "NetXdQprcVkpaWU",
  shadownet: "NetXsqzbfFenSTS",
};

/** TzKT indexer bases (resolution-verified live 24 Aug 2026). */
const DEFAULT_TZKT_URLS: Record<string, string[]> = {
  mainnet: ["https://api.tzkt.io"],
  shadownet: ["https://api.shadownet.tzkt.io"],
};

const DEFAULT_TIMEOUT_MS = 6000;
const MAX_RESPONSE_BYTES = 64 * 1024;
const DID_CONTEXT = "https://www.w3.org/ns/did/v1";

function errorResult(error: string, message?: string): DIDResolutionResult {
  return {
    didResolutionMetadata: { error, ...(message ? { message } : {}) },
    didDocument: null,
    didDocumentMetadata: {},
  };
}

// ── Tezos base58check ───────────────────────────────────────────────────────

const BTC_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Decode(encoded: string): Uint8Array | null {
  let value = 0n;
  for (const char of encoded) {
    const index = BTC_ALPHABET.indexOf(char);
    if (index < 0) return null;
    value = value * 58n + BigInt(index);
  }
  const bytes: number[] = [];
  while (value > 0n) {
    bytes.unshift(Number(value & 0xffn));
    value >>= 8n;
  }
  for (const char of encoded) {
    if (char === BTC_ALPHABET[0]) bytes.unshift(0);
    else break;
  }
  return Uint8Array.from(bytes);
}

/** base58check payload after `prefix`, checksum-verified; null when bad. */
export function decodeChecked(
  encoded: string,
  prefix: readonly number[],
  payloadLength: number,
): Uint8Array | null {
  const raw = base58Decode(encoded);
  if (!raw || raw.length !== prefix.length + payloadLength + 4) return null;
  for (let i = 0; i < prefix.length; i++) {
    if (raw[i] !== prefix[i]) return null;
  }
  const body = raw.subarray(0, raw.length - 4);
  const checksum = sha256(sha256(body)).subarray(0, 4);
  for (let i = 0; i < 4; i++) {
    if (raw[body.length + i] !== checksum[i]) return null;
  }
  return raw.subarray(prefix.length, body.length);
}

/** Tezos version prefixes (bytes) — addresses and public keys. */
const ADDRESS_PREFIXES: Record<string, readonly number[]> = {
  tz1: [6, 161, 159],
  tz2: [6, 161, 161],
  tz3: [6, 161, 164],
  KT1: [2, 90, 121],
};
const KEY_PREFIXES: Record<
  string,
  { bytes: readonly number[]; length: number; address: string }
> = {
  edpk: { bytes: [13, 15, 37, 217], length: 32, address: "tz1" },
  sppk: { bytes: [3, 254, 226, 86], length: 33, address: "tz2" },
  p2pk: { bytes: [3, 178, 139, 127], length: 33, address: "tz3" },
};

const VM_TYPES: Record<string, string> = {
  tz1: "Ed25519PublicKeyBLAKE2BDigestSize20Base58CheckEncoded2021",
  tz2: "EcdsaSecp256k1RecoveryMethod2020",
  tz3: "P256PublicKeyBLAKE2BDigestSize20Base58CheckEncoded2021",
};

/**
 * True when `publicKey` (edpk/sppk/p2pk base58check) is the very key whose
 * BLAKE2b-20 digest is the address payload — the reveal relationship.
 */
export function keyMatchesAddress(publicKey: string, address: string): boolean {
  const keySpec = KEY_PREFIXES[publicKey.slice(0, 4)];
  if (!keySpec || keySpec.address !== address.slice(0, 3)) return false;
  const keyBytes = decodeChecked(publicKey, keySpec.bytes, keySpec.length);
  if (!keyBytes) return false;
  const payload = decodeChecked(
    address,
    ADDRESS_PREFIXES[address.slice(0, 3)],
    20,
  );
  if (!payload) return false;
  const digest = blake2b(keyBytes, { dkLen: 20 });
  for (let i = 0; i < 20; i++) {
    if (digest[i] !== payload[i]) return false;
  }
  return true;
}

// ── TzKT public-key discovery ───────────────────────────────────────────────

async function readBounded(response: Response): Promise<string | null> {
  if (
    Number(response.headers.get("content-length") ?? 0) > MAX_RESPONSE_BYTES
  ) {
    return null;
  }
  const text = await response.text();
  return text.length > MAX_RESPONSE_BYTES ? null : text;
}

type KeyDiscovery =
  | { state: "verified"; publicKey: string }
  | { state: "unrevealed" | "unavailable" | "mismatch" };

async function discoverKey(
  endpoints: string[],
  address: string,
  timeoutMs: number,
): Promise<KeyDiscovery> {
  for (const base of endpoints) {
    try {
      const response = await fetch(
        `${base}/v1/accounts/${address}?select=publicKey,revealed`,
        {
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(timeoutMs),
        },
      );
      if (!response.ok) continue;
      const text = await readBounded(response);
      if (text === null) continue;
      const parsed = JSON.parse(text) as {
        publicKey?: string | null;
        revealed?: boolean;
      };
      if (!parsed || typeof parsed !== "object") continue;
      if (!parsed.revealed || typeof parsed.publicKey !== "string") {
        return { state: "unrevealed" };
      }
      return keyMatchesAddress(parsed.publicKey, address)
        ? { state: "verified", publicKey: parsed.publicKey }
        : { state: "mismatch" };
    } catch {
      // transport failure — try the next endpoint
    }
  }
  return { state: "unavailable" };
}

// ── resolver ────────────────────────────────────────────────────────────────

export function getResolver(options?: TzResolverOptions): ResolverRegistry {
  const tzktUrls = { ...DEFAULT_TZKT_URLS, ...(options?.tzktUrls ?? {}) };
  const chainIds = { ...CHAIN_IDS, ...(options?.chainIds ?? {}) };
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const tz = async (did: string): Promise<DIDResolutionResult> => {
    try {
      const segments = did.split(":");
      if (
        segments[0] !== "did" ||
        segments[1] !== "tz" ||
        segments.length < 3 ||
        segments.length > 4
      ) {
        return errorResult(
          "invalidDid",
          "expected did:tz:(<network>:)?<address>",
        );
      }
      const address = segments[segments.length - 1];
      const network = segments.length === 4 ? segments[2] : "mainnet";
      if (!/^[a-z0-9]{1,32}$/.test(network)) {
        return errorResult("invalidDid", "malformed network segment");
      }
      const prefix = address.slice(0, 3);
      if (prefix === "tz4") {
        return errorResult(
          "invalidDid",
          "tz4 (BLS) addresses postdate the did:tz specification",
        );
      }
      if (!(prefix in ADDRESS_PREFIXES) || address.length !== 36) {
        return errorResult(
          "invalidDid",
          "address must be a 36-char tz1/tz2/tz3/KT1 base58check string",
        );
      }
      if (!decodeChecked(address, ADDRESS_PREFIXES[prefix], 20)) {
        return errorResult("invalidDid", "address fails its base58 checksum");
      }
      if (prefix === "KT1") {
        return errorResult(
          "notConfigured",
          "KT1 smart-contract DIDs need TZIP-19 DID-manager views — not configured",
        );
      }
      const chainId = chainIds[network];
      if (!chainId) {
        return errorResult(
          "notConfigured",
          `no chain id known for network \`${network}\``,
        );
      }

      const vmId = `${did}#blockchainAccountId`;
      const verificationMethod: Record<string, unknown> = {
        id: vmId,
        type: VM_TYPES[prefix],
        controller: did,
        blockchainAccountId: `tezos:${chainId}:${address}`,
      };

      // Chain enrichment: include the revealed public key only when it
      // re-derives the address. Discovery failure degrades to offline.
      const configured = tzktUrls[network];
      const endpoints = (
        Array.isArray(configured) ? configured : configured ? [configured] : []
      ).map((u) => u.replace(/\/+$/, ""));
      const discovery = endpoints.length
        ? await discoverKey(endpoints, address, timeoutMs)
        : ({ state: "unavailable" } as KeyDiscovery);
      if (discovery.state === "verified") {
        verificationMethod.publicKeyBase58 = discovery.publicKey;
      }

      const document: DIDDocument = {
        "@context": DID_CONTEXT,
        id: did,
        verificationMethod: [verificationMethod as never],
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
    } catch (cause) {
      return errorResult(
        "networkError",
        cause instanceof Error ? cause.message.slice(0, 200) : undefined,
      );
    }
  };

  return { tz } as ResolverRegistry;
}
