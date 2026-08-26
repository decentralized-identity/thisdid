/**
 * @thisdid/webvh-did-resolver — DIF `did-resolver` driver for did:webvh.
 *
 * A thin standard wrapper: the method implementation is entirely the
 * DIF-resident [`didwebvh-ts`](https://github.com/decentralized-identity/didwebvh-ts)
 * core; this package only maps its `resolveDID()` API onto the DIF
 * `getResolver()` registry contract and supplies the proof verifier the core
 * requires (its browser build ships no default and otherwise fails every
 * resolution with "Verifier implementation is required").
 *
 * Retired in favor of the upstream package if didwebvh-ts ever exports a DIF
 * registry itself.
 */
import { resolveDID } from "didwebvh-ts";
import type { Verifier } from "didwebvh-ts";
import type {
  DIDDocument,
  DIDResolutionResult,
  ResolverRegistry,
} from "did-resolver";

export interface WebvhResolverOptions {
  /** Data-integrity proof verifier. Defaults to WebCrypto Ed25519. */
  verifier?: Verifier;
}

/** Legacy uppercase error codes normalized to their DIF equivalents. */
const ERROR_CODES: Record<string, string> = {
  NOT_FOUND: "notFound",
  INVALID_DID: "invalidDid",
  INVALID_DID_URL: "invalidDidUrl",
  REPRESENTATION_NOT_SUPPORTED: "representationNotSupported",
  METHOD_NOT_SUPPORTED: "methodNotSupported",
};

/**
 * didwebvh-ts reports every non-404 failure as `invalidDid`, collapsing
 * transport failures and unusable log content into the same code as genuine
 * syntax/verification failures — which maps to the wrong DIF error (and the
 * wrong HTTP status: 400 instead of 404/failover). The problem-details text is
 * the only differentiator, so classification is by detail:
 *
 *   - unreachable log (connection refused, non-404 HTTP error, timeout)
 *       → `networkError` (transport: resolvers should fail over, not 400)
 *   - log fetched but not parseable as a DID log → `notFound`
 *   - malformed did:webvh identifier            → `invalidDid`
 *   - proof / history verification failures     → `invalidDid`
 */
function classify(meta: Record<string, unknown>): {
  error: string;
  message?: string;
} {
  const raw = typeof meta.error === "string" ? meta.error : "notFound";
  const normalized = ERROR_CODES[raw] ?? raw;
  const details = meta.problemDetails as { detail?: unknown } | undefined;
  const detail =
    typeof details?.detail === "string" ? details.detail.slice(0, 200) : "";
  if (normalized !== "invalidDid") {
    return { error: normalized, ...(detail ? { message: detail } : {}) };
  }
  if (/^Invalid did:webvh identifier/i.test(detail)) {
    return { error: "invalidDid", message: detail };
  }
  if (
    /HTTP error|fetch failed|ECONN|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|network|abort/i.test(
      detail,
    )
  ) {
    return { error: "networkError", message: detail };
  }
  if (/not valid JSON|Unexpected token|Unexpected end of JSON/i.test(detail)) {
    return { error: "notFound", message: detail };
  }
  return { error: "invalidDid", ...(detail ? { message: detail } : {}) };
}

/**
 * Ed25519 verifier over WebCrypto — native in Cloudflare workerd, Node ≥ 20,
 * and modern browsers. didwebvh-ts passes the raw 32-byte public key with the
 * multicodec prefix already stripped.
 */
export const webCryptoEd25519Verifier: Verifier = {
  async verify(
    signature: Uint8Array,
    message: Uint8Array,
    publicKey: Uint8Array,
  ): Promise<boolean> {
    try {
      const key = await crypto.subtle.importKey(
        "raw",
        publicKey as BufferSource,
        { name: "Ed25519" },
        false,
        ["verify"],
      );
      return await crypto.subtle.verify(
        { name: "Ed25519" },
        key,
        signature as BufferSource,
        message as BufferSource,
      );
    } catch {
      return false;
    }
  },
};

function errorResult(classified: {
  error: string;
  message?: string;
}): DIDResolutionResult {
  return {
    didResolutionMetadata: { ...classified },
    didDocument: null,
    didDocumentMetadata: {},
  };
}

export function getResolver(options?: WebvhResolverOptions): ResolverRegistry {
  const verifier = options?.verifier ?? webCryptoEd25519Verifier;

  const webvh = async (
    did: string,
    _parsed: unknown,
    _resolver: unknown,
    resolutionOptions: { versionId?: unknown; versionTime?: unknown } = {},
  ): Promise<DIDResolutionResult> => {
    let result: Awaited<ReturnType<typeof resolveDID>>;
    try {
      result = await resolveDID(did, {
        verifier,
        ...(typeof resolutionOptions.versionId === "string"
          ? { versionId: resolutionOptions.versionId }
          : {}),
        ...(typeof resolutionOptions.versionTime === "string"
          ? { versionTime: new Date(resolutionOptions.versionTime) }
          : {}),
      });
    } catch (error) {
      return errorResult({
        error: "internalError",
        ...(error instanceof Error
          ? { message: error.message.slice(0, 200) }
          : {}),
      });
    }

    const meta = result.meta as Record<string, unknown>;
    if (typeof meta.error === "string") return errorResult(classify(meta));
    if (!result.doc) return errorResult({ error: "notFound" });

    // Forward the full metadata the didwebvh-ts core produces (versionId,
    // created, updated, deactivated PLUS webvh-native fields: scid, witness,
    // watchers, updateKeys, portable, previousLogEntryHash, latestVersionId,
    // …), matching what every other universal resolver returns for did:webvh
    // (Godiddy and the DIF resolver wrap the same core and emit this verbatim).
    // On this success path meta carries no `error`/`problemDetails`.
    return {
      didResolutionMetadata: { contentType: "application/did+ld+json" },
      didDocument: result.doc as unknown as DIDDocument,
      didDocumentMetadata: { ...meta },
    };
  };

  return { webvh } as ResolverRegistry;
}
