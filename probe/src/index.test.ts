import { expect, it } from 'vitest'
import { fold } from './index'

it('trips a provider down after three all-failed probe rounds and recovers on success', () => {
  const failed = [{ step: 'archon' as const, did: 'did:iden3:test', ok: false, ms: 8000, error: 'timeout' }]
  const one = fold(null, failed, 1)
  const two = fold(one, failed, 2)
  const three = fold(two, failed, 3)
  expect(three.providers.archon?.status).toBe('down')
  const recovered = fold(three, [{ ...failed[0], ok: true, ms: 100, error: null }], 4)
  expect(recovered.providers.archon?.status).toBe('up')
  expect(recovered.providers.archon?.consecutiveFails).toBe(0)
})
