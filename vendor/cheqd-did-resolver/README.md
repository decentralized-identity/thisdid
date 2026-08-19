# @thisdid/cheqd-did-resolver

A `did:cheqd` driver for the DIF
[`did-resolver`](https://github.com/decentralized-identity/did-resolver) interface — an HTTP
driver against **cheqd's official DID Resolver** (the Go implementation operated by the cheqd
network at `resolver.cheqd.net`), the authoritative source for the method. Zero runtime
dependencies.

The cheqd resolver itself implements the W3C DID Resolution specification; this driver adds the
DIF registry contract, bounded I/O (timeout + response size cap), returned-document id
validation, and DIF camelCase error canonicalization.

**Exit criteria (vendoring convention):** retired if cheqd publishes a maintained TypeScript DIF
driver package (their current TS SDK is a Veramo plugin, not a standalone driver).

## Usage

```ts
import { Resolver } from "did-resolver";
import { getResolver } from "@thisdid/cheqd-did-resolver";

const resolver = new Resolver(
  getResolver({ resolverUrl: "https://resolver.cheqd.net/1.0/identifiers" }),
);
const result = await resolver.resolve("did:cheqd:mainnet:Ps1ysXP2Ae6GBfxNhNQNKN");
```

Options: `resolverUrl` (defaults to the official deployment), `timeoutMs` (default 6000).

## License

Apache-2.0
