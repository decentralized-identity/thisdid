/**
 * did:near resolver for the DIF `did-resolver` interface.
 *
 * A clean-room implementation of the resolution semantics of
 * `@kaytrust/did-near-resolver` 1.4.12 without the `near-api-js` dependency
 * chain (which carries the unpatched elliptic CVE-2025-14505 and a native
 * secp256k1 addon). Resolution needs no cryptography beyond encoding: it is
 * two plain NEAR JSON-RPC queries, performed with global `fetch`, plus
 * @scure/base for byte encoding.
 *
 * Supported identifier forms:
 *  - Named accounts     did:near:alice.near · did:near:testnet:alice.testnet
 *                       → `view_access_key_list`, full-access ed25519 keys.
 *  - Implicit accounts  did:near:<64 lowercase hex chars>
 *                       → deterministic (the identifier IS the ed25519 key);
 *                       resolved offline. (Not supported upstream.)
 *  - Registry entries   did:near:<44–50 base58 chars>
 *                       → `identity_owner` view call on the configured DID
 *                       registry contract.
 *
 * Deliberate deviations from upstream, documented in the README:
 *  - Returns DIF error results instead of throwing.
 *  - Verification method ids are unique per key (upstream repeats `#owner`,
 *    which violates DID Core when an account has several full-access keys).
 *  - Only `ed25519:` access keys become Ed25519VerificationKey2018 entries
 *    (upstream also emits secp256k1 keys under the ed25519 type).
 */
import { base58, base64, hex } from "@scure/base";
import type {
  DIDDocument,
  DIDResolutionResult,
  ResolverRegistry,
} from "did-resolver";

export interface NearNetworkConfig {
  /** Network name — `mainnet` / `testnet` (`near` is accepted as an alias of `mainnet`). */
  networkId: string;
  /** NEAR JSON-RPC endpoint for the network. */
  rpcUrl: string;
  /** DID registry contract account for base58 identifiers (optional). */
  contractId?: string;
}

export interface NearResolverOptions {
  /** Configured networks; the first entry is the default when a DID names none. */
  networks: NearNetworkConfig[];
  /** Per-request wall-clock bound for RPC calls. Default 6000 ms. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 6000;
const MAX_RESPONSE_BYTES = 1024 * 1024;

/**
 * Read at most MAX_RESPONSE_BYTES of a response body, cancelling the stream
 * the moment it exceeds the bound — the guard runs before any buffering or
 * parsing, so an oversized RPC endpoint cannot make this worker hold it in
 * memory.
 */
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

const IMPLICIT_RE = /^[0-9a-f]{64}$/;
const BASE58_ID_RE = /^[1-9A-HJ-NP-Za-km-z]{44,50}$/;
/** NEAR account grammar (2–64 chars of dot-separated lowercase segments). */
const ACCOUNT_RE = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;

function normalizeNetworkId(networkId: string): string {
  return networkId.trim() === "near" ? "mainnet" : networkId.trim();
}

function errorResult(error: string, message?: string): DIDResolutionResult {
  return {
    didResolutionMetadata: { error, ...(message ? { message } : {}) },
    didDocument: null,
    didDocumentMetadata: {},
  };
}

interface AccessKeyEntry {
  public_key?: string;
  access_key?: { permission?: unknown };
}

interface RpcEnvelope {
  result?: unknown;
  error?: {
    message?: string;
    data?: unknown;
    cause?: { name?: string };
  };
}

/** Raised for RPC outcomes that positively mean "this DID does not exist". */
class NotFoundError extends Error {}

async function rpcQuery(
  rpcUrl: string,
  params: Record<string, unknown>,
  timeoutMs: number,
): Promise<unknown> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "near-did-resolver",
      method: "query",
      params,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`NEAR RPC responded with HTTP ${response.status}`);
  }
  const text = await readBounded(response);
  if (text === null) {
    throw new Error("NEAR RPC response exceeds the size bound");
  }
  const envelope = JSON.parse(text) as RpcEnvelope;
  if (envelope.error) {
    const name = envelope.error.cause?.name ?? "";
    const detail =
      typeof envelope.error.data === "string"
        ? envelope.error.data
        : (envelope.error.message ?? "");
    if (
      name === "UNKNOWN_ACCOUNT" ||
      name === "NO_CONTRACT_CODE" ||
      /does not exist/i.test(detail)
    ) {
      throw new NotFoundError(detail || name);
    }
    throw new Error(detail || name || "NEAR RPC error");
  }
  return envelope.result;
}

