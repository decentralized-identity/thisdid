/** Invoke one isolated Tier 1 TypeScript resolver through a private Service Binding. */
import { parse, type DIDResolutionResult } from "did-resolver";
import {
  DRIVER_PROTOCOL_VERSION,
  type DriverRequestV1,
  type DriverResponseV1,
  type DriverServiceBinding,
} from "../driver-workers/contract";
import type { DriverBindings } from "../types";

const MAX_RESPONSE_BYTES = 1024 * 1024;

function errorResult(error: string): DIDResolutionResult {
  return {
    didResolutionMetadata: { error },
    didDocument: null,
    didDocumentMetadata: {},
  };
}

function bindingFor(
  method: string,
  env: DriverBindings,
): DriverServiceBinding | undefined {
  switch (method) {
    case "web":
      return env.DRIVER_WEB;
    case "key":
      return env.DRIVER_KEY;
    case "pkh":
      return env.DRIVER_PKH;
    case "peer":
      return env.DRIVER_PEER;
    case "ethr":
      return env.DRIVER_ETHR;
    default:
      return undefined;
  }
}

export function hasLocalDriver(method: string, env: DriverBindings): boolean {
  return Boolean(bindingFor(method, env));
}

export async function resolveLocal(
  did: string,
  env: DriverBindings,
  signal?: AbortSignal,
): Promise<DIDResolutionResult> {
  const parsed = parse(did);
  if (!parsed) return errorResult("invalidDid");

  const binding = bindingFor(parsed.method, env);
  if (!binding) return errorResult("notConfigured");

  const payload: DriverRequestV1 = {
    protocol: DRIVER_PROTOCOL_VERSION,
    did,
  };
  const response = await binding.fetch("https://driver.internal/resolve", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  if (!response.ok) return errorResult("internalError");

  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) {
    return errorResult("invalidResponse");
  }

  let body: DriverResponseV1;
  try {
    body = JSON.parse(text) as DriverResponseV1;
  } catch {
    return errorResult("invalidResponse");
  }

  if (
    body.protocol !== DRIVER_PROTOCOL_VERSION ||
    body.driver?.method !== parsed.method ||
    !body.result?.didResolutionMetadata ||
    !body.result?.didDocumentMetadata ||
    !("didDocument" in body.result)
  ) {
    return errorResult("invalidResponse");
  }

  if (body.result.didDocument && body.result.didDocument.id !== parsed.did) {
    return errorResult("invalidDidDocument");
  }
  return body.result;
}
