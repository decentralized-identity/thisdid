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
  /** new driver under probation: edge results are double-checked against an upstream */
  probation?: boolean;
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
    id: "webvh",
    glyph: "V",
    probation: true,
    desc: "Domain-hosted with a verifiable key history",
    network: "HTTPS · did.jsonl history",
    example:
      "did:webvh:Qmb3KLhAKJ9wZx1gTPzcPfCxviRkiEJ4RGdHNviaedGu3i:opsecid.github.io",
    local: true,
  },
  {
    id: "plc",
    glyph: "L",
    probation: true,
    desc: "AT Protocol / Bluesky ledger identities",
    network: "AT Protocol · plc.directory",
    example: "did:plc:z72i7hdynmk6r22z27h6tvur",
    local: true,
  },
  {
    id: "ebsi",
    glyph: "B",
    probation: true,
    desc: "EU EBSI legal-entity identifiers",
    network: "EBSI (EU pilot)",
    example: "did:ebsi:zjUnExsyyweQ9p4cy3nvrVc",
    local: true,
  },
  {
    id: "near",
    glyph: "N",
    probation: true,
    desc: "NEAR accounts, named and implicit",
    network: "NEAR Protocol",
    example: "did:near:registrar.near",
    local: true,
  },
  {
    id: "jwk",
    glyph: "J",
    probation: true,
    desc: "Single JSON Web Key, deterministic and offline",
    network: "Local (offline)",
    example:
      "did:jwk:eyJjcnYiOiJQLTI1NiIsImt0eSI6IkVDIiwieCI6ImFjYklRaXVNczNpOF91c3pFakoydHBUdFJNNEVVM3l6OTFQSDZDZEgyVjAiLCJ5IjoiX0tjeUxqOXZXTXB0bm1LdG00NkdxRHo4d2Y3NEk1TEtncmwyR3pIM25TRSJ9",
    local: true,
  },
  {
    id: "cheqd",
    glyph: "C",
    probation: true,
    desc: "cheqd network identity ledger",
    network: "cheqd network",
    example: "did:cheqd:mainnet:Ps1ysXP2Ae6GBfxNhNQNKN",
    local: true,
  },
  {
    id: "dns",
    glyph: "D",
    probation: true,
    desc: "Domain keys published as DNS URI records",
    network: "DNS · DoH",
    example: "did:dns:danubetech.com",
    local: true,
  },
  {
    id: "ens",
    glyph: "S",
    probation: true,
    desc: "Ethereum Name Service identities",
    network: "Ethereum · ENS",
    example: "did:ens:vitalik.eth",
    local: true,
  },
  {
    id: "cid",
    glyph: "I",
    probation: true,
    desc: "Content-addressed Archon identities, chain-verified by ThisDID itself",
    network: "IPFS (Archon)",
    example:
      "did:cid:bagaaieraoqzjgi6537vyu3h3rtetki5g4bk6stzyqplcmwpqgqxp7fewowcq",
    local: true,
  },
  {
    id: "sol",
    glyph: "A",
    probation: true,
    desc: "Solana on-chain identities, resolved from both sol-did programs",
    network: "Solana",
    example: "did:sol:devnet:2eK2DKs6vdzTEoj842Gfcs6DdtffPpw1iF6JbzQL4TuK",
    local: true,
  },
  {
    id: "iden3",
    glyph: "3",
    probation: true,
    desc: "Iden3 identity states, read from the on-chain State contract",
    network: "Polygon (Iden3)",
    example: "did:iden3:polygon:amoy:xC8VZLUUfo5p9DWUawReh7QSstmYN6zR7qsQhQCsw",
    local: true,
  },
  {
    id: "polygonid",
    glyph: "G",
    probation: true,
    desc: "Privado ID identities on the same iden3 State-contract engine",
    network: "Polygon (Privado ID)",
    example:
      "did:polygonid:polygon:main:2q4Q7F7tM1xpwUTgWivb6TgKX3vWirsE3mqymuYjVv",
    local: true,
  },

  {
    id: "hedera",
    glyph: "H",
    probation: true,
    desc: "Hedera Consensus Service DID topics, signature-verified",
    network: "Hedera (HCS)",
    example:
      "did:hedera:testnet:zHirM7oP62rzBmw4oSbWZTSeTLzb9zrDTfQa1cdMBWCPp_0.0.7280148",
    local: true,
  },

  {
    id: "xrpl",
    glyph: "X",
    probation: true,
    desc: "Native XLS-40 DIDs, read from the XRP Ledger itself",
    network: "XRP Ledger",
    example: "did:xrpl:0:r9BUM9z14j7bLFzQHRfurWNdNKYSABdGtE",
    local: true,
  },

  {
    id: "iota",
    glyph: "T",
    probation: true,
    desc: "Identity Move objects on IOTA Rebased, unpacked and verified",
    network: "IOTA Rebased",
    example:
      "did:iota:0x0c6e3b00bfe019452ffee1b5c7f5e6d2e09705cb6a354d22fd853450494a697c",
    local: true,
  },
  {
    id: "dht",
    glyph: "M",
    probation: true,
    desc: "Ed25519-signed DNS packets in BitTorrent's Mainline DHT",
    network: "Mainline DHT · Pkarr",
    example: "did:dht:i9xkp8ddcbcg8jwq54ox699wuzxyifsqx4jru45zodqu453ksz6y",
    local: true,
  },
  {
    id: "tz",
    glyph: "Z",
    probation: true,
    desc: "Tezos accounts, derived offline with verified key discovery",
    network: "Tezos",
    example: "did:tz:tz3cqThj23Feu55KDynm7Vg81mCMpWDgzQZq",
    local: true,
  },
  {
    id: "empe",
    glyph: "F",
    probation: true,
    desc: "Empeiria EVDI chain documents, protobuf-decoded from RPC",
    network: "Empeiria (EVDI)",
    example: "did:empe:testnet:006308981b61932c5eaae1c39ace8ee3892f4a1f",
    local: true,
  },
  {
    id: "ion",
    glyph: "O",
    probation: true,
    desc: "Sidetree DIDs anchored to Bitcoin; long-form verified offline",
    network: "Bitcoin · ION (Sidetree)",
    example: "did:ion:EiClkZMDxPKqC9c-umQfTkR8vvZ9JPhl_xLDI9Nfk38w5w",
    local: true,
  },
];

