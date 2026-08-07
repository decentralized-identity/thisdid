/**
 * Local resolution — the vendored DIF `did-resolver` core (vendor/did-resolver)
 * wired with in-Worker method drivers. Currently ships the did:web driver;
 * additional pure-JS drivers (key, jwk, pkh…) can be registered in the same map.
 */
import { Resolver, type DIDResolutionResult, type ResolverRegistry } from 'did-resolver'
import { getResolver as getWebResolver } from 'web-did-resolver'

let cached: Resolver | null = null

function buildRegistry(): ResolverRegistry {
  // web-did-resolver bundles its own (v4) did-resolver types; the driver
  // functions are structurally identical to the vendored (v5) core at runtime,
  // so we adopt them into the vendored ResolverRegistry.
  return {
    ...(getWebResolver() as unknown as ResolverRegistry),
  }
}

/** Singleton Resolver — cheap to reuse across requests in a Worker isolate. */
export function localResolver(): Resolver {
  if (!cached) cached = new Resolver(buildRegistry())
  return cached
}

/** True when a bundled local driver exists for `method`. */
export function hasLocalDriver(method: string): boolean {
  return method in buildRegistry()
}

export async function resolveLocal(did: string): Promise<DIDResolutionResult> {
  return localResolver().resolve(did)
}
