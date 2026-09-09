# @thisdid/peer-did-resolver

did:peer driver for the DIF
[`did-resolver`](https://github.com/decentralized-identity/did-resolver)
interface. The method implementation is Veramo's
[`peer-did-resolver`](https://github.com/veramolabs/peer-did-resolver) DIF
adapter over the aviarytech [`did-peer`](https://github.com/aviarytech/did-peer)
core (numalgo 0, 1 and 2). Both are consumed from ThisDID-custodied forks —
[`vendor/forks/peer-did-resolver`](../forks/peer-did-resolver) pinned to
2.0.0 and [`vendor/forks/did-peer`](../forks/did-peer) pinned to the 0.0.22
release — rather than from the npm registry, so every line that resolves a
did:peer in ThisDID can be read, audited and patched in this repository. This
package is the single import the ThisDID Worker and the command-line resolver
share.

```ts
import { Resolver } from "did-resolver";
import { getResolver } from "@thisdid/peer-did-resolver";

const resolver = new Resolver(getResolver());
const result = await resolver.resolve(
  "did:peer:0z6MkqRYqQiSgvZQdnBytw86Qbs2ZWUkGv22od935YF4s8M7V",
);
```

did:peer needs no configuration and no network access: the identifier
encodes its own document.

## Command line

The package ships a standalone resolver command, `thisdid-resolve-peer`, that
needs nothing but Node 20+ — no resolver service, no Worker:

```sh
npx thisdid-resolve-peer did:peer:0z6MkqRYqQiSgvZQdnBytw86Qbs2ZWUkGv22od935YF4s8M7V
# from a checkout: node lib/bin.js <did>
```

It prints the DIF resolution result as JSON on stdout and exits 0 when the
DID resolved, 1 when the resolver reported an error
(`didResolutionMetadata.error`), 2 on a usage error. `--version-id <id>` and
`--version-time <iso>` are passed through as resolution options, `--compact`
prints single-line JSON, `--help` prints the full reference. There are no
environment variables for this method.

## Development

```sh
pnpm install
pnpm run build   # tsc → lib/
pnpm test        # fully offline
```

The forks must be built first (`pnpm run build` in `vendor/forks/did-peer`,
then in `vendor/forks/peer-did-resolver`); the root `npm run build:vendor`
does that in order.
