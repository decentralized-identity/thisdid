/**
 * did:iden3 / did:polygonid resolver for the DIF `did-resolver` interface.
 *
 * A clean-room driver that resolves iden3-protocol DIDs with nothing but
 * plain EVM JSON-RPC `eth_call`s against the iden3 State contract — no SDK.
 * The read path and every encoding rule were validated live against the
 * Polygon Amoy State contract and Archon's reference driver output:
 *
 *  - the identifier is a base58 31-byte iden3 ID (2-byte type, 27-byte
 *    genesis fragment, 2-byte little-endian checksum = uint16 sum of the
 *    first 29 bytes); its uint256 form is the LITTLE-ENDIAN interpretation
 *    of the 31 bytes;
 *  - `getStateInfoById(uint256)` yields the identity's latest state record
 *    (7 static words); a revert containing "does not exist" means the
 *    identity is unpublished (`published: false`), not an error;
 *  - `getGISTProof(uint256)` (71 static words) and
 *    `getGISTRootInfo(uint256)` (6 words) yield the global identity state
 *    tree root, its lifecycle, and the identity's inclusion proof;
 *  - state and root values render as LITTLE-ENDIAN hex (iden3 field-element
 *    serialization); timestamps and block numbers render as decimal
 *    strings; proof siblings render as decimal strings with trailing
 *    zeros trimmed (go-merkletree JSON semantics).
 *
 * The document carries a single `Iden3StateInfo2023` verification method —
 * no key material and no verification relationships, exactly like the
 * reference driver. Per-network RPC endpoints (e.g. Alchemy) are injected;
 * unconfigured networks fail closed.
 */
import type {
  DIDDocument,
  DIDResolutionResult,
  ResolverRegistry,
} from "did-resolver";
import { keccak_256 } from "@noble/hashes/sha3";

export interface Iden3Network {
  /** EVM JSON-RPC endpoint (e.g. an Alchemy URL). */
  rpcUrl: string;
  /** iden3 State contract address on that chain. */
  stateContract?: string;
  /** Numeric chain id (used in the `stateContractAddress` rendering). */
  chainId?: number;
}

export interface Iden3ResolverOptions {
  /** Keyed `blockchain:network`, e.g. `"polygon:amoy"`. */
  networks?: Record<string, Iden3Network>;
  /** Per-request wall-clock bound. Default 6000 ms. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 6000;
const MAX_RESPONSE_BYTES = 1024 * 1024;

/** Known State contract deployments (rpcUrl still must be injected). */
const KNOWN_NETWORKS: Record<
  string,
  { stateContract: string; chainId: number }
> = {
  "polygon:main": {
    stateContract: "0x624ce98D2d27b20b8f8d521723Df8fC4db71D79D",
    chainId: 137,
  },
  "polygon:amoy": {
    stateContract: "0x1a4cC30f2aA0377b0c3bc9848766D90cb4404124",
    chainId: 80002,
  },
};

const CONTEXTS = [
  "https://www.w3.org/ns/did/v1",
  "https://schema.iden3.io/core/jsonld/auth.jsonld",
  "https://schema.iden3.io/core/jsonld/iden3proofs.jsonld",
];

class ResolutionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function errorResult(error: string, message?: string): DIDResolutionResult {
  return {
    didResolutionMetadata: { error, ...(message ? { message } : {}) },
    didDocument: null,
    didDocumentMetadata: {},
  };
}

// ── identifier handling ─────────────────────────────────────────────────────

const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Decode(encoded: string): Uint8Array | undefined {
  let value = 0n;
  for (const char of encoded) {
    const index = BASE58_ALPHABET.indexOf(char);
    if (index < 0) return undefined;
    value = value * 58n + BigInt(index);
  }
  let hex = value.toString(16);
  if (hex.length % 2) hex = "0" + hex;
  const bytes =
    hex === "0" ? [] : (hex.match(/.{2}/g) ?? []).map((b) => parseInt(b, 16));
  let leading = 0;
  for (const char of encoded) {
    if (char === "1") leading++;
    else break;
  }
  return new Uint8Array([...new Array<number>(leading).fill(0), ...bytes]);
}

/** iden3 ID → uint256: 31 bytes interpreted little-endian, checksum-checked.
 * Also surfaces the 2-byte ID type so callers can enforce that the DID's
 * method and network match what the identifier itself declares. */
function decodeId(
  encoded: string,
): { value: bigint; methodByte: number; networkByte: number } | undefined {
  if (encoded.length > 64) return undefined;
  const bytes = base58Decode(encoded);
  if (!bytes || bytes.length !== 31) return undefined;
  const sum = bytes.subarray(0, 29).reduce((a, b) => a + b, 0) & 0xffff;
  if (bytes[29] !== (sum & 0xff) || bytes[30] !== sum >> 8) return undefined;
  let value = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) {
    value = (value << 8n) + BigInt(bytes[i]);
  }
  return { value, methodByte: bytes[0], networkByte: bytes[1] };
}

