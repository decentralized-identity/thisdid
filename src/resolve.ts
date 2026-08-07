/**
 * Resolution orchestrator. Parses the DID, walks its routing chain (ThisDID
 * local + redundant upstreams in a method-specific order), and returns the first
 * successful result annotated with ThisDID route metadata for the UI banner.
 */
import { parse, type DIDResolutionResult } from 'did-resolver'
import { chainFor, providerTag, stepRoute, type Step } from './resolvers/registry'
import { resolveLocal } from './resolvers/local'
import { fetchUpstream } from './resolvers/upstream'
import { networkFor } from './methods'
import type { Env, ThisDidResolution } from './types'

function errorResult(error: string): ThisDidResolution {
  return { didResolutionMetadata: { error }, didDocument: null, didDocumentMetadata: {} }
}

/** The endpoint/base a step routes to (for the `via` metadata field). */
function upstreamBase(step: Step, env: Env): string {
  switch (step) {
    case 'godiddy':
      return env.GODIDDY_RESOLVER
    case 'archon':
      return env.ARCHON_RESOLVER
    case 'goplausible':
      return env.GOPLAUSIBLE_RESOLVER
    default:
      return ''
  }
}

function resolverLabel(step: Step, method: string): string {
  if (step === 'local') return `ThisDID (${method} driver)`
  if (step === 'goplausible') return 'GoPlausible universal-resolver'
  return `${step} universal-resolver`
}

/** Run one chain step; null means "failed, try the next step". Never throws. */
async function runStep(step: Step, did: string, env: Env): Promise<DIDResolutionResult | null> {
  try {
    if (step === 'local') {
      const r = await resolveLocal(did)
      return r.didDocument && !r.didResolutionMetadata.error ? r : null
    }
    // godiddy / archon / goplausible are all DIF Universal Resolver GET endpoints.
    const token = step === 'godiddy' ? env.GODIDDY_API_KEY : undefined
    return fetchUpstream(did, upstreamBase(step, env), token)
  } catch {
    return null
  }
}

/** Bound a step's wall-clock so a hung driver fails over instead of stalling. */
const STEP_TIMEOUT_MS = 8000
function withTimeout(p: Promise<DIDResolutionResult | null>): Promise<DIDResolutionResult | null> {
  return Promise.race([p, new Promise<null>((resolve) => setTimeout(() => resolve(null), STEP_TIMEOUT_MS))])
}

export async function resolveDid(did: string, env: Env): Promise<ThisDidResolution> {
  const trimmed = (did || '').trim()
  const parsed = parse(trimmed)
  if (!parsed) return errorResult('invalidDid')

  const method = parsed.method
  const chain = chainFor(method)
  const chainLabel = chain.join('→')
  const started = Date.now()

  for (const step of chain) {
    const hit = await withTimeout(runStep(step, trimmed, env))
    if (hit) {
      const result = hit as ThisDidResolution
      result.didResolutionMetadata = {
        contentType: 'application/did+ld+json',
        ...result.didResolutionMetadata,
        route: stepRoute(step),
        provider: providerTag(step),
        resolver: resolverLabel(step, method),
        network: networkFor(method),
        durationMs: Math.max(1, Date.now() - started),
        chain: chainLabel,
        ...(step === 'local' ? {} : { via: upstreamBase(step, env) }),
      }
      return result
    }
  }

  // Every step in the chain failed.
  const fail = errorResult('notFound')
  fail.didResolutionMetadata = {
    ...fail.didResolutionMetadata,
    network: networkFor(method),
    durationMs: Math.max(1, Date.now() - started),
    chain: chainLabel,
  }
  return fail
}
