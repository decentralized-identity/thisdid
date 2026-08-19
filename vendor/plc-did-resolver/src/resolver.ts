/**
 * @thisdid/plc-did-resolver — DIF `did-resolver` driver for did:plc.
 *
 * A thin standard wrapper: the method implementation is entirely Bluesky's
 * fetch-native [`@atproto/identity`](https://www.npmjs.com/package/@atproto/identity);
 * this package only maps its `DidPlcResolver` onto the DIF `getResolver()`
 * registry contract, with two pieces of glue:
 *
 *  - `DidPlcResolver.resolveNoCheck` fetches with `redirect: "error"`, which
 *    Cloudflare workerd's fetch does not implement (only `follow`/`manual`).
 *    The subclass below uses `redirect: "manual"` and treats any redirect as a
 *    failure — the same security posture, runnable on workerd. Document
 *    validation stays with the package (`BaseResolver.resolve` →
 *    `validateDidDoc`).
 *  - The package's error classes are mapped to DIF resolution error codes.
 *
 * Retired in favor of upstream if @atproto/identity gains a DIF registry
 * export and workerd-compatible fetch options.
 */
import {
  DidPlcResolver,
  PoorlyFormattedDidDocumentError,
  PoorlyFormattedDidError,
} from "@atproto/identity";
import type {
  DIDDocument,
  DIDResolutionResult,
  ResolverRegistry,
} from "did-resolver";

export interface PlcResolverOptions {
  /** PLC directory base. Defaults to the method's canonical public directory. */
  directoryUrl?: string;
  /** Per-request wall-clock bound. Default 6000 ms. */
  timeoutMs?: number;
}

const DEFAULT_DIRECTORY_URL = "https://plc.directory";
const DEFAULT_TIMEOUT_MS = 6000;
const MAX_RESPONSE_BYTES = 1024 * 1024;

/**
 * Read at most MAX_RESPONSE_BYTES of a response body, cancelling the stream
 * the moment it exceeds the bound — the guard runs before any buffering or
 * parsing, so an oversized directory cannot make this worker hold it in
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

class WorkerdPlcResolver extends DidPlcResolver {
  override async resolveNoCheck(did: string): Promise<unknown> {
    const url = new URL(`/${encodeURIComponent(did)}`, this.plcUrl);
    const res = await fetch(url, {
      redirect: "manual",
      headers: { accept: "application/did+ld+json,application/json" },
      signal: AbortSignal.timeout(this.timeout),
    });
    if (res.status === 404) return null;
    if (res.status >= 300 && res.status < 400) {
      throw new Error("Unexpected redirect from the PLC directory");
    }
    if (!res.ok) {
      throw Object.assign(new Error(res.statusText), { status: res.status });
    }
    const text = await readBounded(res);
    if (text === null) {
      throw new Error("PLC directory response exceeds the size bound");
    }
    return JSON.parse(text);
  }
}

export function getResolver(options?: PlcResolverOptions): ResolverRegistry {
  const resolver = new WorkerdPlcResolver(
    options?.directoryUrl || DEFAULT_DIRECTORY_URL,
    options?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );

  const plc = async (did: string): Promise<DIDResolutionResult> => {
    try {
      const doc = await resolver.resolve(did);
      if (!doc) {
        return {
          didResolutionMetadata: { error: "notFound" },
          didDocument: null,
          didDocumentMetadata: {},
        };
      }
      return {
        didResolutionMetadata: { contentType: "application/did+ld+json" },
        didDocument: doc as unknown as DIDDocument,
        didDocumentMetadata: {},
      };
    } catch (error) {
      const code =
        error instanceof PoorlyFormattedDidError
          ? "invalidDid"
          : error instanceof PoorlyFormattedDidDocumentError
            ? "invalidDidDocument"
            : "internalError";
      return {
        didResolutionMetadata: { error: code },
        didDocument: null,
        didDocumentMetadata: {},
      };
    }
  };

  return { plc } as ResolverRegistry;
}
