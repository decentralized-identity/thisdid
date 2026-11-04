/**
 * @thisdid/webvh-did-resolver — DIF `did-resolver` driver for did:webvh.
 *
 * A thin standard wrapper: the method implementation is entirely the
 * DIF-resident [`didwebvh-ts`](https://github.com/decentralized-identity/didwebvh-ts)
 * core; this package only maps its `resolveDID()` API onto the DIF
 * `getResolver()` registry contract and supplies the proof verifier the core
 * requires (its browser build ships no default and otherwise fails every
 * resolution with "Verifier implementation is required"). It also owns the
 * transport policy: every retrieval the core performs goes through a bounded,
 * destination-checked fetch passed in through the core's `fetch` option.
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
import {
  loadNodeGuard,
  settleDestinationGuard,
  type DestinationGuard,
} from "./destination-guard.js";
import {
  boundedFetch,
  type FetchLike,
  type FetchPolicy,
} from "./fetch-policy.js";
import { InvalidOptions, readSelectors } from "./options.js";
import { applyRepresentation } from "./representation.js";

export {
  DestinationGuardError,
  detectRuntime,
  settleDestinationGuard,
  type DestinationGuard,
  type Runtime,
} from "./destination-guard.js";
export {
  InvalidOptions,
  parseUtcDatetime,
  readSelectors,
  type WebvhSelectors,
} from "./options.js";
export {
  applyRepresentation,
  DID_JSON,
  DID_LD_JSON,
} from "./representation.js";

export interface WebvhResolverOptions {
  /** Data-integrity proof verifier. Defaults to WebCrypto Ed25519. */
  verifier?: Verifier;
  /**
   * Fetch boundaries for the DID log and witness file (timeout, byte cap,
   * redirect limit, private-host policy, fetch implementation); every default
   * fails closed. Each resolver builds its own bounded fetch, so resolvers
   * with different boundaries coexist in one process.
   */
  fetchPolicy?: FetchPolicy;
  /**
   * Who checks the addresses a hostname resolves to (the core checks literal
   * names only): "node" binds this package's connect-time guard (default on
   * Node), "platform" trusts a runtime that cannot reach private destinations
   * (default on Cloudflare Workers), "caller" trusts the fetch in use
   * (required with `fetchPolicy.fetch`). Elsewhere it must be declared.
   */
  destinationGuard?: DestinationGuard;
}

export {
  boundedFetch,
  FETCH_POLICY_DEFAULTS,
  FetchPolicyError,
  type FetchLike,
  type FetchPolicy,
} from "./fetch-policy.js";
export {
  isGlobalUnicastAddress,
  isPrivateHost,
  parseIpAddress,
} from "./address-policy.js";

/** Legacy uppercase error codes normalized to their DIF equivalents. */
const ERROR_CODES: Record<string, string> = {
  NOT_FOUND: "notFound",
  INVALID_DID: "invalidDid",
  INVALID_DID_URL: "invalidDidUrl",
  REPRESENTATION_NOT_SUPPORTED: "representationNotSupported",
  METHOD_NOT_SUPPORTED: "methodNotSupported",
};

/**
 * didwebvh-ts reports a missing log as `notFound`, some transport failures as
 * `internalError` and everything else — including our fetch policy's refusals
 * and limits, and unusable log content — as `invalidDid`. That collapses
 * transport failures into the code for genuine syntax/verification failures,
 * which maps to the wrong DIF error (and the wrong HTTP status: 400 instead
 * of failover). The problem-details text is the only differentiator, so
 * `invalidDid` and `internalError` are classified by detail:
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
  const text =
    typeof details?.detail === "string"
      ? details.detail
      : typeof meta.message === "string"
        ? meta.message
        : "";
  const detail = text.slice(0, 200);
  if (normalized !== "invalidDid" && normalized !== "internalError") {
    return { error: normalized, ...(detail ? { message: detail } : {}) };
  }
  if (/^Invalid did:webvh identifier/i.test(detail)) {
    return { error: "invalidDid", message: detail };
  }
  if (/blocked by fetch policy/i.test(detail)) {
    // The identifier points at a destination the policy refuses; definitive.
    return { error: "invalidDid", message: detail };
  }
  if (
    /HTTP error|fetch failed|timed out|exceeds \d+ bytes|ECONN|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|network|abort/i.test(
      detail,
    )
  ) {
    return { error: "networkError", message: detail };
  }
  if (/not valid JSON|Unexpected token|Unexpected end of JSON/i.test(detail)) {
    return { error: "notFound", message: detail };
  }
  return { error: normalized, ...(detail ? { message: detail } : {}) };
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

/**
 * Register did:webvh. Throws `DestinationGuardError` for a configuration that
 * would leave the transport unchecked (see destination-guard.ts).
 */
