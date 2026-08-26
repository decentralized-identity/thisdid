/**
 * did:iota resolver for the DIF `did-resolver` interface.
 *
 * A clean-room driver for the IOTA DID method v2.0 on IOTA Rebased (MoveVM):
 * a `did:iota:(<network>:)?0x<64-hex>` names a shared `Identity` Move object
 * whose `did_doc` multicontroller value holds the byte-packed DID document.
 * Resolution is a single `iota_getObject` JSON-RPC call against a fullnode,
 * then a fully offline unpack:
 *
 *   - the object's Move type must be `<package>::identity::Identity` with the
 *     package id in the network's published identity-package history (the
 *     well-known package registry vendored below was taken from
 *     `iotaledger/identity` and the chain identifiers were read live from the
 *     networks themselves on 24 Aug 2026);
 *   - the `controlled_value` bytes carry a `DID` magic, a version byte (1),
 *     an encoding byte (0 = plain JSON) and a little-endian u16 payload
 *     length, followed by `{ doc, meta }` JSON — validated byte-for-byte
 *     against live mainnet Identity objects before implementation;
 *   - every `did:0:0` placeholder in the stored document is replaced with
 *     the canonical DID, per the method spec's Read operation;
 *   - the spec's network assertion is enforced: each endpoint's
 *     `iota_getChainIdentifier` answer is checked (and cached per isolate)
 *     against the chain id the DID's network segment implies, so a
 *     misconfigured endpoint can never serve another network's objects.
 *
 * `deleted_did` Identities resolve to `deactivated: true` with no document.
 * Resolution-only by construction: no create/update machinery, no wallets.
 */
import type {
  DIDDocument,
  DIDResolutionResult,
  ResolverRegistry,
} from "did-resolver";

export interface IotaResolverOptions {
  /**
   * Network alias (`iota` | `testnet` | `devnet` — or a custom 8-hex chain
   * id) → fullnode JSON-RPC base URL(s). A string pins one endpoint; an
   * array is tried in order on TRANSPORT failures (a consensus answer —
   * including `notExists` — never falls through). Defaults below.
   */
  rpcUrls?: Record<string, string | string[]>;
  /** Per-request wall-clock bound. Default 6000 ms. */
  timeoutMs?: number;
}

/**
 * Public fullnode endpoints keyed by the method spec's network aliases
 * (all resolution-verified live 24 Aug 2026).
 */
const DEFAULT_RPC_URLS: Record<string, string[]> = {
  iota: ["https://api.mainnet.iota.cafe"],
  testnet: ["https://api.testnet.iota.cafe"],
  devnet: ["https://api.devnet.iota.cafe"],
};

/**
 * Network alias → chain identifier (the first 8 hex chars of the genesis
 * checkpoint digest). Read live from each network's
 * `iota_getChainIdentifier` on 24 Aug 2026.
 */
const CHAIN_IDS: Record<string, string> = {
  iota: "6364aad5",
  testnet: "2304aa97",
  devnet: "daf90477",
};

/**
 * Identity-package history per network, oldest first — the well-known
 * registry vendored from `iotaledger/identity`
 * (identity_iota_core/src/rebased/iota/package.rs, main @ 24 Aug 2026).
 * An `Identity` object's Move type must come from one of these packages.
 */
const IDENTITY_PACKAGES: Record<string, string[]> = {
  iota: [
    "0x84cf5d12de2f9731a89bb519bc0c982a941b319a33abefdd5ed2054ad931de08",
    "0x36d0d56aea27a59f620ba32b6dd47a5e68d810714468bd270fda5ad37a478767",
  ],
  testnet: [
    "0x222741bbdff74b42df48a7b4733185e9b24becb8ccfbafe8eac864ab4e4cc555",
    "0x3403da7ec4cd2ff9bdf6f34c0b8df5a2bd62c798089feb0d2ebf1c2e953296dc",
    "0x29359d33a2e84f04407da0d6cff15dd8ad271c75493ef6b78f381993e4c0abb0",
  ],
  devnet: [
    "0x8896ab04fe24c044c54925df3f8a7c383a8d1d6f6bbb95d1c57cfa94c75e520d",
  ],
};

