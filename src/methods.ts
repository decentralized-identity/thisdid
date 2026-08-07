/**
 * Supported DID method metadata — shared by the resolver (network labels) and
 * surfaced through the API so the landing SPA can render method cards/chips from
 * a single source of truth.
 */

export interface MethodMeta {
  /** method id, e.g. "web" */
  id: string
  /** short human network/ledger label used in the route banner */
  network: string
  /** one-line description (featured cards) */
  desc?: string
  /** single-letter glyph for the featured tile */
  glyph?: string
  /** a resolvable example DID */
  example?: string
  /** whether thisDID resolves it with a local driver (vs. routed upstream) */
  local?: boolean
}

/** Featured methods (rendered as large cards on the landing page). */
export const FEATURED_METHODS: MethodMeta[] = [
  { id: 'web', glyph: 'W', desc: 'Domain-anchored, resolved from .well-known', network: 'HTTPS · .well-known', example: 'did:web:identity.foundation', local: true },
  { id: 'key', glyph: 'K', desc: 'Deterministic, offline cryptographic keys', network: 'Local (offline)', example: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK' },
  { id: 'ethr', glyph: 'E', desc: 'Ethereum on-chain registry identifiers', network: 'Ethereum Mainnet', example: 'did:ethr:0xb9c5714089478a327f09197987f16f9e5d936e8a' },
  { id: 'pkh', glyph: 'P', desc: 'CAIP-10 blockchain account identifiers', network: 'Multi-chain (CAIP-10)', example: 'did:pkh:eip155:1:0xb9c5714089478a327f09197987f16f9e5d936e8a' },
  { id: 'algo', glyph: 'A', desc: 'Algorand on-chain identifiers', network: 'Algorand MainNet', example: 'did:algo:uti7paasilrda3ishy5m7j7lnrx2aivqjwi7zkccgkvlmfd3vpr5pwsz4i' },
  { id: 'iden3', glyph: '3', desc: 'Polygon zk-identity state proofs', network: 'Polygon (Iden3)', example: 'did:iden3:polygon:main:2qCU58EJgrELNZCDkSU23dQHZsBgAFWLNpNezo1g6b' },
  { id: 'sol', glyph: 'S', desc: 'Solana on-chain identifiers', network: 'Solana', example: 'did:sol:4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T' },
  { id: 'jwk', glyph: 'J', desc: 'Single JSON Web Key, no ledger', network: 'Local (offline)', example: 'did:jwk:eyJrdHkiOiJPS1AiLCJjcnYiOiJFZDI1NTE5In0' },
  { id: 'cheqd', glyph: 'C', desc: 'cheqd network identity ledger', network: 'cheqd network', example: 'did:cheqd:mainnet:zF7rhDBfUt9d1gJPjx7s1JXfUY7oVWkY' },
  { id: 'nfd', glyph: 'N', desc: 'Algorand NFDomains name identity', network: 'Algorand NFDomains', example: 'did:nfd:thisdid.algo' },
]

/** Full driver list (rendered as the "All supported methods" chip cloud). */
export const ALL_METHODS: string[] = [
  'btcr', 'indy', 'v1', 'stack', 'web', 'ethr', 'ens', 'peer', 'eosio', 'jolo', 'hcr', 'elem',
  'github', 'ccp', 'ont', 'kilt', 'factom', 'io', 'bba', 'schema', 'ion', 'ace', 'gatc', 'icon',
  'vaa', 'unisot', 'sol', 'lit', 'ebsi', 'emtrust', 'meta', 'kit', 'key', 'orb', 'oyd', 'moncon',
  'dock', 'mydata', 'dns', 'everscale', 'ala', 'cheqd', 'com', 'dyne', 'jwk', 'kscirc', 'iscc',
  'ev', 'iid', 'evan', 'bid', 'pdc', 'tys', 'plc', 'evrc', 'keri', 'webs', 'prism', 'iden3',
  'cndid', 'tgrid', 'empe', 'hedera', 'nfd', 'bluchain', 'webplus', 'algo', 'pkh',
]

const NETWORKS: Record<string, string> = Object.fromEntries(
  FEATURED_METHODS.map((m) => [m.id, m.network]),
)

/** Best-effort human network label for a method (used in the route banner). */
export function networkFor(method: string): string {
  return NETWORKS[method] ?? 'Method-specific ledger'
}
