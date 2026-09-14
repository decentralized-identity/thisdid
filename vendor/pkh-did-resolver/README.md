# @thisdid/pkh-did-resolver

did:pkh driver for the DIF
[`did-resolver`](https://github.com/decentralized-identity/did-resolver)
interface. The method implementation is Ceramic's
[`pkh-did-resolver`](https://github.com/ceramicnetwork/js-did) (2.0.0) — consumed from the
ThisDID-custodied fork under [`vendor/forks/js-did`](../forks/js-did), whose
`thisdid` branch keeps only this package and its sibling in the workspace,
rather than from the npm registry — so every line that resolves a did:pkh in
ThisDID can be read, audited and patched in this repository. This package is
the single import the ThisDID Worker and the command-line resolver share.

```ts
import { Resolver } from "did-resolver";
import { getResolver } from "@thisdid/pkh-did-resolver";

const resolver = new Resolver(getResolver());
const result = await resolver.resolve(
  "did:pkh:eip155:1:0xab16a96d359ec26a11e2c2b3d8f8b8942d5bfcdb",
);
```

did:pkh needs no configuration and no network access: the identifier encodes
its own document.

## Namespaces

eip155, bip122, tezos and solana — the networks in the did:pkh specification's
Networks table. Every account is validated against its CAIP-10 namespace
profile before a document is produced (hex address and EIP-55 checksum,
base58check or bech32 with a decoded witness program, Tezos base58check with
the method type chosen by prefix, an on-curve Ed25519 key for Solana); anything
else — including Arweave, which has a test vector but no Networks row — is
`invalidDid`.

## Command line

The package ships a standalone resolver command, `thisdid-resolve-pkh`, that
needs nothing but Node 20+ — no resolver service, no Worker:

```sh
npx thisdid-resolve-pkh did:pkh:eip155:1:0xab16a96d359ec26a11e2c2b3d8f8b8942d5bfcdb
# from a checkout: node lib/bin.js <did>
```

It prints the DIF resolution result as JSON on stdout and exits 0 when the
DID resolved, 1 when the resolver reported an error
(`didResolutionMetadata.error`), 2 on a usage error.
`--version-id <id>` and `--version-time <iso>` are passed through as
resolution options, `--compact` prints single-line JSON, `--help` prints the
full reference. There are no environment variables for this method.

## Development

```sh
pnpm install
pnpm run build   # tsc → lib/
pnpm test        # fully offline
```

The fork must be built first (`pnpm -r run build` in `vendor/forks/js-did`);
the root `npm run build:vendor` does that in order.
