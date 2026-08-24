# @thisdid/near-did-resolver

A `did:near` driver for the DIF
[`did-resolver`](https://github.com/decentralized-identity/did-resolver) interface, implemented
with plain `fetch` against NEAR JSON-RPC. No chain SDK, no native addons — the only runtime
dependency is [`@scure/base`](https://www.npmjs.com/package/@scure/base) (audited, zero-dep) for
byte encoding.

## Why this package exists

`@kaytrust/did-near-resolver` (1.4.12) provides these resolution semantics but depends on
`near-api-js`, whose chain includes the native `secp256k1` addon and `elliptic@6.6.1` — flagged
for **CVE-2025-14505** (nonce truncation in ECDSA signing; low severity, and **no fixed release
exists**). DID resolution never signs anything, so the entire cryptographic chain is dead weight:
resolution is two JSON-RPC queries. This package reimplements the method cleanly for the Workers
runtimes.

**Exit criteria (vendoring convention):** this package is custodial. When upstream publishes a
release free of the elliptic/native-addon chain (e.g. migrated to `@noble/curves`, or with the SDK
dependency dropped), ThisDID returns to consuming the author's package from npm and this one is
retired or handed to the method community.

## Usage

```ts
import { Resolver } from "did-resolver";
import { getResolver } from "@thisdid/near-did-resolver";

const resolver = new Resolver(
  getResolver({
    networks: [
      { networkId: "mainnet", rpcUrl: "https://rpc.mainnet.near.org" },
      {
        networkId: "testnet",
        rpcUrl: "https://rpc.testnet.near.org",
        contractId: "registry.testnet", // only needed for base58 registry identifiers
      },
    ],
    timeoutMs: 6000,
  }),
);
```

## Identifier forms

| Form                                | Example                          | Resolution                                                     |
| ----------------------------------- | -------------------------------- | -------------------------------------------------------------- |
| Named account                       | `did:near:alice.near`            | `view_access_key_list` → full-access `ed25519:` keys           |
| Named account with explicit network | `did:near:testnet:alice.testnet` | Same, against the named network's RPC                          |
| Implicit account (64 hex chars)     | `did:near:98793c…bd6de`          | Deterministic, offline — the identifier is the ed25519 key     |
| Registry identifier (44–50 base58)  | `did:near:3J98t1Wp…`             | `identity_owner` view call on the configured registry contract |

Network selection: an explicit `did:near:<network>:<id>` segment wins; otherwise `.near` implies
`mainnet` and `.testnet` implies `testnet`; otherwise the first configured network is used.
`near` is accepted as an alias of `mainnet`.

## Deliberate deviations from `@kaytrust/did-near-resolver`

1. **DIF error results instead of throws** — `invalidDid`, `notFound`, `notConfigured`,
   `internalError`.
2. **Unique verification method ids** — upstream assigns every key the same `#owner` id, which
   violates DID Core's id-uniqueness for multi-key accounts. Here the first key is `#owner` and
   subsequent keys are `#owner-2`, `#owner-3`, …, all referenced from `authentication` and
   `assertionMethod`.
3. **ed25519 keys only** — upstream emits every full-access key (including `secp256k1:`) as
   `Ed25519VerificationKey2018`; this driver only maps `ed25519:` keys to that type.
4. **Implicit accounts supported** — upstream rejects them; here they resolve deterministically
   (and offline), like `did:key`.
5. **Bounded I/O** — per-request timeout (`AbortSignal.timeout`) and a response size cap.

## License

Apache-2.0
