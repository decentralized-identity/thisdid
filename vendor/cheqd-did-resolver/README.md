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


## Command line

The package ships a standalone resolver command, `thisdid-resolve-cheqd`, that
needs nothing but Node 20+ — no resolver service, no Worker:

```sh
npx thisdid-resolve-cheqd did:cheqd:mainnet:Ps1ysXP2Ae6GBfxNhNQNKN
# from a checkout: node lib/bin.js <did>
```

It prints the DIF resolution result as JSON on stdout and exits 0 when the
DID resolved, 1 when the resolver reported an error
(`didResolutionMetadata.error`), 2 on a usage or configuration error.
`--version-id <id>` and `--version-time <iso>` are passed through as
resolution options, `--compact` prints single-line JSON, `--help` prints the
full reference. Host options are read from the environment, under the same names the ThisDID
Worker uses, so one `.dev.vars` file drives both:

| Variable | Effect |
| --- | --- |
| `CHEQD_RESOLVER_URL` | base URL of a cheqd DID Resolver (`resolverUrl`; default: the official deployment) |
| `CHEQD_TIMEOUT_MS` | per-request bound in ms (`timeoutMs`, default 6000) |

## License

Apache-2.0
