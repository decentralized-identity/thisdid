/** Method metadata mirrored from the Worker so the landing page renders offline. */
export interface MethodMeta {
  id: string;
  name: string;
  glyph: string;
  desc: string;
  example: string;
  /** new driver under probation: results are double-checked against an upstream */
  probation?: boolean;
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
    id: "webvh",
    name: "did:webvh",
    glyph: "V",
    probation: true,
    desc: "Domain-hosted with a verifiable key history",
    example:
      "did:webvh:Qmb3KLhAKJ9wZx1gTPzcPfCxviRkiEJ4RGdHNviaedGu3i:opsecid.github.io",
  },
  {
    id: "plc",
    name: "did:plc",
    glyph: "L",
    probation: true,
    desc: "AT Protocol / Bluesky ledger identities",
    example: "did:plc:z72i7hdynmk6r22z27h6tvur",
  },
  {
    id: "ebsi",
    name: "did:ebsi",
    glyph: "B",
    probation: true,
    desc: "EU EBSI legal-entity identifiers",
    example: "did:ebsi:zjUnExsyyweQ9p4cy3nvrVc",
  },
  {
    id: "near",
    name: "did:near",
    glyph: "N",
    probation: true,
    desc: "NEAR accounts, named and implicit",
    example: "did:near:registrar.near",
  },
  {
    id: "jwk",
    name: "did:jwk",
    glyph: "J",
    probation: true,
    desc: "Single JSON Web Key, deterministic and offline",
    example:
      "did:jwk:eyJjcnYiOiJQLTI1NiIsImt0eSI6IkVDIiwieCI6ImFjYklRaXVNczNpOF91c3pFakoydHBUdFJNNEVVM3l6OTFQSDZDZEgyVjAiLCJ5IjoiX0tjeUxqOXZXTXB0bm1LdG00NkdxRHo4d2Y3NEk1TEtncmwyR3pIM25TRSJ9",
  },
  {
    id: "cheqd",
    name: "did:cheqd",
    glyph: "C",
    probation: true,
    desc: "cheqd network identity ledger",
    example: "did:cheqd:mainnet:Ps1ysXP2Ae6GBfxNhNQNKN",
  },
  {
    id: "dns",
    name: "did:dns",
    glyph: "D",
    probation: true,
    desc: "Domain keys published as DNS URI records",
    example: "did:dns:danubetech.com",
  },
  {
    id: "ens",
    name: "did:ens",
    glyph: "S",
    probation: true,
    desc: "Ethereum Name Service identities",
    example: "did:ens:vitalik.eth",
  },
  {
    id: "cid",
    name: "did:cid",
    glyph: "I",
    probation: true,
    desc: "Content-addressed Archon identities, chain-verified by ThisDID itself",
    example:
      "did:cid:bagaaieraoqzjgi6537vyu3h3rtetki5g4bk6stzyqplcmwpqgqxp7fewowcq",
  },
  {
    id: "sol",
    name: "did:sol",
    glyph: "A",
    probation: true,
    desc: "Solana on-chain identities, resolved from both sol-did programs",
    example: "did:sol:devnet:2eK2DKs6vdzTEoj842Gfcs6DdtffPpw1iF6JbzQL4TuK",
  },
  {
    id: "iden3",
    name: "did:iden3",
    glyph: "3",
    probation: true,
    desc: "Iden3 identity states, read from the on-chain State contract",
    example: "did:iden3:polygon:amoy:xC8VZLUUfo5p9DWUawReh7QSstmYN6zR7qsQhQCsw",
  },
  {
    id: "polygonid",
    name: "did:polygonid",
    glyph: "G",
    probation: true,
    desc: "Privado ID identities on the same iden3 State-contract engine",
    example:
      "did:polygonid:polygon:main:2q4Q7F7tM1xpwUTgWivb6TgKX3vWirsE3mqymuYjVv",
  },

  {
    id: "hedera",
    name: "did:hedera",
    glyph: "H",
    probation: true,
    desc: "Hedera Consensus Service DID topics, signature-verified",
    example:
      "did:hedera:testnet:zHirM7oP62rzBmw4oSbWZTSeTLzb9zrDTfQa1cdMBWCPp_0.0.7280148",
  },
  {
    id: "xrpl",
    name: "did:xrpl",
    glyph: "X",
    probation: true,
    desc: "Native XLS-40 DIDs, read from the XRP Ledger itself",
    example: "did:xrpl:0:r9BUM9z14j7bLFzQHRfurWNdNKYSABdGtE",
  },
  {
    id: "iota",
    name: "did:iota",
    glyph: "T",
    probation: true,
    desc: "Identity Move objects on IOTA Rebased, unpacked and verified",
    example:
      "did:iota:0x0c6e3b00bfe019452ffee1b5c7f5e6d2e09705cb6a354d22fd853450494a697c",
  },
  {
    id: "dht",
    name: "did:dht",
    glyph: "M",
    probation: true,
    desc: "Ed25519-signed DNS packets in BitTorrent's Mainline DHT",
    example: "did:dht:i9xkp8ddcbcg8jwq54ox699wuzxyifsqx4jru45zodqu453ksz6y",
  },
  {
    id: "tz",
    name: "did:tz",
    glyph: "Z",
    probation: true,
    desc: "Tezos accounts, derived offline with verified key discovery",
    example: "did:tz:tz3cqThj23Feu55KDynm7Vg81mCMpWDgzQZq",
  },
  {
    id: "empe",
    name: "did:empe",
    glyph: "F",
    probation: true,
    desc: "Empeiria EVDI chain documents, protobuf-decoded from RPC",
    example: "did:empe:testnet:006308981b61932c5eaae1c39ace8ee3892f4a1f",
  },
  {
    id: "ion",
    name: "did:ion",
    glyph: "O",
    probation: true,
    desc: "Sidetree DIDs anchored to Bitcoin; long-form verified offline",
    example: "did:ion:EiClkZMDxPKqC9c-umQfTkR8vvZ9JPhl_xLDI9Nfk38w5w",
  },
];

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

