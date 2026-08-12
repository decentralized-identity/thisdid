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
    example: "did:key:z6MktvqCyLxTsXUH1tUZncNdVeEZ7hNh7npPRbUU27GTrYb8",
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
    example: "did:pkh:eip155:1:0xab16a96d359ec26a11e2c2b3d8f8b8942d5bfcdb",
  },
  {
    id: "peer",
    name: "did:peer",
    glyph: "R",
    desc: "Deterministic peer-to-peer DIDComm identities",
    example: "did:peer:0z6MkqRYqQiSgvZQdnBytw86Qbs2ZWUkGv22od935YF4s8M7V",
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
      "did:iden3:polygon:amoy:xC8VZLUUfo5p9DWUawReh7QSstmYN6zR7qsQhQCsw",
  },
  {
    id: "sol",
    name: "did:sol",
    glyph: "S",
    desc: "Solana on-chain identifiers",
    example: "did:sol:devnet:2eK2DKs6vdzTEoj842Gfcs6DdtffPpw1iF6JbzQL4TuK",
  },
  {
    id: "cheqd",
    name: "did:cheqd",
    glyph: "C",
    desc: "cheqd network identity ledger",
    example: "did:cheqd:mainnet:Ps1ysXP2Ae6GBfxNhNQNKN",
  },
  {
    id: "nfd",
    name: "did:nfd",
    glyph: "N",
    desc: "Algorand NFDomains name identity",
    example: "did:nfd:nfdomains.algo",
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

/**
 * Method-specific test identifiers used by chip clicks.
 *
 * Every value below has been resolution-checked through ThisDID's public API.
 * Most routed-method values originate in the current DIF Universal Resolver
 * test identifier catalog. Methods without a currently resolving test
 * identifier intentionally have no entry and render as disabled chips.
 */
const OVERRIDES: Record<string, string> = {
  indy: "did:indy:sovrin:WRfXPg8dantKVubE3HX8pw",
  v1: "did:v1:test:nym:z6Mkmpe2DyE4NsDiAb58d75hpi1BjqbH6wYMschUkjWDEEuR",
  web: "did:web:identity.foundation",
  ethr: "did:ethr:0xb9c5714089478a327f09197987f16f9e5d936e8a",
  ens: "did:ens:vitalik.eth",
  peer: "did:peer:0z6MkqRYqQiSgvZQdnBytw86Qbs2ZWUkGv22od935YF4s8M7V",
  eosio: "did:eosio:eos:eoscanadacom",
  ccp: "did:ccp:ceNobbK6Me9F5zwyE3MKY88QZLw",
  io: "did:io:0x476c81C27036D05cB5ebfe30ae58C23351a61C4A",
  bba: "did:bba:t:45e6df15dc0a7d91dcccd24fda3b52c3983a214fb0eed0938321c11ec99403cf",
  schema: "did:schema:evan-ipfs:json-schema:Qma2beXKwZeiUXcaRaQKwbBV1TqyiJnsMTYExUTdQue43J",
  gatc: "did:gatc:2xtSori9UQZdTqzxrkp7zqKM4Kj5B4C7",
  sol: "did:sol:devnet:2eK2DKs6vdzTEoj842Gfcs6DdtffPpw1iF6JbzQL4TuK",
  ebsi: "did:ebsi:zjUnExsyyweQ9p4cy3nvrVc",
  meta: "did:meta:0000000000000000000000000000000000000000000000000000000000005e65",
  key: "did:key:z6MktvqCyLxTsXUH1tUZncNdVeEZ7hNh7npPRbUU27GTrYb8",
  oyd: "did:oyd:zQmaBZTghndXTgxNwfbdpVLWdFf6faYE4oeuN2zzXdQt1kh",
  everscale: "did:everscale:47325e80e3cef5922d3a3583ae5c405ded7bda781cb069f2bc932a6c3d6ec62e",
  cheqd: "did:cheqd:mainnet:Ps1ysXP2Ae6GBfxNhNQNKN",
  dyne: "did:dyne:demo:FFqGYxShyDGAHd4QyLY1KFCSGBb1mBP9sZebEyBM7JPi",
  kscirc: "did:kscirc:k2f2PhnVHabRenKbaKfLMyuxRU94S1HfAwsR2dMHxTqVeEzmPxsd",
  plc: "did:plc:yk4dd2qkboz2yv6tpubpc6co",
  evrc: "did:evrc:issuer:polygon:62eeb90e-eee4-4d31-8927-1075e82b2a74",
  webs: "did:webs:peacekeeper.github.io:did-webs-iiw37-tutorial:EKYGGh-FtAphGmSZbsuBs_t4qpsjYJ2ZqvMKluq9OxmP",
  iden3: "did:iden3:polygon:amoy:xC8VZLUUfo5p9DWUawReh7QSstmYN6zR7qsQhQCsw",
  empe: "did:empe:testnet:006308981b61932c5eaae1c39ace8ee3892f4a1f",
  hedera: "did:hedera:testnet:zHirM7oP62rzBmw4oSbWZTSeTLzb9zrDTfQa1cdMBWCPp_0.0.7280148",
  nfd: "did:nfd:nfdomains.algo",
  algo: "did:algo:uti7paasilrda3ishy5m7j7lnrx2aivqjwi7zkccgkvlmfd3vpr5pwsz4i",
  pkh: "did:pkh:eip155:1:0xab16a96d359ec26a11e2c2b3d8f8b8942d5bfcdb",
};

export function exampleFor(methodId: string): string | undefined {
  return OVERRIDES[methodId];
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
