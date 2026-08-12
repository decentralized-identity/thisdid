import { describe, expect, it } from 'vitest'
import { handleMcp } from './mcp'
import type { Env } from './types'

const env = {} as Env

describe('MCP endpoint handler', () => {
  it('negotiates and advertises tools', async () => {
    const initialized = await handleMcp({ jsonrpc: '2.0', id: 1, method: 'initialize' }, env)
    expect((initialized?.result as { serverInfo: { name: string } }).serverInfo.name).toBe('ThisDID')
    const listed = await handleMcp({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, env)
    expect((listed?.result as { tools: unknown[] }).tools).toHaveLength(4)
  })

  it('implements method and routing tools', async () => {
    const response = await handleMcp({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'describe_routing', arguments: { method: 'did:algo' } } }, env)
    const text = ((response?.result as { content: Array<{ text: string }> }).content[0]).text
    expect(JSON.parse(text).chain).toEqual(['goplausible', 'godiddy', 'archon'])
  })

  it('does not respond to JSON-RPC notifications', async () => {
    expect(await handleMcp({ jsonrpc: '2.0', method: 'ping' }, env)).toBeNull()
  })
})
