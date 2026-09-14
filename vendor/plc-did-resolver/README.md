# @thisdid/plc-did-resolver

A `did:plc` driver for the DIF
[`did-resolver`](https://github.com/decentralized-identity/did-resolver) interface — a **thin
standard wrapper**, not a method implementation. All resolution and document validation is
performed by Bluesky's fetch-native
[`@atproto/identity`](https://www.npmjs.com/package/@atproto/identity), this package's only
runtime dependency.

## What the wrapper adds

1. **The DIF `getResolver()` registry contract** over `DidPlcResolver`, returning complete DID
   resolution results and mapping the package's error classes to DIF codes
   (`PoorlyFormattedDidError` → `invalidDid`, `PoorlyFormattedDidDocumentError` →
   `invalidDidDocument`, directory 404 → `notFound`).
2. **A workerd-compatible directory fetch.** Upstream fetches with `redirect: "error"`, which
   Cloudflare workerd's fetch does not implement (only `follow`/`manual`) — every resolution
   fails instantly on Workers. The wrapper overrides only `resolveNoCheck` with
   `redirect: "manual"`, treating any redirect as a failure: the same security posture, runnable
   everywhere. Document validation stays with the package.
3. **Configuration** — `directoryUrl` (default `https://plc.directory`, the method's canonical
   public directory) and `timeoutMs` (default 6000).

**Exit criteria (vendoring convention):** retired in favor of upstream if `@atproto/identity`
gains a DIF registry export and workerd-compatible fetch behavior (an upstream fix for the
`redirect: "error"` incompatibility is the smaller ask and removes item 2).

## Usage

```ts
import { Resolver } from "did-resolver";
import { getResolver } from "@thisdid/plc-did-resolver";

const resolver = new Resolver(
  getResolver({ directoryUrl: "https://plc.directory" }),
);
const result = await resolver.resolve("did:plc:z72i7hdynmk6r22z27h6tvur");
```

The wrapper also validates what the upstream package does not on its resolution
path: the `did:plc` identifier (24 base32 characters) before the directory is
contacted, and the returned document against the DID Core data model plus the
did:plc profile. A malformed identifier is `invalidDid`; a malformed document
is `invalidDidDocument`.

The document validation is complete for the did:plc profile: every
verification method must carry exactly one material property and it must be a
`publicKeyMultibase` of a key type the directory publishes (secp256k1 or
P-256), of the right length and on the curve; the JSON-LD `@context` is
required and must start with the DID Core context. `accept` is honoured
(`application/did+json` strips the context, `application/did+ld+json` keeps
it, anything else is `representationNotSupported`).

## Command line

The package ships a standalone resolver command, `thisdid-resolve-plc`, that
needs nothing but Node 20+ — no resolver service, no Worker:

```sh
npx thisdid-resolve-plc did:plc:z72i7hdynmk6r22z27h6tvur
# from a checkout: node lib/bin.js <did>
```

It prints the DIF resolution result as JSON on stdout and exits 0 when the
DID resolved, 1 when the resolver reported an error
(`didResolutionMetadata.error`), 2 on a usage or configuration error.
`--version-id <id>` and `--version-time <iso>` are passed through as
resolution options, `--compact` prints single-line JSON, `--help` prints the
full reference. Host options are read from the environment, under the same names the ThisDID
Worker uses, so one `.dev.vars` file drives both:

| Variable            | Effect                                                                   |
| ------------------- | ------------------------------------------------------------------------ |
| `PLC_DIRECTORY_URL` | PLC directory base URL (`directoryUrl`; default `https://plc.directory`) |
| `PLC_TIMEOUT_MS`    | per-request bound in ms (`timeoutMs`, default 6000)                      |

## License

Apache-2.0
