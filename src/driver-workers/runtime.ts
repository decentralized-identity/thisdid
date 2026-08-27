import {
  parse,
  Resolver,
  type DIDResolutionResult,
  type ResolverRegistry,
} from "did-resolver";
import {
  DRIVER_PROTOCOL_VERSION,
  type DriverRequestV1,
  type DriverResponseV1,
} from "./contract";

const MAX_REQUEST_BYTES = 16 * 1024;

type DriverDefinition<Env> = {
  method: string;
  packageName: string;
  packageVersion: string;
  /**
   * Reuse the Resolver between requests. Disable for packages whose provider
   * retains request-scoped I/O state, which Cloudflare Workers cannot safely
   * carry into a later stateless invocation.
   */
  cacheResolver?: boolean;
  registry(env: Env): ResolverRegistry;
};

import { scrubAlchemyDeep } from "../scrub";

export { scrubAlchemy, scrubAlchemyDeep } from "../scrub";

/**
 * Compose an Alchemy RPC endpoint from a public base-URL var (ends with `/`,
 * e.g. "https://eth-mainnet.g.alchemy.com/v2/") and the ALCHEMY_API_KEY
 * secret appended after it. Returns undefined until both halves are
 * configured so drivers keep failing closed; a legacy full-URL secret can be
 * passed as the caller's fallback during migration.
 */
export function alchemyRpcUrl(
  base: string | undefined,
  key: string | undefined,
): string | undefined {
  const trimmedBase = base?.trim();
  const trimmedKey = key?.trim();
  if (!trimmedBase || !trimmedKey) return undefined;
  return trimmedBase.replace(/\/*$/, "/") + trimmedKey;
}

function errorResult(error: string, message?: string): DIDResolutionResult {
  return {
    didResolutionMetadata: { error, ...(message ? { message } : {}) },
    didDocument: null,
    didDocumentMetadata: {},
  };
}

function response(
  definition: DriverDefinition<unknown>,
  result: DIDResolutionResult,
  started: number,
): Response {
  const body: DriverResponseV1 = {
    protocol: DRIVER_PROTOCOL_VERSION,
    result: scrubAlchemyDeep(result),
    driver: {
      method: definition.method,
      packageName: definition.packageName,
      packageVersion: definition.packageVersion,
      durationMs: Math.max(0, Date.now() - started),
    },
  };
  return Response.json(body, {
    headers: { "cache-control": "no-store" },
  });
}

export function createDriverWorker<Env>(definition: DriverDefinition<Env>) {
  let cachedEnv: Env | undefined;
  let cachedResolver: Resolver | undefined;

  function resolver(env: Env): Resolver {
    if (
      definition.cacheResolver === false ||
      !cachedResolver ||
      cachedEnv !== env
    ) {
      cachedResolver = new Resolver(definition.registry(env));
      cachedEnv = env;
    }
    return cachedResolver;
  }

  return {
    async fetch(request: Request, env: Env): Promise<Response> {
      const started = Date.now();
      const url = new URL(request.url);
      if (request.method !== "POST" || url.pathname !== "/resolve") {
        return new Response("Not found", { status: 404 });
      }

      const declaredLength = Number(request.headers.get("content-length") || 0);
      if (declaredLength > MAX_REQUEST_BYTES) {
        return new Response("Request too large", { status: 413 });
      }

      const text = await request.text();
      if (new TextEncoder().encode(text).byteLength > MAX_REQUEST_BYTES) {
        return new Response("Request too large", { status: 413 });
      }

      let body: DriverRequestV1;
      try {
        body = JSON.parse(text) as DriverRequestV1;
      } catch {
        return new Response("Invalid JSON", { status: 400 });
      }

      if (
        body.protocol !== DRIVER_PROTOCOL_VERSION ||
        typeof body.did !== "string"
      ) {
        return new Response("Invalid driver request", { status: 400 });
      }

      const parsed = parse(body.did);
      if (!parsed || parsed.method !== definition.method) {
        return response(
          definition as DriverDefinition<unknown>,
          errorResult("invalidDid"),
          started,
        );
      }

      let result: DIDResolutionResult;
      try {
        result = await resolver(env).resolve(body.did, body.options);
      } catch {
        result = errorResult("internalError");
      }

      if (result.didDocument && result.didDocument.id !== parsed.did) {
        result = errorResult(
          "invalidDidDocument",
          "DID document id does not match the requested DID",
        );
      }

      return response(definition as DriverDefinition<unknown>, result, started);
    },
  };
}