/** Full-access ed25519 keys of a named account, base58-encoded (no prefix). */
async function accountKeys(
  accountId: string,
  network: NearNetworkConfig,
  timeoutMs: number,
): Promise<string[]> {
  const result = (await rpcQuery(
    network.rpcUrl,
    {
      request_type: "view_access_key_list",
      finality: "final",
      account_id: accountId,
    },
    timeoutMs,
  )) as { keys?: AccessKeyEntry[] };
  const keys = (result?.keys ?? [])
    .filter((entry) => entry.access_key?.permission === "FullAccess")
    .map((entry) => entry.public_key ?? "")
    .filter((key) => key.startsWith("ed25519:"))
    .map((key) => key.slice("ed25519:".length));
  if (keys.length === 0) throw new NotFoundError("no full-access ed25519 keys");
  return keys;
}

/** `identity_owner` of a registry DID, as the owner's base58 key. */
async function registryOwner(
  did: string,
  network: NearNetworkConfig,
  timeoutMs: number,
): Promise<string> {
  const args = base64.encode(
    new TextEncoder().encode(JSON.stringify({ identity: did })),
  );
  const result = (await rpcQuery(
    network.rpcUrl,
    {
      request_type: "call_function",
      finality: "final",
      account_id: network.contractId,
      method_name: "identity_owner",
      args_base64: args,
    },
    timeoutMs,
  )) as { result?: number[] };
  const bytes = Uint8Array.from(result?.result ?? []);
  let owner: unknown;
  try {
    owner = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error("registry contract returned a non-JSON value");
  }
  if (typeof owner !== "string" || owner === "" || owner === "null") {
    throw new NotFoundError("DID is not registered in the registry contract");
  }
  return owner.startsWith("did:near:")
    ? (owner.split(":").pop() as string)
    : owner;
}

function buildDocument(did: string, publicKeysBase58: string[]): DIDDocument {
  const ids = publicKeysBase58.map((_, index) =>
    index === 0 ? `${did}#owner` : `${did}#owner-${index + 1}`,
  );
  return {
    "@context": [
      "https://www.w3.org/ns/did/v1",
      "https://w3id.org/security/suites/ed25519-2018/v1",
    ],
    id: did,
    verificationMethod: publicKeysBase58.map((publicKeyBase58, index) => ({
      id: ids[index],
      type: "Ed25519VerificationKey2018",
      controller: did,
      publicKeyBase58,
    })),
    authentication: ids,
    assertionMethod: ids,
  };
}

function success(did: string, keys: string[]): DIDResolutionResult {
  return {
    didResolutionMetadata: { contentType: "application/did+ld+json" },
    didDocument: buildDocument(did, keys),
    didDocumentMetadata: {},
  };
}

export function getResolver(options: NearResolverOptions): ResolverRegistry {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const networks = new Map<string, NearNetworkConfig>();
  for (const network of options?.networks ?? []) {
    const networkId = normalizeNetworkId(network.networkId);
    networks.set(networkId, { ...network, networkId });
  }
  const defaultNetwork = options?.networks?.length
    ? normalizeNetworkId(options.networks[0].networkId)
    : undefined;

  /** Network implied by the DID: explicit segment, suffix heuristic, or the default. */
  function networkFor(explicit: string | undefined, id: string): string {
    if (explicit) return normalizeNetworkId(explicit);
    if (id.endsWith(".near")) return "mainnet";
    if (id.endsWith(".testnet")) return "testnet";
    return defaultNetwork ?? "mainnet";
  }

  const near = async (did: string): Promise<DIDResolutionResult> => {
    try {
      if (!networks.size) return errorResult("notConfigured");

      // did:near:<id> or did:near:<network>:<id>
      const segments = did.split(":");
      if (segments.length !== 3 && segments.length !== 4) {
        return errorResult("invalidDid");
      }
      const id = segments[segments.length - 1];
      const explicit = segments.length === 4 ? segments[2] : undefined;

      // Implicit accounts are the ed25519 key itself — no network access needed.
      if (IMPLICIT_RE.test(id)) {
        return success(did, [base58.encode(hex.decode(id))]);
      }

      const network = networks.get(networkFor(explicit, id));
      if (!network) return errorResult("notConfigured");

      if (BASE58_ID_RE.test(id)) {
        if (!network.contractId) {
          return errorResult(
            "notConfigured",
            "a registry contract is required for base58 identifiers",
          );
        }
        return success(did, [await registryOwner(did, network, timeoutMs)]);
      }

      if (ACCOUNT_RE.test(id) && id.length >= 2 && id.length <= 64) {
        return success(did, await accountKeys(id, network, timeoutMs));
      }

      return errorResult("invalidDid");
    } catch (error) {
      if (error instanceof NotFoundError) return errorResult("notFound");
      return errorResult(
        "internalError",
        error instanceof Error ? error.message : String(error),
      );
    }
  };

  return { near };
}
