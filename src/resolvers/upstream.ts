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
    const didDocument =
      (body.didDocument as DIDResolutionResult["didDocument"]) ??
      (body["id"]
        ? (body as unknown as DIDResolutionResult["didDocument"])
        : null);

    const error = body.didResolutionMetadata?.error;
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
          metadata: body.didResolutionMetadata,
          documentMetadata: body.didDocumentMetadata,
        },
      };
    }

    return {
      ok: true,
      result: {
        didResolutionMetadata: {
          contentType: "application/did+ld+json",
          ...body.didResolutionMetadata,
        },
        didDocument,
        didDocumentMetadata: body.didDocumentMetadata ?? {},
      },
    };
  } catch {
    return { ok: false, failure: { error: "networkError" } };
  }
}
