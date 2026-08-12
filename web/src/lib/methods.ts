/** Method metadata mirrored from the Worker so the landing page renders offline. */
export interface MethodMeta {
  id: string;
  name: string;
  glyph: string;
  desc: string;
  example: string;
}

export const FEATURED_METHODS: MethodMeta[] = [
  {
    id: "web",
    name: "did:web",
    glyph: "W",
    desc: "Domain-anchored, resolved from .well-known",
    example: "did:web:identity.foundation",
  },
  {
    id: "key",
    name: "did:key",
    glyph: "K",
    desc: "Deterministic, offline cryptographic keys",
    example: "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK",
  },
  {
    id: "ethr",
    name: "did:ethr",
    glyph: "E",
    desc: "Ethereum on-chain registry identifiers",
    example: "did:ethr:0xb9c5714089478a327f09197987f16f9e5d936e8a",
  },
  {
    id: "pkh",
    name: "did:pkh",
    glyph: "P",
    desc: "CAIP-10 blockchain account identifiers",
    example: "did:pkh:eip155:1:0xb9c5714089478a327f09197987f16f9e5d936e8a",
  },
  {
    id: "algo",
    name: "did:algo",
    glyph: "A",
    desc: "Algorand on-chain identifiers",
    example:
      "did:algo:uti7paasilrda3ishy5m7j7lnrx2aivqjwi7zkccgkvlmfd3vpr5pwsz4i",
  },
  {
    id: "iden3",
    name: "did:iden3",
    glyph: "3",
    desc: "Polygon zk-identity state proofs",
    example:
      "did:iden3:polygon:main:2qCU58EJgrELNZCDkSU23dQHZsBgAFWLNpNezo1g6b",
  },
  {
    id: "sol",
    name: "did:sol",
    glyph: "S",
    desc: "Solana on-chain identifiers",
    example: "did:sol:4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T",
  },
  {
    id: "jwk",
    name: "did:jwk",
    glyph: "J",
    desc: "Single JSON Web Key, no ledger",
    example: "did:jwk:eyJrdHkiOiJPS1AiLCJjcnYiOiJFZDI1NTE5In0",
  },
  {
    id: "cheqd",
    name: "did:cheqd",
    glyph: "C",
    desc: "cheqd network identity ledger",
    example: "did:cheqd:mainnet:zF7rhDBfUt9d1gJPjx7s1JXfUY7oVWkY",
  },
  {
    id: "nfd",
    name: "did:nfd",
    glyph: "N",
    desc: "Algorand NFDomains name identity",
    example: "did:nfd:thisdid.algo",
  },
];

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

/** Example DID for a bare method id (chip clicks). */
const OVERRIDES: Record<string, string> = {
  web: "did:web:identity.foundation",
  key: "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK",
  algo: "did:algo:uti7paasilrda3ishy5m7j7lnrx2aivqjwi7zkccgkvlmfd3vpr5pwsz4i",
  ens: "did:ens:vitalik.eth",
  hedera: "did:hedera:mainnet:0.0.29613327",
  ethr: "did:ethr:0xb9c5714089478a327f09197987f16f9e5d936e8a",
};

export function exampleFor(methodId: string): string {
  return OVERRIDES[methodId] ?? `did:${methodId}:example`;
}

/** Blend two hex colors — grades method glyphs across the coral→violet spectrum. */
export function mixHex(a: string, b: string, t: number): string {
  try {
    if (a[0] !== "#" || b[0] !== "#") return a;
    const parse = (h: string) =>
      [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const A = parse(a);
    const B = parse(b);
    const c = A.map((v, i) => Math.round(v + (B[i] - v) * t));
    return `rgb(${c.join(",")})`;
  } catch {
    return a;
  }
}
