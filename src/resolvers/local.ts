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
    case "webvh":
      return env.DRIVER_WEBVH;
    case "plc":
      return env.DRIVER_PLC;
    case "ebsi":
      return env.DRIVER_EBSI;
    case "near":
      return env.DRIVER_NEAR;
    case "jwk":
      return env.DRIVER_JWK;
    case "cheqd":
      return env.DRIVER_CHEQD;
    case "dns":
      return env.DRIVER_DNS;
    case "ens":
      return env.DRIVER_ENS;
    case "cid":
      return env.DRIVER_CID;
    case "ion":
      return env.DRIVER_ION;
    case "sol":
      return env.DRIVER_SOL;
    case "iden3":
      return env.DRIVER_IDEN3;
    case "polygonid":
      return env.DRIVER_POLYGONID;
    case "hedera":
      return env.DRIVER_HEDERA;
    case "xrpl":
      return env.DRIVER_XRPL;
    case "iota":
      return env.DRIVER_IOTA;
    case "empe":
      return env.DRIVER_EMPE;
    case "dht":
      return env.DRIVER_DHT;
    case "tz":
      return env.DRIVER_TZ;
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