const DEFAULT_TIMEOUT_MS = 6000;
const MAX_RESPONSE_BYTES = 256 * 1024;
const DID_CONTEXT = "https://www.w3.org/ns/did/v1";
/** The stored document's self-reference placeholder, per the method spec. */
const PLACEHOLDER = "did:0:0";

const OBJECT_ID_RE = /^0x[0-9a-f]{64}$/;
const CHAIN_ID_RE = /^[0-9a-f]{8}$/;
const IDENTITY_TYPE_RE = /^(0x[0-9a-f]{64})::identity::Identity$/;

function errorResult(error: string, message?: string): DIDResolutionResult {
  return {
    didResolutionMetadata: { error, ...(message ? { message } : {}) },
    didDocument: null,
    didDocumentMetadata: {},
  };
}

// ── JSON-RPC transport ──────────────────────────────────────────────────────

async function readBounded(response: Response): Promise<string | null> {
  if (
    Number(response.headers.get("content-length") ?? 0) > MAX_RESPONSE_BYTES
  ) {
    return null;
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
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

/** JSON-RPC call; returns the parsed envelope or a transport-error string. */
async function rpcCall(
  endpoint: string,
  method: string,
  params: unknown[],
  timeoutMs: number,
): Promise<{ result?: unknown; error?: string }> {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return { error: `IOTA RPC HTTP ${response.status}` };
    const text = await readBounded(response);
    if (text === null) return { error: "response exceeds size bound" };
    let parsed: { result?: unknown; error?: { message?: string } };
    try {
      parsed = JSON.parse(text) as typeof parsed;
      if (!parsed || typeof parsed !== "object") throw new Error("shape");
    } catch {
      return { error: "malformed IOTA RPC response" };
    }
    if (parsed.error) {
      return { error: parsed.error.message ?? "IOTA RPC error" };
    }
    return { result: parsed.result };
  } catch (cause) {
    return {
      error:
        cause instanceof Error ? cause.message.slice(0, 200) : "fetch failed",
    };
  }
}

/**
 * Chain-identifier assertions, cached per isolate: one extra RPC per
 * endpoint lifetime, so the spec's "assert the node serves the DID's
 * network" check is effectively free on the hot path.
 */
const chainIdCache = new Map<string, string>();

async function assertChain(
  endpoint: string,
  expected: string,
  timeoutMs: number,
): Promise<string | null> {
  let actual = chainIdCache.get(endpoint);
  if (!actual) {
    const answer = await rpcCall(
      endpoint,
      "iota_getChainIdentifier",
      [],
      timeoutMs,
    );
    if (typeof answer.result !== "string") {
      return answer.error ?? "chain identifier unavailable";
    }
    actual = answer.result;
    chainIdCache.set(endpoint, actual);
  }
  return actual === expected
    ? null
    : `endpoint serves chain ${actual}, expected ${expected}`;
}

/** Test hook: clear the per-isolate chain-identifier cache. */
export function resetChainIdCache(): void {
  chainIdCache.clear();
}

// ── Identity object unpacking ───────────────────────────────────────────────

interface GetObjectAnswer {
  data?: {
    objectId?: string;
    type?: string;
    content?: {
      dataType?: string;
      type?: string;
      fields?: Record<string, unknown>;
    };
  };
  error?: { code?: string; object_id?: string };
}

interface UnpackedDocument {
  doc: Record<string, unknown>;
  meta: { created?: string; updated?: string };
}

/**
 * Unpack the `controlled_value` bytes: `DID` magic, version 1, encoding 0
 * (plain JSON), little-endian u16 payload length, `{ doc, meta }` payload.
 * Returns an error string instead of throwing so callers can attribute it.
 */
export function unpackDidDocument(
  bytes: Uint8Array,
): UnpackedDocument | string {
  if (bytes.length < 7) return "document bytes too short";
  if (bytes[0] !== 0x44 || bytes[1] !== 0x49 || bytes[2] !== 0x44) {
    return "missing DID magic bytes";
  }
  if (bytes[3] !== 1) return `unsupported document version ${bytes[3]}`;
  if (bytes[4] !== 0) return `unsupported document encoding ${bytes[4]}`;
  const length = bytes[5] | (bytes[6] << 8);
  if (length !== bytes.length - 7) {
    return `payload length ${length} does not match ${bytes.length - 7} bytes`;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes.subarray(7)));
  } catch {
    return "payload is not valid JSON";
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return "payload is not a JSON object";
  }
  const { doc, meta } = parsed as { doc?: unknown; meta?: unknown };
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    return "payload has no document object";
  }
  const metaObject =
    meta && typeof meta === "object" && !Array.isArray(meta)
      ? (meta as { created?: string; updated?: string })
      : {};
  return { doc: doc as Record<string, unknown>, meta: metaObject };
}

