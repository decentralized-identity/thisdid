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

## License

Apache-2.0