/** go-iden3-core DIDMethodByte. */
const METHOD_BYTES: Record<string, number> = { iden3: 0x01, polygonid: 0x02 };

/** go-iden3-core blockchain|network flag bytes for known pairs. */
const NETWORK_BYTES: Record<string, number> = {
  "readonly:none": 0x00,
  "polygon:main": 0x11,
  "polygon:mumbai": 0x12,
  "polygon:amoy": 0x13,
  "polygon:zkevm": 0x14,
  "polygon:cardona": 0x15,
  "eth:main": 0x21,
  "eth:goerli": 0x22,
  "eth:sepolia": 0x23,
  "linea:sepolia": 0x48,
  "linea:main": 0x49,
  "base:main": 0x51,
  "base:sepolia": 0x52,
  "bnb:main": 0x61,
  "bnb:test": 0x62,
  "privado:main": 0xa1,
  "privado:test": 0xa2,
  "billions:main": 0xb1,
  "billions:test": 0xb2,
};

// ── ABI helpers ─────────────────────────────────────────────────────────────

const selector = (signature: string): string =>
  [...keccak_256(new TextEncoder().encode(signature))]
    .slice(0, 4)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

const SEL_STATE_INFO_BY_ID = selector("getStateInfoById(uint256)");
const SEL_GIST_PROOF = selector("getGISTProof(uint256)");
const SEL_GIST_ROOT_INFO = selector("getGISTRootInfo(uint256)");

const uint256Word = (value: bigint): string =>
  value.toString(16).padStart(64, "0");

function words(returnData: string): bigint[] {
  const hex = returnData.startsWith("0x") ? returnData.slice(2) : returnData;
  if (hex.length % 64 !== 0) {
    throw new ResolutionError("invalidResponse", "malformed eth_call return");
  }
  return (hex.match(/.{64}/g) ?? []).map((w) => BigInt("0x" + w));
}

/** iden3 field elements serialize as little-endian hex (64 chars). */
function leHex(value: bigint): string {
  const be = value.toString(16).padStart(64, "0");
  return (be.match(/.{2}/g) ?? []).reverse().join("");
}

// ── document composition ────────────────────────────────────────────────────

interface StateInfo {
  state: bigint;
  replacedByState: bigint;
  createdAtTimestamp: bigint;
  replacedAtTimestamp: bigint;
  createdAtBlock: bigint;
  replacedAtBlock: bigint;
}

function stateInfoJson(did: string, info: StateInfo): Record<string, string> {
  return {
    id: did,
    state: leHex(info.state),
    replacedByState: leHex(info.replacedByState),
    createdAtTimestamp: info.createdAtTimestamp.toString(),
    replacedAtTimestamp: info.replacedAtTimestamp.toString(),
    createdAtBlock: info.createdAtBlock.toString(),
    replacedAtBlock: info.replacedAtBlock.toString(),
  };
}

