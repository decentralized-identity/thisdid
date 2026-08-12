import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { SwaggerUI } from '@hono/swagger-ui'
import { resolveDid } from './resolve'
import { openApiSpec } from './openapi/spec'
import { FEATURED_METHODS, ALL_METHODS } from './methods'
import { getStats, parseFilter, recentPage, recordResolution } from './analytics'
import { getHealth } from './routing/health'
import { providerTag, type Step } from './resolvers/registry'
import { renderDashboard } from './dashboard'
import { handleMcp } from './mcp'
import type { Context } from 'hono'
import type { Env, ThisDidResolution } from './types'

const app = new Hono<{ Bindings: Env }>()

app.use('/1.0/*', cors())
app.use('/methods', cors())
app.use('/health', cors())
app.use('/openapi.json', cors())

// Baseline security headers for API and static responses alike.
app.use('*', async (c, next) => {
  await next()
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('Referrer-Policy', 'no-referrer')
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
})

/** Map a DID resolution error to the closest HTTP status (per DIF binding). */
function statusFor(result: ThisDidResolution): number {
  const err = result.didResolutionMetadata.error
  if (!err) return 200
  switch (err) {
    case 'invalidDid':
      return 400
    case 'notFound':
      return 404
    case 'unsupportedDidMethod':
      return 501
    case 'representationNotSupported':
      return 406
    default:
      return 500
  }
}

/** True when the client is asking for machine-readable JSON rather than the SPA. */
function wantsJson(accept: string | undefined): boolean {
  if (!accept) return false
  return /application\/(did\+)?(ld\+)?json/i.test(accept) || accept.includes('application/json')
}

function resolutionResponse(result: ThisDidResolution) {
  return Response.json(result, {
    status: statusFor(result),
    headers: { 'content-type': 'application/ld+json;profile="https://w3id.org/did-resolution"' },
  })
}

/** Percent-decode without throwing on malformed input. */
function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

/** Log a resolution to D1 without blocking the response. Never throws. */
function track(c: Context<{ Bindings: Env }>, did: string, result: ThisDidResolution) {
  try {
    const m = result.didResolutionMetadata
    const cf = (c.req.raw as Request & { cf?: IncomingRequestCfProperties }).cf
    c.executionCtx.waitUntil(
      recordResolution(c.env, {
        did,
        method: did.split(':')[1]?.toLowerCase() ?? '',
        route: m.route ?? null,
        provider: m.provider ?? null,
        resolver: m.resolver ?? null,
        via: m.via ?? null,
        network: m.network ?? null,
        durationMs: m.durationMs ?? 0,
        success: !!result.didDocument && !m.error,
        error: m.error ?? null,
        chain: m.chain ?? null,
        country: (cf?.country as string) ?? null,
        colo: (cf?.colo as string) ?? null,
        ts: Date.now(),
      }),
    )
  } catch {
    // analytics must never break resolution
  }
}

/** Resolve a DID and record analytics. Always returns a DIF resolution result. */
async function resolveAndTrack(c: Context<{ Bindings: Env }>, did: string): Promise<ThisDidResolution> {
  let result: ThisDidResolution
  try {
    result = await resolveDid(did, c.env)
  } catch {
    result = { didResolutionMetadata: { error: 'notFound' }, didDocument: null, didDocumentMetadata: {} }
  }
  track(c, did, result)
  return result
}

async function limited(c: Context<{ Bindings: Env }>): Promise<Response | null> {
  if (!c.env.RESOLUTION_RATE_LIMITER) return null
  const auth = c.req.header('authorization')
  const key = auth ? `auth:${auth.slice(0, 128)}` : 'anonymous'
  const { success } = await c.env.RESOLUTION_RATE_LIMITER.limit({ key })
  return success ? null : c.json({ didResolutionMetadata: { error: 'rateLimitExceeded' }, didDocument: null, didDocumentMetadata: {} }, 429)
}

// ── DIF Universal Resolver HTTP binding ────────────────────────────────────
app.get('/1.0/identifiers/:did{.+}', async (c) => {
  const blocked = await limited(c)
  if (blocked) return blocked
  const did = safeDecode(c.req.param('did'))
  if (did.length > 4096) return c.json({ didResolutionMetadata: { error: 'invalidDid' }, didDocument: null, didDocumentMetadata: {} }, 400)
  const result = await resolveAndTrack(c, did)
  return resolutionResponse(result)
})

// ── MCP Streamable HTTP (stateless JSON-RPC) ───────────────────────────────
app.use('/mcp', cors())
app.post('/mcp', async (c) => {
  const blocked = await limited(c)
  if (blocked) return blocked
  const length = Number(c.req.header('content-length') ?? 0)
  if (length > 64 * 1024) return c.json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Request too large' } }, 413)
  let request: unknown
  try { request = await c.req.json() } catch { return c.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400) }
  if (Array.isArray(request)) return c.json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Batch requests are not supported' } }, 400)
  const response = await handleMcp(request as Parameters<typeof handleMcp>[0], c.env)
  return response ? c.json(response) : c.body(null, 202)
})
app.get('/mcp', (c) => c.json({ error: 'methodNotAllowed', message: 'Use POST with MCP JSON-RPC.' }, 405, { Allow: 'POST' }))

