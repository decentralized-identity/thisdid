/**
 * Upstream routing — resolve a DID against a named Universal Resolver deployment
 * (godiddy / archon). Returns a resolution result on success, or null when the
 * upstream errored, was unreachable, or found nothing — so the caller can fall
 * through to the next step in the routing chain.
 */
import { parse, type DIDResolutionResult } from "did-resolver";

export interface UpstreamFailure {
  error: string;
  status?: number;
  metadata?: DIDResolutionResult["didResolutionMetadata"];
  documentMetadata?: DIDResolutionResult["didDocumentMetadata"];
}

export type UpstreamResult =
  | { ok: true; result: DIDResolutionResult }
  | { ok: false; failure: UpstreamFailure };

const MAX_RESPONSE_BYTES = 1024 * 1024;

/**
 * Canonical DIF camelCase error codes, keyed by their case/underscore-folded
 * form. Upstreams following the newer W3C problem-details draft emit uppercase
 * types (`METHOD_NOT_SUPPORTED`, sometimes as `https://w3id.org/security#…`
 * URLs); ThisDID's public API speaks the published DID Resolution spec's
 * camelCase, so known codes are folded here and unknown codes pass through
 * verbatim (minus any URL prefix) to preserve diagnostics.
 */
const CANONICAL_CODES: Record<string, string> = {
  notfound: "notFound",
  invaliddid: "invalidDid",
  invaliddidurl: "invalidDidUrl",
  invaliddiddocument: "invalidDidDocument",
  methodnotsupported: "methodNotSupported",
  unsupporteddidmethod: "unsupportedDidMethod",
  representationnotsupported: "representationNotSupported",
  internalerror: "internalError",
  invalidoptions: "invalidOptions",
  invalidpublickey: "invalidPublicKey",
  deactivated: "deactivated",
};

function canonicalCode(code: string): string {
  const fragment = code.includes("#")
    ? code.slice(code.lastIndexOf("#") + 1)
    : code;
  return (
    CANONICAL_CODES[fragment.replace(/[_\s-]/g, "").toLowerCase()] ?? fragment
  );
}

/** Coerce non-conformant upstream error objects into DIF string error codes. */
function normalizeUpstreamError(value: unknown): string | undefined {
  if (typeof value === "string" && value) return canonicalCode(value);
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const candidate = record.error ?? record.code ?? record.type;
  if (typeof candidate !== "string" || !candidate) return "upstreamError";
  return canonicalCode(candidate);
}

/** Read at most the configured response limit, cancelling the stream when it exceeds it. */
async function readBoundedBody(res: Response): Promise<Uint8Array | null> {
  if (!res.body) return new Uint8Array();
  const reader = res.body.getReader();
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
  return bytes;
}

export async function fetchUpstream(
  did: string,
  base: string,
  token?: string,
  signal?: AbortSignal,
): Promise<UpstreamResult> {
  if (!base) return { ok: false, failure: { error: "notConfigured" } };
  const url = `${base.replace(/\/+$/, "")}/${encodeURIComponent(did)}`;
  const headers: Record<string, string> = {
    accept: 'application/ld+json;profile="https://w3id.org/did-resolution"',
  };
  if (token) headers.authorization = `Bearer ${token}`;
  try {
    const res = await fetch(url, { headers, signal });
    if (res.status === 429) {
      // Public-tier upstreams (Godiddy in particular) throttle by quota; a
      // 429 means "alive but rate-limited" — never an outage, and never an
      // opinion about the DID. Surfaced as its own code so the orchestrator
      // falls through to the next provider and labels the attempt honestly.
      try {
        await res.body?.cancel();
      } catch {
        // best-effort stream cleanup only
      }
      return { ok: false, failure: { error: "rateLimited", status: 429 } };
    }
    const declaredLength = Number(res.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_RESPONSE_BYTES) {
      return {
        ok: false,
        failure: { error: "invalidResponse", status: res.status },
      };
    }
    let body: Partial<DIDResolutionResult> & Record<string, unknown>;
    try {
      const bytes = await readBoundedBody(res);
      if (!bytes) {
        return {
          ok: false,
          failure: { error: "invalidResponse", status: res.status },
        };
      }
      const decoded: unknown = JSON.parse(new TextDecoder().decode(bytes));
      if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
        return {
          ok: false,
          failure: { error: "invalidResponse", status: res.status },
        };
      }
      body = decoded as Partial<DIDResolutionResult> & Record<string, unknown>;
    } catch {
      return {
        ok: false,
        failure: {
          error: res.ok ? "invalidResponse" : "upstreamError",
          status: res.status,
        },
      };
    }

    // Accept either a full DID Resolution Result or a bare DID document.
    // Some upstreams (Archon's cid Gatekeeper) report misses as
    // `didDocument: {}` — an empty object counts as absent so the semantic
    // error (notFound) wins over the document-shape check below.
    const rawDocument = body.didDocument;
    const didDocument =
      rawDocument &&
      typeof rawDocument === "object" &&
      !Array.isArray(rawDocument) &&
      Object.keys(rawDocument).length > 0
        ? (rawDocument as DIDResolutionResult["didDocument"])
        : body["id"]
          ? (body as unknown as DIDResolutionResult["didDocument"])
          : null;

    const error = normalizeUpstreamError(body.didResolutionMetadata?.error);
    const resolutionMetadata = body.didResolutionMetadata
      ? { ...body.didResolutionMetadata, ...(error ? { error } : {}) }
      : undefined;
    const expectedId = parse(did)?.did;
    if (
      didDocument &&
      (typeof didDocument.id !== "string" ||
        !expectedId ||
        didDocument.id !== expectedId)
    ) {
      return {
        ok: false,
        failure: { error: "invalidDidDocument", status: res.status },
      };
    }
    if (!res.ok || !didDocument || error) {
      return {
        ok: false,
        failure: {
          error: error ?? (res.status === 404 ? "notFound" : "upstreamError"),
          status: res.status,
          metadata: resolutionMetadata,
          documentMetadata: body.didDocumentMetadata,
        },
      };
    }

    return {
      ok: true,
      result: {
        didResolutionMetadata: {
          contentType: "application/did+ld+json",
          ...resolutionMetadata,
        },
        didDocument,
        didDocumentMetadata: body.didDocumentMetadata ?? {},
      },
    };
  } catch {
    return { ok: false, failure: { error: "networkError" } };
  }
}