/** Replace every `did:0:0` placeholder inside string values with the DID. */
function substitutePlaceholder(value: unknown, did: string): unknown {
  if (typeof value === "string") {
    return value.includes(PLACEHOLDER)
      ? value.split(PLACEHOLDER).join(did)
      : value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => substitutePlaceholder(entry, did));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      out[key] = substitutePlaceholder(entry, did);
    }
    return out;
  }
  return value;
}

// ── resolver ────────────────────────────────────────────────────────────────

export function getResolver(options?: IotaResolverOptions): ResolverRegistry {
  const rpcUrls = { ...DEFAULT_RPC_URLS, ...(options?.rpcUrls ?? {}) };
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const iota = async (did: string): Promise<DIDResolutionResult> => {
    try {
      const segments = did.split(":");
      if (
        segments[0] !== "did" ||
        segments[1] !== "iota" ||
        segments.length < 3 ||
        segments.length > 4
      ) {
        return errorResult(
          "invalidDid",
          "expected did:iota:(<network>:)?0x<64-hex-object-id>",
        );
      }
      const tag = segments[segments.length - 1].toLowerCase();
      if (!OBJECT_ID_RE.test(tag)) {
        return errorResult(
          "invalidDid",
          "tag must be a 0x-prefixed 32-byte hex object id",
        );
      }
      // Network segment: a spec alias, or a raw 8-hex chain id (normalized
      // to its alias when the chain id is a well-known network's).
      let network = segments.length === 4 ? segments[2].toLowerCase() : "iota";
      if (CHAIN_ID_RE.test(network)) {
        for (const [alias, chainId] of Object.entries(CHAIN_IDS)) {
          if (chainId === network) network = alias;
        }
      }
      if (!/^[a-z0-9]{1,32}$/.test(network)) {
        return errorResult("invalidDid", "malformed network segment");
      }

      const configured = rpcUrls[network];
      const endpoints = (
        Array.isArray(configured) ? configured : configured ? [configured] : []
      ).map((u) => u.replace(/\/+$/, ""));
      if (!endpoints.length) {
        return errorResult(
          "notConfigured",
          `no IOTA fullnode configured for network \`${network}\``,
        );
      }
      // The chain id the DID's network implies; a custom 8-hex network IS
      // its expected chain id. Custom aliases without a known id skip the
      // assertion (there is nothing sound to compare against).
      const expectedChain =
        CHAIN_IDS[network] ?? (CHAIN_ID_RE.test(network) ? network : null);
      const canonical =
        network === "iota" ? `did:iota:${tag}` : `did:iota:${network}:${tag}`;

      // Transport failures (unreachable, non-2xx, oversized, malformed,
      // RPC-level errors, chain mismatch) fall through to the next endpoint;
      // a consensus answer — including notExists — never does.
      let answer: GetObjectAnswer | null = null;
      let lastTransportError = "no endpoint answered";
      for (const endpoint of endpoints) {
        if (expectedChain) {
          const mismatch = await assertChain(
            endpoint,
            expectedChain,
            timeoutMs,
          );
          if (mismatch) {
            lastTransportError = mismatch;
            continue;
          }
        }
        const call = await rpcCall(
          endpoint,
          "iota_getObject",
          [tag, { showContent: true, showType: true }],
          timeoutMs,
        );
        if (call.error || !call.result || typeof call.result !== "object") {
          lastTransportError = call.error ?? "empty IOTA RPC result";
          continue;
        }
        answer = call.result as GetObjectAnswer;
        break;
      }
      if (answer === null) {
        return errorResult("networkError", lastTransportError);
      }

      if (answer.error) {
        if (answer.error.code === "notExists") {
          return errorResult(
            "notFound",
            "no object with this id on the network",
          );
        }
        if (answer.error.code === "deleted") {
          return errorResult("notFound", "the object has been deleted");
        }
        return errorResult(
          "networkError",
          `IOTA object error ${answer.error.code ?? "unknown"}`,
        );
      }
      const data = answer.data;
      if (!data?.content?.fields) {
        return errorResult(
          "networkError",
          "IOTA RPC answer has no object content",
        );
      }
      const typeMatch = IDENTITY_TYPE_RE.exec(
        data.type ?? data.content.type ?? "",
      );
      if (!typeMatch) {
        return errorResult(
          "invalidDidDocument",
          "object is not an `identity::Identity` Move object",
        );
      }
      const knownPackages = IDENTITY_PACKAGES[network];
      if (knownPackages && !knownPackages.includes(typeMatch[1])) {
        return errorResult(
          "invalidDidDocument",
          "object type is not from the network's published identity package",
        );
      }

      const fields = data.content.fields;
      const created = isoOf(fields.created);
      const updated = isoOf(fields.updated);
      if (fields.deleted_did === true) {
        return {
          didResolutionMetadata: { contentType: "application/did+ld+json" },
          didDocument: null,
          didDocumentMetadata: {
            deactivated: true,
            network,
            ...(created ? { created } : {}),
            ...(updated ? { updated } : {}),
          },
        };
      }

      const didDoc = fields.did_doc as
        { fields?: { controlled_value?: unknown } } | undefined;
      const raw = didDoc?.fields?.controlled_value;
      if (!Array.isArray(raw) || !raw.every((b) => typeof b === "number")) {
        return errorResult(
          "invalidDidDocument",
          "Identity holds no DID document bytes",
        );
      }
      const unpacked = unpackDidDocument(Uint8Array.from(raw));
      if (typeof unpacked === "string") {
        return errorResult("invalidDidDocument", unpacked);
      }

      const substituted = substitutePlaceholder(
        unpacked.doc,
        canonical,
      ) as Record<string, unknown>;
      if (substituted.id !== canonical) {
        return errorResult(
          "invalidDidDocument",
          "stored document id is not the method placeholder",
        );
      }
      const document = {
        "@context": substituted["@context"] ?? DID_CONTEXT,
        ...substituted,
      } as unknown as DIDDocument;

      return {
        didResolutionMetadata: { contentType: "application/did+ld+json" },
        didDocument: document,
        didDocumentMetadata: {
          // Forward the full document-embedded metadata rather than hand-picking
          // created/updated; the resolution-computed fields stay authoritative.
          ...unpacked.meta,
          network,
          deactivated: false,
          ...(canonical !== did ? { canonicalId: canonical } : {}),
        },
      };
    } catch (cause) {
      return errorResult(
        "networkError",
        cause instanceof Error ? cause.message.slice(0, 200) : undefined,
      );
    }
  };

  return { iota } as ResolverRegistry;
}

/** Millisecond-epoch field (number or numeric string) → ISO timestamp. */
function isoOf(value: unknown): string | null {
  const ms =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/.test(value)
        ? Number(value)
        : NaN;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  try {
    return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
  } catch {
    return null;
  }
}
