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
4. **Fetch boundaries** (from the ThisDID fork of `didwebvh-ts`): `getResolver({ fetchPolicy })`
   bounds every retrieval a resolution performs — the DID log, referenced verification-method
   logs and witness files — with a wall-clock timeout, a streamed byte cap, manual redirects
   re-validated per hop and a private-host policy, all failing closed. The policy travels with
   each resolution (`ResolutionOptions.fetchPolicy` in the fork), so resolvers with different
   boundaries coexist in one process.
5. **The connection-level half of the destination policy.** The core's hostname policy sees
   literal names only; what a name resolves to is decided at the connection, by whoever
   `destinationGuard` names:

   | `destinationGuard` | Meaning                                                                                                                                                                                                                                                                                                                                                                            | Default               |
   | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
   | `"node"`           | the package's connect-time guard: each hostname is resolved once, any answer that is not a globally routable unicast address (IANA special-purpose, transition, multicast and reserved ranges included) refuses the connection, and the socket opens only to the validated addresses, so a name that changes its answer between check and connection (DNS rebinding) cannot reach an internal destination; every redirect hop is a new guarded connection | on Node               |
   | `"platform"`       | the runtime cannot open connections to private destinations (Cloudflare Workers); the ThisDID driver Worker declares it explicitly                                                                                                                                                                                                                                                 | on Cloudflare Workers |
   | `"caller"`         | the fetch in use enforces the policy at connection time, or runs behind a proxy that does; required whenever you supply your own `fetch`                                                                                                                                                                                                                                           | never                 |

   In any other runtime `getResolver()` throws `DestinationGuardError` rather than resolve with
   an unchecked transport: declare the boundary explicitly. The guard itself is exported from
   `@thisdid/webvh-did-resolver/node` as `guardedFetch({ allowPrivateHosts })` for hosts that
   assemble their own transport and then declare `"caller"`.

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

## Command line

The package ships a standalone resolver command, `thisdid-resolve-webvh`, that
needs nothing but Node 20.18.1 or later (the connect-time guard depends on
`undici`, which requires that) — no resolver service, no Worker:

```sh
npx thisdid-resolve-webvh did:webvh:Qmb3KLhAKJ9wZx1gTPzcPfCxviRkiEJ4RGdHNviaedGu3i:opsecid.github.io
# from a checkout: node lib/bin.js <did>
```

It prints the DIF resolution result as JSON on stdout and exits 0 when the
DID resolved, 1 when the resolver reported an error
(`didResolutionMetadata.error`), 2 on a usage or configuration error.
`--version-id <id>` and `--version-time <iso>` are passed through as
resolution options, `--compact` prints single-line JSON, `--help` prints the
full reference. Host options are read from the environment, under the same names the ThisDID
Worker uses, so one `.dev.vars` file drives both:

| Variable                    | Effect                                                                                                |
| --------------------------- | ----------------------------------------------------------------------------------------------------- |
| `WEBVH_TIMEOUT_MS`          | wall-clock bound per retrieval in ms (`fetchPolicy.timeoutMs`, default 8000)                          |
| `WEBVH_MAX_RESPONSE_BYTES`  | largest log or witness file accepted (`fetchPolicy.maxResponseBytes`, default 4 MiB)                  |
| `WEBVH_MAX_REDIRECTS`       | redirect hops followed, each re-validated (`fetchPolicy.maxRedirects`, default 3)                     |
| `WEBVH_ALLOW_PRIVATE_HOSTS` | `1` — permit http:// and loopback / private hosts (`fetchPolicy.allowPrivateHosts`; development only) |

## License

Apache-2.0
