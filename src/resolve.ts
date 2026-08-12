/**
 * Resolution orchestrator. Parses the DID, walks its routing chain (ThisDID
 * local + redundant upstreams in a method-specific order), and returns the first
 * successful result annotated with ThisDID route metadata for the UI banner.
 */
import { parse, type DIDResolutionResult } from 'did-resolver'
import { chainFor, providerTag, stepRoute, type Step } from './resolvers/registry'
import { resolveLocal } from './resolvers/local'
import { fetchUpstream, type UpstreamFailure } from './resolvers/upstream'
import { isSupportedMethod, networkFor } from './methods'
import { getHealth, type HealthSnapshot } from './routing/health'
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
type Attempt = { step: Step; result?: DIDResolutionResult; failure?: UpstreamFailure }

async function runStep(step: Step, did: string, env: Env): Promise<Attempt> {
  try {
    if (step === 'local') {
      const r = await resolveLocal(did)
      return r.didDocument && !r.didResolutionMetadata.error
        ? { step, result: r }
        : { step, failure: { error: r.didResolutionMetadata.error ?? 'notFound', metadata: r.didResolutionMetadata, documentMetadata: r.didDocumentMetadata } }
    }
    // godiddy / archon / goplausible are all DIF Universal Resolver GET endpoints.
    const token = step === 'godiddy' ? env.GODIDDY_API_KEY : undefined
    const upstream = await fetchUpstream(did, upstreamBase(step, env), token)
    return upstream.ok ? { step, result: upstream.result } : { step, failure: upstream.failure }
  } catch {
    return { step, failure: { error: 'internalError' } }
  }
}

/** Bound a step's wall-clock so a hung driver fails over instead of stalling. */
const STEP_TIMEOUT_MS = 8000
function withTimeout(step: Step, p: Promise<Attempt>): Promise<Attempt> {
  return Promise.race([p, new Promise<Attempt>((resolve) => setTimeout(() => resolve({ step, failure: { error: 'timeout' } }), STEP_TIMEOUT_MS))])
}

/** Move routes tripped `down` to the end, preserving baseline preference and failing open. */
export function planChain(baseline: Step[], health: HealthSnapshot | null): Step[] {
  if (!health) return [...baseline]
  return [...baseline.filter((s) => health.providers[s]?.status !== 'down'), ...baseline.filter((s) => health.providers[s]?.status === 'down')]
}

export async function resolveDid(did: string, env: Env): Promise<ThisDidResolution> {
  const trimmed = (did || '').trim()
  const parsed = parse(trimmed)
  if (!parsed) return errorResult('invalidDid')

  const method = parsed.method
  if (!isSupportedMethod(method)) return errorResult('unsupportedDidMethod')
  const chain = planChain(chainFor(method), await getHealth(env))
  const chainLabel = chain.join('→')
  const started = Date.now()

  const attempts: Attempt[] = []
  for (const step of chain) {
    const attempt = await withTimeout(step, runStep(step, trimmed, env))
    attempts.push(attempt)
    if (attempt.result) {
      const result = attempt.result as ThisDidResolution
      result.didResolutionMetadata = {
        contentType: 'application/did+ld+json',
        ...result.didResolutionMetadata,
        route: stepRoute(step),
        provider: providerTag(step),
        resolver: resolverLabel(step, method),
        network: networkFor(method),
        durationMs: Math.max(1, Date.now() - started),
        chain: chainLabel,
        attempted: attempts.map((a) => a.step),
        ...(step === 'local' ? {} : { via: upstreamBase(step, env) }),
      }
      return result
    }
  }

  // Every step in the chain failed.
  const meaningful = attempts.map((a) => a.failure).find((f) => f && !['networkError', 'timeout', 'internalError', 'notConfigured', 'invalidResponse', 'upstreamError'].includes(f.error))
  const fail = errorResult(meaningful?.error ?? 'notFound')
  fail.didResolutionMetadata = {
    ...(meaningful?.metadata ?? {}),
    ...fail.didResolutionMetadata,
    network: networkFor(method),
    durationMs: Math.max(1, Date.now() - started),
    chain: chainLabel,
    attempted: attempts.map((a) => a.step),
    attempts: attempts.map((a) => ({ step: a.step, error: a.failure?.error ?? 'unknown', ...(a.failure?.status ? { status: a.failure.status } : {}) })),
  }
  fail.didDocumentMetadata = meaningful?.documentMetadata ?? {}
  return fail
}