/** Methods with intentionally configured local or upstream routes. */
export const ALL_METHODS: string[] = [
  "btcr",
  "btcr2",
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
  "cid",
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
  "ling",
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
  "near",
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
  "webvh",
  "prism",
  "iden3",
  "polygonid",
  "cndid",
  "tgrid",
  "empe",
  "hedera",
  "xrpl",
  "iota",
  "dht",
  "tz",
  "nfd",
  "bluchain",
  "webplus",
  "algo",
  "pkh",
];

/** Methods for which at least one configured route is intentionally offered. */
export const SUPPORTED_METHODS = new Set(ALL_METHODS);

/** Methods backed by independently deployed Tier 1 TypeScript driver Workers. */
export const LOCAL_DRIVER_METHODS = [
  "web",
  "key",
  "pkh",
  "peer",
  "ethr",
  "webvh",
  "plc",
  "ebsi",
  "near",
  "jwk",
  "cheqd",
  "dns",
  "ens",
  "cid",
  "sol",
  "iden3",
  "polygonid",
  "hedera",
  "xrpl",
  "iota",
  "empe",
  "dht",
  "tz",
  "ion",
];

/**
 * New local drivers under probation: every edge resolution is double-checked
 * against a redundant upstream until the method's match-rate earns graduation
 * (see src/resolvers/verify.ts). Keep in sync with the `probation` tile flags.
 */
export const PROBATION_METHODS: Set<string> = new Set([
  "webvh",
  "plc",
  "ebsi",
  "near",
  "jwk",
  "cheqd",
  "dns",
  "ens",
  "cid",
  "sol",
  "iden3",
  "polygonid",
  "hedera",
  "xrpl",
  "iota",
  "empe",
  "dht",
  "tz",
  "ion",
]);

/** True when ThisDID advertises a resolution route for the method. */
export function isSupportedMethod(method: string): boolean {
  return SUPPORTED_METHODS.has(method.toLowerCase());
}

/** Network labels for prominent upstream-routed methods without a featured tile. */
const UPSTREAM_NETWORKS: Record<string, string> = {
  algo: "Algorand MainNet",
  nfd: "Algorand NFDomains",
  oyd: "OYDID (provenance log)",
};

const NETWORKS: Record<string, string> = {
  ...UPSTREAM_NETWORKS,
  ...Object.fromEntries(FEATURED_METHODS.map((m) => [m.id, m.network])),
};

/** Best-effort human network label for a method (used in the route banner). */
export function networkFor(method: string): string {
  return NETWORKS[method] ?? "Method-specific ledger";
}
