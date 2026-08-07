import type { DIDResolutionResult } from 'did-resolver'

/** Worker bindings (see wrangler.jsonc). */
export interface Env {
  ASSETS: Fetcher
  /** godiddy Universal Resolver base (path prefix, DID appended). */
  GODIDDY_RESOLVER: string
  /** godiddy API key / OAuth2 token (secret). Sent as `Authorization: Bearer`. Optional. */
  GODIDDY_API_KEY?: string
  /** archon Universal Resolver base (path prefix, DID appended). */
  ARCHON_RESOLVER: string
  /** GoPlausible Universal Resolver base (DID appended) — tried first for did:algo / did:nfd. */
  GOPLAUSIBLE_RESOLVER: string
  RESOLVER_LABEL: string
  /** D1 database — authoritative per-resolution event log (optional until provisioned). */
  DB?: D1Database
  /** KV namespace — live counter + read-through dashboard cache (optional until provisioned). */
  STATS_KV?: KVNamespace
}

/** Extra fields thisDID adds to `didResolutionMetadata` so the UI can render the route banner. */
export interface ThisDidRouteMeta {
  /** Which layer answered: a local driver, or a routed upstream resolver. */
  route: 'local' | 'upstream'
  /** Provider tag that answered — `thisDID` | `godiddy` | `archon`. */
  provider: string
  /** Human label for the driver/resolver that served the request. */
  resolver: string
  /** Network / ledger the method lives on. */
  network: string
  /** Wall-clock resolution time in milliseconds. */
  durationMs: number
  /** For upstream routes, the base URL that actually answered. */
  via?: string
  /** The ordered fallback chain that was attempted, e.g. "local→godiddy→archon". */
  chain?: string
}

export type ThisDidResolution = DIDResolutionResult & {
  didResolutionMetadata: DIDResolutionResult['didResolutionMetadata'] & Partial<ThisDidRouteMeta>
}
