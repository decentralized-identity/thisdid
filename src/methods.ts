/**
 * Supported DID method metadata — shared by the resolver (network labels) and
 * surfaced through the API so the landing SPA can render method cards/chips from
 * a single source of truth.
 */

export interface MethodMeta {
  /** method id, e.g. "web" */
  id: string;
  /** short human network/ledger label used in the route banner */
  network: string;
  /** one-line description (featured cards) */
  desc?: string;
  /** single-letter glyph for the featured tile */
  glyph?: string;
  /** a resolvable example DID */
  example?: string;
  /** whether ThisDID resolves it with a local driver (vs. routed upstream) */
  local?: boolean;
}

/** Featured methods (rendered as large cards on the landing page). */
export const FEATURED_METHODS: MethodMeta[] = [
  {
    id: "web",
    glyph: "W",
    desc: "Domain-anchored, resolved from .well-known",
    network: "HTTPS · .well-known",
    example: "did:web:identity.foundation",
    local: true,
  },
  {
    id: "key",
    glyph: "K",
    desc: "Deterministic, offline cryptographic keys",
    network: "Local (offline)",
    example: "did:key:z6MktvqCyLxTsXUH1tUZncNdVeEZ7hNh7npPRbUU27GTrYb8",
    local: true,
  },
  {
    id: "ethr",
    glyph: "E",
    desc: "Ethereum on-chain registry identifiers",
    network: "Ethereum Mainnet",
    example: "did:ethr:0xb9c5714089478a327f09197987f16f9e5d936e8a",
    local: true,
  },
  {
    id: "pkh",
    glyph: "P",
    desc: "CAIP-10 blockchain account identifiers",
    network: "Multi-chain (CAIP-10)",
    example: "did:pkh:eip155:1:0xab16a96d359ec26a11e2c2b3d8f8b8942d5bfcdb",
    local: true,
  },
  {
    id: "peer",
    glyph: "R",
    desc: "Deterministic peer-to-peer DIDComm identities",
    network: "Local (offline)",
    example: "did:peer:0z6MkqRYqQiSgvZQdnBytw86Qbs2ZWUkGv22od935YF4s8M7V",
    local: true,
  },
  {
    id: "algo",
    glyph: "A",
    desc: "Algorand on-chain identifiers",
    network: "Algorand MainNet",
    example:
      "did:algo:uti7paasilrda3ishy5m7j7lnrx2aivqjwi7zkccgkvlmfd3vpr5pwsz4i",
  },
  {
    id: "iden3",
    glyph: "3",
    desc: "Polygon zk-identity state proofs",
    network: "Polygon (Iden3)",
    example:
      "did:iden3:polygon:amoy:xC8VZLUUfo5p9DWUawReh7QSstmYN6zR7qsQhQCsw",
  },
  {
    id: "sol",
    glyph: "S",
    desc: "Solana on-chain identifiers",
    network: "Solana",
    example: "did:sol:devnet:2eK2DKs6vdzTEoj842Gfcs6DdtffPpw1iF6JbzQL4TuK",
  },
  {
    id: "cheqd",
    glyph: "C",
    desc: "cheqd network identity ledger",
    network: "cheqd network",
    example: "did:cheqd:mainnet:Ps1ysXP2Ae6GBfxNhNQNKN",
  },
  {
    id: "nfd",
    glyph: "N",
    desc: "Algorand NFDomains name identity",
    network: "Algorand NFDomains",
    example: "did:nfd:nfdomains.algo",
  },
];

/** Methods with intentionally configured local or upstream routes. */
export const ALL_METHODS: string[] = [
  "btcr",
  "indy",
  "v1",
  "stack",
  "web",
  "ethr",
  "ens",
  "peer",
  "eosio",
  "jolo",
  "hcr",
  "elem",
  "github",
  "ccp",
  "ont",
  "kilt",
  "factom",
  "io",
  "bba",
  "schema",
  "ion",
  "ace",
  "gatc",
  "icon",
  "vaa",
  "unisot",
  "sol",
  "lit",
  "ebsi",
  "emtrust",
  "meta",
  "kit",
  "key",
  "orb",
  "oyd",
  "moncon",
  "dock",
  "mydata",
  "dns",
  "everscale",
  "ala",
  "cheqd",
  "com",
  "dyne",
  "jwk",
  "kscirc",
  "iscc",
  "ev",
  "iid",
  "evan",
  "bid",
  "pdc",
  "tys",
  "plc",
  "evrc",
  "keri",
  "webs",
  "prism",
  "iden3",
  "cndid",
  "tgrid",
  "empe",
  "hedera",
  "nfd",
  "bluchain",
  "webplus",
  "algo",
  "pkh",
];

/** Methods for which at least one configured route is intentionally offered. */
export const SUPPORTED_METHODS = new Set(ALL_METHODS);

/** Methods backed by independently deployed Tier 1 TypeScript driver Workers. */
export const LOCAL_DRIVER_METHODS = ["web", "key", "pkh", "peer", "ethr"];

/** True when ThisDID advertises a resolution route for the method. */
export function isSupportedMethod(method: string): boolean {
  return SUPPORTED_METHODS.has(method.toLowerCase());
}

const NETWORKS: Record<string, string> = Object.fromEntries(
  FEATURED_METHODS.map((m) => [m.id, m.network]),
);

/** Best-effort human network label for a method (used in the route banner). */
export function networkFor(method: string): string {
  return NETWORKS[method] ?? "Method-specific ledger";
}
