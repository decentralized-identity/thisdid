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
]);

/** True when ThisDID advertises a resolution route for the method. */
export function isSupportedMethod(method: string): boolean {
  return SUPPORTED_METHODS.has(method.toLowerCase());
}

/** Network labels for prominent upstream-routed methods without a featured tile. */
const UPSTREAM_NETWORKS: Record<string, string> = {
  algo: "Algorand MainNet",
  nfd: "Algorand NFDomains",
  iden3: "Polygon (Iden3)",
  sol: "Solana",
};

const NETWORKS: Record<string, string> = {
  ...UPSTREAM_NETWORKS,
  ...Object.fromEntries(FEATURED_METHODS.map((m) => [m.id, m.network])),
};

/** Best-effort human network label for a method (used in the route banner). */
export function networkFor(method: string): string {
  return NETWORKS[method] ?? "Method-specific ledger";
}