export function getResolver(options?: WebvhResolverOptions): ResolverRegistry {
  const verifier = options?.verifier ?? webCryptoEd25519Verifier;
  const basePolicy = options?.fetchPolicy;
  const guard = settleDestinationGuard({
    destinationGuard: options?.destinationGuard,
    fetch: basePolicy?.fetch,
    allowPrivateHosts: basePolicy?.allowPrivateHosts,
  });

  // Under "node" the fetch underneath the bounds is the connect-time guard,
  // loaded on first use so the module that imports node:dns and undici never
  // reaches a Worker bundle. The bounded fetch is built once per resolver.
  let settled: Promise<FetchLike> | undefined;
  const transport = (): Promise<FetchLike> =>
    (settled ??= (
      guard === "node"
        ? loadNodeGuard().then((node) =>
            node.guardedFetch({
              allowPrivateHosts: basePolicy?.allowPrivateHosts,
            }),
          )
        : Promise.resolve(basePolicy?.fetch)
    ).then((underlying) =>
      boundedFetch({ ...(basePolicy ?? {}), fetch: underlying }),
    ));

  const webvh = async (
    did: string,
    parsed: { query?: string } | null,
    _resolver: unknown,
    resolutionOptions: Record<string, unknown> = {},
  ): Promise<DIDResolutionResult> => {
    // Selectors from the DID URL query and the options, validated before the
    // core sees them; the method requires the query form to be honoured.
    let selectors;
    try {
      selectors = readSelectors(parsed, resolutionOptions);
    } catch (error) {
      if (error instanceof InvalidOptions) {
        return errorResult({ error: "invalidOptions", message: error.message });
      }
      throw error;
    }
    let fetchFn: FetchLike;
    try {
      fetchFn = await transport();
    } catch (error) {
      return errorResult({
        error: "internalError",
        message: `connect-time destination guard unavailable: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
    let result: Awaited<ReturnType<typeof resolveDID>>;
    try {
      result = await resolveDID(did, {
        verifier,
        fetch: fetchFn,
        ...selectors,
      });
    } catch (error) {
      return errorResult({
        error: "internalError",
        ...(error instanceof Error
          ? { message: error.message.slice(0, 200) }
          : {}),
      });
    }

    // Any error, even one the core returns next to a document, is a failed
    // resolution: the document is not handed out.
    const resolutionMetadata = result.didResolutionMetadata as Record<
      string,
      unknown
    >;
    if (typeof resolutionMetadata.error === "string") {
      return errorResult(classify(resolutionMetadata));
    }
    // Forward the full metadata the didwebvh-ts core produces (versionId,
    // created, updated, deactivated PLUS webvh-native fields: scid, witness,
    // watchers, updateKeys, portable, previousLogEntryHash, latestVersionId,
    // …), matching what every other universal resolver returns for did:webvh
    // (Godiddy and the DIF resolver wrap the same core and emit this verbatim).
    // The core's types come from did-resolver 5, this package's from 4 (see the
    // repository's dual-version note); the metadata is structurally the same.
    const documentMetadata = {
      ...(result.didDocumentMetadata ?? {}),
    } as DIDResolutionResult["didDocumentMetadata"];
    if (!result.didDocument) {
      // DID Resolution: a deactivated DID resolves to no document with
      // `deactivated: true` in the document metadata, and no error.
      if (documentMetadata.deactivated === true) {
        return {
          didResolutionMetadata: {},
          didDocument: null,
          didDocumentMetadata: documentMetadata,
        };
      }
      return errorResult({ error: "notFound" });
    }
    return applyRepresentation(
      {
        didResolutionMetadata: { contentType: "application/did+ld+json" },
        didDocument: result.didDocument as unknown as DIDDocument,
        didDocumentMetadata: documentMetadata,
      },
      resolutionOptions.accept,
    );
  };

  return { webvh } as ResolverRegistry;
}
