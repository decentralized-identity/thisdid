import type { DIDResolutionResult } from "did-resolver";
import type { DriverServiceBinding } from "./driver-workers/contract";

export interface DriverBindings {
  DRIVER_WEB?: DriverServiceBinding;
  DRIVER_KEY?: DriverServiceBinding;
  DRIVER_PKH?: DriverServiceBinding;
  DRIVER_PEER?: DriverServiceBinding;
  DRIVER_ETHR?: DriverServiceBinding;
  DRIVER_WEBVH?: DriverServiceBinding;
  DRIVER_PLC?: DriverServiceBinding;
  DRIVER_EBSI?: DriverServiceBinding;
  DRIVER_NEAR?: DriverServiceBinding;
  DRIVER_JWK?: DriverServiceBinding;
  DRIVER_CHEQD?: DriverServiceBinding;
  DRIVER_DNS?: DriverServiceBinding;
  DRIVER_ENS?: DriverServiceBinding;
  DRIVER_CID?: DriverServiceBinding;
  DRIVER_ION?: DriverServiceBinding;
  DRIVER_SOL?: DriverServiceBinding;
  DRIVER_IDEN3?: DriverServiceBinding;
  DRIVER_POLYGONID?: DriverServiceBinding;
  DRIVER_HEDERA?: DriverServiceBinding;
  DRIVER_XRPL?: DriverServiceBinding;
}

/** Worker bindings (see wrangler.jsonc). */
export interface Env extends DriverBindings {
  ASSETS: Fetcher;
  /** godiddy Universal Resolver base (path prefix, DID appended). */
  GODIDDY_RESOLVER: string;
  /** godiddy API key / OAuth2 token (secret). Sent as `Authorization: Bearer`. Optional. */
  GODIDDY_API_KEY?: string;
  /** archon Universal Resolver base (path prefix, DID appended). */
  ARCHON_RESOLVER: string;
  /** Archon Gatekeeper base for did:cid ONLY (DID appended) — Archon serves
   * cid through archon.technology/api/v1/did, not its Universal Resolver. */
  ARCHON_CID_RESOLVER: string;
  /** GoPlausible Universal Resolver base (DID appended) — tried first for did:algo / did:nfd. */
  GOPLAUSIBLE_RESOLVER: string;
  RESOLVER_LABEL: string;
  /** D1 database — authoritative per-resolution event log (optional until provisioned). */
  DB?: D1Database;
  /** KV namespace — live counter + read-through dashboard cache (optional until provisioned). */
  STATS_KV?: KVNamespace;
  /** Cloudflare edge rate limiter. Optional so tests and local development remain simple. */
  RESOLUTION_RATE_LIMITER?: {
    limit(input: { key: string }): Promise<{ success: boolean }>;
  };
}

/** Extra fields ThisDID adds to `didResolutionMetadata` so the UI can render the route banner. */
export interface ThisDidRouteMeta {
  /** Which layer answered: a local driver, or a routed upstream resolver. */
  route: "local" | "upstream";
  /** Provider tag that answered — `ThisDID` | `godiddy` | `archon`. */
  provider: string;
  /** Human label for the driver/resolver that served the request. */
  resolver: string;
  /** Network / ledger the method lives on. */
  network: string;
  /** Wall-clock resolution time in milliseconds. */
  durationMs: number;
  /** For upstream routes, the base URL that actually answered. */
  via?: string;
  /** The ordered fallback chain that was attempted, e.g. "local→godiddy→archon". */
  chain?: string;
  /** Steps actually attempted, including health-based planning. */
  attempted?: string[];
  /** Sanitized per-step failure information retained when no route succeeds. */
  attempts?: Array<{ step: string; error: string; status?: number }>;
  /** Probation double-check outcome for new local drivers (see src/resolvers/verify.ts). */
  verification?: {
    status: "match" | "mismatch" | "unverified";
    provider?: string;
    reason?: string;
  };
}

export type ThisDidResolution = DIDResolutionResult & {
  didResolutionMetadata: DIDResolutionResult["didResolutionMetadata"] &
    Partial<ThisDidRouteMeta>;
};
