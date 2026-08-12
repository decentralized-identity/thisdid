import { describe, expect, it } from 'vitest'
import app from './index'
import type { Env } from './types'

const env = {
  RESOLVER_LABEL: 'test',
  ASSETS: { fetch: async () => new Response('asset') },
} as unknown as Env

const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} }

describe('HTTP binding', () => {
  it('maps unsupported methods to the DIF HTTP status', async () => {
    const res = await app.request('/1.0/identifiers/did%3Aunknown%3A123', {}, env, ctx)
    expect(res.status).toBe(501)
    expect((await res.json() as { didResolutionMetadata: { error: string } }).didResolutionMetadata.error).toBe('unsupportedDidMethod')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it('serves MCP over POST and rejects GET', async () => {
    expect((await app.request('/mcp', {}, env, ctx)).status).toBe(405)
    const res = await app.request('/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) }, env, ctx)
    expect(res.status).toBe(200)
    expect((await res.json() as { result: { tools: unknown[] } }).result.tools).toHaveLength(4)
  })

  it('enforces the configured edge limiter', async () => {
    const limitedEnv = { ...env, RESOLUTION_RATE_LIMITER: { limit: async () => ({ success: false }) } }
    const res = await app.request('/1.0/identifiers/did%3Aweb%3Aexample.com', {}, limitedEnv, ctx)
    expect(res.status).toBe(429)
  })
})