/**
 * Method-specific test identifiers used by chip clicks (upstream-routed
 * methods only — locally driven methods render as featured tiles instead).
 *
 * Every value below has been resolution-checked through ThisDID's public API.
 * Most routed-method values originate in the current DIF Universal Resolver
 * test identifier catalog. Methods without a currently resolving test
 * identifier intentionally have no entry and render as disabled chips.
 */
const OVERRIDES: Record<string, string> = {
  indy: "did:indy:sovrin:WRfXPg8dantKVubE3HX8pw",
  btcr2:
    "did:btcr2:k1qypcylxwhf8sykn2dztm6z8lxm43kwkyzf07qmp9jafv3zfntmpwtks9hmnrw",
  ion: "did:ion:EiClkZMDxPKqC9c-umQfTkR8vvZ9JPhl_xLDI9Nfk38w5w",
  v1: "did:v1:test:nym:z6Mkmpe2DyE4NsDiAb58d75hpi1BjqbH6wYMschUkjWDEEuR",
  eosio: "did:eosio:eos:eoscanadacom",
  ccp: "did:ccp:ceNobbK6Me9F5zwyE3MKY88QZLw",
  io: "did:io:0x476c81C27036D05cB5ebfe30ae58C23351a61C4A",
  bba: "did:bba:t:45e6df15dc0a7d91dcccd24fda3b52c3983a214fb0eed0938321c11ec99403cf",
  schema:
    "did:schema:evan-ipfs:json-schema:Qma2beXKwZeiUXcaRaQKwbBV1TqyiJnsMTYExUTdQue43J",
  gatc: "did:gatc:2xtSori9UQZdTqzxrkp7zqKM4Kj5B4C7",
  sol: "did:sol:devnet:2eK2DKs6vdzTEoj842Gfcs6DdtffPpw1iF6JbzQL4TuK",
  meta: "did:meta:0000000000000000000000000000000000000000000000000000000000005e65",
  oyd: "did:oyd:zQmaBZTghndXTgxNwfbdpVLWdFf6faYE4oeuN2zzXdQt1kh",
  everscale:
    "did:everscale:47325e80e3cef5922d3a3583ae5c405ded7bda781cb069f2bc932a6c3d6ec62e",
  dyne: "did:dyne:demo:FFqGYxShyDGAHd4QyLY1KFCSGBb1mBP9sZebEyBM7JPi",
  kscirc: "did:kscirc:k2f2PhnVHabRenKbaKfLMyuxRU94S1HfAwsR2dMHxTqVeEzmPxsd",
  evrc: "did:evrc:issuer:polygon:62eeb90e-eee4-4d31-8927-1075e82b2a74",
  webs: "did:webs:peacekeeper.github.io:did-webs-iiw37-tutorial:EKYGGh-FtAphGmSZbsuBs_t4qpsjYJ2ZqvMKluq9OxmP",
  iden3: "did:iden3:polygon:amoy:xC8VZLUUfo5p9DWUawReh7QSstmYN6zR7qsQhQCsw",
  // archon.technology's own node identity — resolution-verified 2026-08-19
  // via Archon's Gatekeeper API (the only endpoint serving did:cid).
  cid: "did:cid:bagaaieraoqzjgi6537vyu3h3rtetki5g4bk6stzyqplcmwpqgqxp7fewowcq",
  empe: "did:empe:testnet:006308981b61932c5eaae1c39ace8ee3892f4a1f",
  hedera:
    "did:hedera:testnet:zHirM7oP62rzBmw4oSbWZTSeTLzb9zrDTfQa1cdMBWCPp_0.0.7280148",
  nfd: "did:nfd:nfdomains.algo",
  algo: "did:algo:uti7paasilrda3ishy5m7j7lnrx2aivqjwi7zkccgkvlmfd3vpr5pwsz4i",
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
