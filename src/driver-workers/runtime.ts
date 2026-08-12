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
  registry(env: Env): ResolverRegistry;
};

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
    result,
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
    if (!cachedResolver || cachedEnv !== env) {
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
