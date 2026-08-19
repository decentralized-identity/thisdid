/**
 * did:cheqd resolver for the DIF `did-resolver` interface.
 *
 * An HTTP driver against cheqd's official DID Resolver (the Go implementation
 * the cheqd network itself operates at `resolver.cheqd.net`) — the
 * authoritative source for did:cheqd, queried directly instead of through
 * intermediary Universal Resolvers. Zero runtime dependencies.
 */
import type {
  DIDDocument,
  DIDResolutionResult,
  ResolverRegistry,
} from "did-resolver";

export interface CheqdResolverOptions {
  /** cheqd DID Resolver base (DID appended). Defaults to the official deployment. */
  resolverUrl?: string;
  /** Per-request wall-clock bound. Default 6000 ms. */
  timeoutMs?: number;
}

const DEFAULT_RESOLVER_URL = "https://resolver.cheqd.net/1.0/identifiers";
const DEFAULT_TIMEOUT_MS = 6000;
const MAX_RESPONSE_BYTES = 1024 * 1024;

/** Known error spellings folded to the published DIF camelCase codes. */
const CANONICAL_CODES: Record<string, string> = {
  notfound: "notFound",
  invaliddid: "invalidDid",
  invaliddidurl: "invalidDidUrl",
  methodnotsupported: "methodNotSupported",
  representationnotsupported: "representationNotSupported",
  internalerror: "internalError",
};

function canonicalCode(code: string): string {
  const fragment = code.includes("#")
    ? code.slice(code.lastIndexOf("#") + 1)
    : code;
  return (
    CANONICAL_CODES[fragment.replace(/[_\s-]/g, "").toLowerCase()] ?? fragment
  );
}

function errorResult(error: string, message?: string): DIDResolutionResult {
  return {
    didResolutionMetadata: { error, ...(message ? { message } : {}) },
    didDocument: null,
    didDocumentMetadata: {},
  };
}

/**
 * Read at most MAX_RESPONSE_BYTES of a response body, cancelling the stream
 * the moment it exceeds the bound — the guard runs before any buffering or
 * parsing, so an oversized upstream cannot make this worker hold it in memory.
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

export function getResolver(options?: CheqdResolverOptions): ResolverRegistry {
  const base = (options?.resolverUrl ?? DEFAULT_RESOLVER_URL).replace(
    /\/+$/,
    "",
  );
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const cheqd = async (did: string): Promise<DIDResolutionResult> => {
    try {
      const response = await fetch(`${base}/${encodeURIComponent(did)}`, {
        headers: {
          accept:
            'application/ld+json;profile="https://w3id.org/did-resolution"',
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
      const text = await readBounded(response);
      if (text === null) {
        return errorResult("invalidResponse", "response exceeds size bound");
      }
      let body: Partial<DIDResolutionResult>;
      try {
        body = JSON.parse(text) as Partial<DIDResolutionResult>;
      } catch {
        return response.ok
          ? errorResult("invalidResponse")
          : errorResult("upstreamError", `HTTP ${response.status}`);
      }

      const rawError = body.didResolutionMetadata?.error;
      const error =
        typeof rawError === "string"
          ? canonicalCode(rawError)
          : rawError && typeof rawError === "object"
            ? canonicalCode(
                String(
                  (rawError as Record<string, unknown>).type ?? "upstreamError",
                ),
              )
            : undefined;
      const didDocument = (body.didDocument as DIDDocument | null) ?? null;

      if (error || !didDocument) {
        return errorResult(
          error ?? (response.status === 404 ? "notFound" : "upstreamError"),
        );
      }
      if (didDocument.id !== did) {
        return errorResult(
          "invalidDidDocument",
          "resolver returned a document for a different DID",
        );
      }
      return {
        didResolutionMetadata: { contentType: "application/did+ld+json" },
        didDocument,
        didDocumentMetadata: body.didDocumentMetadata ?? {},
      };
    } catch (cause) {
      return errorResult(
        "networkError",
        cause instanceof Error ? cause.message.slice(0, 200) : undefined,
      );
    }
  };

  return { cheqd } as ResolverRegistry;
}
