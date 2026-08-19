# @thisdid/webvh-did-resolver

A `did:webvh` driver for the DIF
[`did-resolver`](https://github.com/decentralized-identity/did-resolver) interface — a **thin
standard wrapper**, not a method implementation. All resolution and verifiable-history validation
is performed by the DIF-resident
[`didwebvh-ts`](https://github.com/decentralized-identity/didwebvh-ts) core, this package's only
runtime dependency.

## What the wrapper adds

1. **The DIF `getResolver()` registry contract** over `didwebvh-ts`'s `resolveDID()` function,
   returning complete DID resolution results (never throwing) and **classifying failures into
   accurate DIF codes** — the core reports every non-404 failure as `invalidDid`, so the wrapper
   distinguishes by problem details: unreachable log → `networkError` (resolvers fail over
   instead of returning 400), unparseable log content → `notFound`, malformed identifiers and
   genuine proof/history verification failures → `invalidDid`.
2. **A default proof verifier.** `didwebvh-ts`'s browser build ships no verifier and fails every
   resolution with "Verifier implementation is required". This package supplies a WebCrypto
   Ed25519 verifier (native in Cloudflare workerd, Node ≥ 20, and browsers); a custom `Verifier`
   can be injected via options.
3. **History metadata mapping** — `created`, `updated`, `versionId`, `deactivated` into
   `didDocumentMetadata`; `versionId`/`versionTime` resolution options pass through.

**Exit criteria (vendoring convention):** retired in favor of the upstream package if
`didwebvh-ts` ships its own DIF registry export (with a default or documented verifier), at which
point consumers switch to that and this wrapper is archived.

## Usage

```ts
import { Resolver } from "did-resolver";
import { getResolver } from "@thisdid/webvh-did-resolver";

const resolver = new Resolver(getResolver());
const result = await resolver.resolve(
  "did:webvh:Qmb3KLhAKJ9wZx1gTPzcPfCxviRkiEJ4RGdHNviaedGu3i:opsecid.github.io",
);
```

## License

Apache-2.0