// ── Discovery / docs ───────────────────────────────────────────────────────
app.get('/methods', (c) => c.json({
  featured: FEATURED_METHODS,
  all: ALL_METHODS,
  semantics: {
    all: 'Methods with an intentionally configured local or upstream route; successful resolution depends on the selected provider.',
    local: FEATURED_METHODS.filter((m) => m.local).map((m) => m.id),
    routing: 'health-aware ordered fallback',
  },
}))
app.get('/health', (c) => c.json({ status: 'ok', service: c.env.RESOLVER_LABEL }))
app.get('/openapi.json', (c) => c.json(openApiSpec(new URL(c.req.url).origin)))
app.get('/docs', (c) =>
  c.html(
    '<!doctype html><html lang="en"><head><meta charset="utf-8"/>' +
      '<meta name="viewport" content="width=device-width, initial-scale=1"/>' +
      '<title>ThisDID DIF Universal DID Resolver API</title>' +
      '<meta name="description" content="OpenAPI documentation for the ThisDID universal DID resolver — DIF-conformant resolution, discovery and analytics endpoints."/>' +
      '<link rel="canonical" href="https://thisdid.com/docs"/>' +
      '<meta property="og:type" content="website"/>' +
      '<meta property="og:url" content="https://thisdid.com/docs"/>' +
      '<meta property="og:site_name" content="ThisDID"/>' +
      '<meta property="og:title" content="ThisDID · Resolver API Docs"/>' +
      '<meta property="og:description" content="OpenAPI documentation for the ThisDID universal DID resolver."/>' +
      '<meta property="og:image" content="https://thisdid.com/poster.png"/>' +
      '<meta property="og:image:width" content="1599"/>' +
      '<meta property="og:image:height" content="1165"/>' +
      '<meta property="og:image:alt" content="ThisDID — the DIF universal resolver that distributes DID resolution"/>' +
      '<meta name="twitter:card" content="summary_large_image"/>' +
      '<meta name="twitter:title" content="ThisDID · Resolver API Docs"/>' +
      '<meta name="twitter:description" content="OpenAPI documentation for the ThisDID universal DID resolver."/>' +
      '<meta name="twitter:image" content="https://thisdid.com/poster.png"/>' +
      '<link rel="icon" href="/favicon.png" type="image/png"/></head><body>' +
      SwaggerUI({ url: '/openapi.json' }) +
      '</body></html>',
  ),
)

// ── Resolver-route health (probe sub-worker data; read-only, additive) ─────
// Snapshot comes from the `thisdid-probe` Worker via shared KV; 24h aggregates
// from its D1 `probes` table. Resolution never depends on this endpoint.
app.use('/status', cors())
app.get('/status', async (c) => {
  const snap = await getHealth(c.env)
  let last24h: Record<string, unknown>[] | null = null
  try {
    if (c.env.DB) {
      const { results } = await c.env.DB.prepare(
        'SELECT provider, COUNT(*) AS probes, SUM(success) AS ok, ' +
          'ROUND(AVG(CASE WHEN success = 1 THEN duration_ms END)) AS avgMs ' +
          'FROM probes WHERE ts > ? GROUP BY provider ORDER BY provider',
      )
        .bind(Date.now() - 24 * 3600 * 1000)
        .all()
      last24h = results
    }
  } catch {
    last24h = null // probes table absent until the probe worker's first round
  }
  return c.json({
    updated: snap?.updatedTs ?? null,
    providers: snap
      ? Object.fromEntries(Object.entries(snap.providers).map(([step, h]) => [providerTag(step as Step), h]))
      : null,
    last24h,
    configured: !!snap,
  })
})

// ── Analytics (D1 event log + KV cache) ────────────────────────────────────
app.use('/data', cors())
app.use('/recent', cors())
// Aggregated analytics (respects ?range=&country=&method=).
app.get('/data', async (c) => c.json(await getStats(c.env, parseFilter(new URL(c.req.url)))))
// Cursor-paginated live feed: ?before=<cursor>&limit=<n> plus the same filters.
app.get('/recent', async (c) => {
  const url = new URL(c.req.url)
  const before = url.searchParams.get('before') || undefined
  const limit = Number(url.searchParams.get('limit')) || undefined
  return c.json(await recentPage(c.env, parseFilter(url), before, limit))
})
// Human analytics page (content-negotiates to /data JSON for machines).
app.get('/analytics', async (c) => {
  if (wantsJson(c.req.header('accept'))) return c.json(await getStats(c.env, parseFilter(new URL(c.req.url))))
  return c.html(renderDashboard())
})
// Legacy path — permanently moved (keeps old links and bookmarks working).
app.get('/dashboard', (c) => c.redirect('/analytics', 301))

// ── Root & DID-at-root: content-negotiate SPA vs. JSON resolution ──────────
// `did:...` deep links (e.g. thisdid.com/did:web:example.com) resolve to JSON
// when JSON is requested, otherwise fall through to the SPA which reads them.
app.get('/:did{did:.+}', async (c) => {
  if (wantsJson(c.req.header('accept'))) {
    const result = await resolveAndTrack(c, safeDecode(c.req.param('did')))
    return resolutionResponse(result)
  }
  return c.env.ASSETS.fetch(c.req.raw)
})

app.get('/', (c) => {
  if (wantsJson(c.req.header('accept'))) {
    return c.json({
      service: 'ThisDID Universal Resolver',
      spec: '/openapi.json',
      docs: '/docs',
      resolve: '/1.0/identifiers/{did}',
      methods: '/methods',
    })
  }
  return c.env.ASSETS.fetch(c.req.raw)
})

// ── Everything else → static SPA assets ────────────────────────────────────
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw))

// Last-resort safety net: never leak a stack trace; always structured JSON.
app.onError((_err, c) => c.json({ error: 'internalError' }, 500))

export default app