export function getResolver(options?: Iden3ResolverOptions): ResolverRegistry {
  const networks = options?.networks ?? {};
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

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

  interface CallOutcome {
    result?: string;
    revertMessage?: string;
  }

  /** Batched eth_calls; reverts surface per-call, transport errors throw. */
  async function ethCalls(
    rpcUrl: string,
    contract: string,
    payloads: string[],
  ): Promise<CallOutcome[]> {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        payloads.map((data, index) => ({
          jsonrpc: "2.0",
          id: index,
          method: "eth_call",
          params: [{ to: contract, data }, "latest"],
        })),
      ),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      throw new ResolutionError("networkError", `RPC HTTP ${response.status}`);
    }
    const text = await readBounded(response);
    if (text === null) {
      throw new ResolutionError("networkError", "response exceeds size bound");
    }
    const body = JSON.parse(text) as
      | { id?: number; result?: string; error?: { message?: string } }[]
      | { error?: { message?: string } };
    if (!Array.isArray(body)) {
      throw new ResolutionError(
        "networkError",
        String(body.error?.message ?? "RPC error").slice(0, 160),
      );
    }
    const outcomes: CallOutcome[] = payloads.map(() => ({}));
    for (const entry of body) {
      const index = Number(entry.id);
      if (!(index >= 0 && index < outcomes.length)) continue;
      if (typeof entry.result === "string") {
        outcomes[index] = { result: entry.result };
      } else {
        outcomes[index] = {
          revertMessage: String(entry.error?.message ?? "eth_call failed"),
        };
      }
    }
    return outcomes;
  }

  const resolveMethod =
    (method: "iden3" | "polygonid") =>
    async (did: string): Promise<DIDResolutionResult> => {
      try {
        const segments = did.split(":");
        if (
          segments.length !== 5 ||
          segments[0] !== "did" ||
          segments[1] !== method
        ) {
          return errorResult("invalidDid");
        }
        const [, , blockchain, network, encodedId] = segments;
        const decoded = decodeId(encodedId);
        if (decoded === undefined) {
          return errorResult(
            "invalidDid",
            "identifier is not a checksummed 31-byte iden3 ID",
          );
        }
        const id = decoded.value;

        // The identifier's own type bytes must agree with the DID string —
        // an iden3-typed ID presented as did:polygonid (or vice versa, or on
        // the wrong network) is not a different DID, it is an invalid one.
        if (decoded.methodByte !== METHOD_BYTES[method]) {
          return errorResult(
            "invalidDid",
            `identifier type byte does not declare did:${method}`,
          );
        }
        const networkKey = `${blockchain}:${network}`;
        const expectedNetworkByte = NETWORK_BYTES[networkKey];
        if (
          expectedNetworkByte !== undefined &&
          decoded.networkByte !== expectedNetworkByte
        ) {
          return errorResult(
            "invalidDid",
            `identifier network byte does not declare ${networkKey}`,
          );
        }
        const known = KNOWN_NETWORKS[networkKey];
        const configured = networks[networkKey];
        const stateContract = configured?.stateContract ?? known?.stateContract;
        const chainId = configured?.chainId ?? known?.chainId;
        if (!configured?.rpcUrl || !stateContract || chainId === undefined) {
          // Fail closed: resolving without chain access could misreport
          // rotated or revoked identity state.
          return errorResult(
            "notConfigured",
            `network \`${networkKey}\` is not configured`,
          );
        }

        const [stateOutcome, proofOutcome] = await ethCalls(
          configured.rpcUrl,
          stateContract,
          [
            "0x" + SEL_STATE_INFO_BY_ID + uint256Word(id),
            "0x" + SEL_GIST_PROOF + uint256Word(id),
          ],
        );

        let published = false;
        let info: Record<string, string> | undefined;
        if (stateOutcome.result) {
          const w = words(stateOutcome.result);
          if (w.length < 7) {
            throw new ResolutionError(
              "invalidResponse",
              "malformed StateInfo return",
            );
          }
          published = true;
          info = stateInfoJson(did, {
            state: w[1],
            replacedByState: w[2],
            createdAtTimestamp: w[3],
            replacedAtTimestamp: w[4],
            createdAtBlock: w[5],
            replacedAtBlock: w[6],
          });
        } else if (!/does not exist/i.test(stateOutcome.revertMessage ?? "")) {
          throw new ResolutionError(
            "networkError",
            String(stateOutcome.revertMessage).slice(0, 160),
          );
        }

        if (!proofOutcome.result) {
          throw new ResolutionError(
            "networkError",
            String(
              proofOutcome.revertMessage ?? "GIST proof unavailable",
            ).slice(0, 160),
          );
        }
        const proofWords = words(proofOutcome.result);
        if (proofWords.length < 71) {
          throw new ResolutionError(
            "invalidResponse",
            "malformed GistProof return",
          );
        }
        const gistRoot = proofWords[0];
        const existence = proofWords[1] !== 0n;
        const siblings = proofWords.slice(2, 66);
        while (siblings.length > 0 && siblings[siblings.length - 1] === 0n) {
          siblings.pop();
        }

        const [rootInfoOutcome] = await ethCalls(
          configured.rpcUrl,
          stateContract,
          ["0x" + SEL_GIST_ROOT_INFO + uint256Word(gistRoot)],
        );
        if (!rootInfoOutcome.result) {
          throw new ResolutionError(
            "networkError",
            String(
              rootInfoOutcome.revertMessage ?? "GIST root unavailable",
            ).slice(0, 160),
          );
        }
        const rootWords = words(rootInfoOutcome.result);
        if (rootWords.length < 6) {
          throw new ResolutionError(
            "invalidResponse",
            "malformed RootInfo return",
          );
        }

        const didDocument: DIDDocument = {
          "@context": [...CONTEXTS] as never,
          id: did,
          verificationMethod: [
            {
              id: `${did}#state-info`,
              type: "Iden3StateInfo2023",
              controller: did,
              stateContractAddress: `${chainId}:${stateContract}`,
              published,
              ...(info ? { info } : {}),
              global: {
                root: leHex(rootWords[0]),
                replacedByRoot: leHex(rootWords[1]),
                createdAtTimestamp: rootWords[2].toString(),
                replacedAtTimestamp: rootWords[3].toString(),
                createdAtBlock: rootWords[4].toString(),
                replacedAtBlock: rootWords[5].toString(),
                proof: {
                  type: "Iden3SparseMerkleTreeProof",
                  existence,
                  siblings: siblings.map((s) => s.toString()),
                },
              },
            } as never,
          ],
        };

        return {
          didResolutionMetadata: { contentType: "application/did+ld+json" },
          didDocument,
          didDocumentMetadata: {},
        };
      } catch (cause) {
        if (cause instanceof ResolutionError) {
          return errorResult(cause.code, cause.message);
        }
        return errorResult(
          "networkError",
          cause instanceof Error ? cause.message.slice(0, 200) : undefined,
        );
      }
    };

  return {
    iden3: resolveMethod("iden3"),
    polygonid: resolveMethod("polygonid"),
  } as ResolverRegistry;
}
