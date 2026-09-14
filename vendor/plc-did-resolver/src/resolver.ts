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
 *    failure — the same security posture, runnable on workerd.
 *  - Identifier and document validation (`document.ts`): the package's
 *    resolver path never checks the did:plc syntax before querying the
 *    directory, and validates documents with a schema its own authors mark
 *    deprecated and less spec-compliant. Both are enforced here.
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
import {
  assertDidPlc,
  assertValidPlcDocument,
  InvalidPlcDid,
  InvalidPlcDocument,
} from "./document.js";
import { applyRepresentation } from "./representation.js";

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

  const plc = async (
    did: string,
    _parsed: unknown,
    _resolver: unknown,
    resolutionOptions: { accept?: unknown } = {},
  ): Promise<DIDResolutionResult> => {
    try {
      // Refuse a malformed identifier before it reaches the directory.
      assertDidPlc(did);
      const doc = await resolver.resolve(did);
      if (!doc) {
        return {
          didResolutionMetadata: { error: "notFound" },
          didDocument: null,
          didDocumentMetadata: {},
        };
      }
      // The directory's answer must be a usable DID document, not merely JSON
      // the deprecated schema tolerates.
      assertValidPlcDocument(doc, did);
      // DID Core representation negotiation.
      return applyRepresentation(
        {
          didResolutionMetadata: { contentType: "application/did+ld+json" },
          didDocument: doc as unknown as DIDDocument,
          didDocumentMetadata: {},
        },
        resolutionOptions.accept,
      );
    } catch (error) {
      const code =
        error instanceof InvalidPlcDid ||
        error instanceof PoorlyFormattedDidError
          ? "invalidDid"
          : error instanceof InvalidPlcDocument ||
              error instanceof PoorlyFormattedDidDocumentError
            ? "invalidDidDocument"
            : "internalError";
      const message =
        error instanceof InvalidPlcDid || error instanceof InvalidPlcDocument
          ? { message: error.message.slice(0, 200) }
          : {};
      return {
        didResolutionMetadata: { error: code, ...message },
        didDocument: null,
        didDocumentMetadata: {},
      };
    }
  };

  return { plc } as ResolverRegistry;
}
