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
   accurate DIF codes** — the core reports transport failures as `internalError` or `invalidDid`
   and unusable log content as `invalidDid`, so the wrapper distinguishes by problem details:
   unreachable log, timeout or size limit → `networkError` (resolvers fail over instead of
   returning 400), unparseable log content → `notFound`, refused destinations, malformed
   identifiers and genuine proof/history/document failures → `invalidDid`. A deactivated DID
   resolves to no document with `deactivated: true` and no error, as DID Resolution specifies.
2. **A default proof verifier.** `didwebvh-ts`'s browser build ships no verifier and fails every
   resolution with "Verifier implementation is required". This package supplies a WebCrypto
   Ed25519 verifier (native in Cloudflare workerd, Node ≥ 20, and browsers); a custom `Verifier`
   can be injected via options.
3. **History metadata mapping** — `created`, `updated`, `versionId`, `deactivated` into
   `didDocumentMetadata`; `versionId`/`versionTime` resolution options pass through.
4. **Fetch boundaries** (`src/fetch-policy.ts`): `didwebvh-ts` retrieves the DID log and the
   witness file through whatever `fetch` it is given and reads each body whole. This package
   gives it a bounded one through the core's `fetch` option: `getResolver({ fetchPolicy })`
   enforces a wall-clock timeout covering the body, a streamed byte cap, manual redirects
   re-validated per hop, https only and a private-host policy for every literal host (a positive
   classification, `src/address-policy.ts`), all failing closed — the transport requirements of
   the method's "Resolver Transport Hardening" section. Each resolver builds its own bounded
   fetch, so resolvers with different boundaries coexist in one process.
5. **The connection-level half of the destination policy.** The fetch policy's host check sees
   literal names only; what a name resolves to is decided at the connection, by whoever
   `destinationGuard` names:

   | `destinationGuard` | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Default               |
   | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
   | `"node"`           | the package's connect-time guard: each hostname is resolved once, any answer that is not a globally routable unicast address (IANA special-purpose, transition, multicast and reserved ranges included) refuses the connection, and the socket opens only to the validated addresses, so a name that changes its answer between check and connection (DNS rebinding) cannot reach an internal destination; every redirect hop is a new guarded connection | on Node               |
   | `"platform"`       | the runtime cannot open connections to private destinations (Cloudflare Workers); the ThisDID driver Worker declares it explicitly                                                                                                                                                                                                                                                                                                                        | on Cloudflare Workers |
   | `"caller"`         | the fetch in use enforces the policy at connection time, or runs behind a proxy that does; required whenever you supply your own `fetch`                                                                                                                                                                                                                                                                                                                  | never                 |

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

## Resolution options

`versionId` (the method's `<number>-<entryHash>` form), `versionTime` (an XML
datetime in UTC without fractional seconds, `YYYY-MM-DDTHH:MM:SSZ`, on a real
calendar date) and `versionNumber` (a positive integer) select a historical
version. They are read from the resolution options and from the DID URL query
(`did:webvh:…?versionNumber=2`), which the method requires resolvers to honour;
a selector may appear once, only one may be used at a time, and a value given
both ways must agree. Anything else is `invalidOptions` rather than a
resolution of some other version. `accept` negotiates the representation:
`application/did+json` (context stripped), `application/did+ld+json`
(default), anything else `representationNotSupported`.

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
full reference. Host options are read from the environment; an unset or empty
variable takes its default, the same value the library falls back to
(`FETCH_POLICY_DEFAULTS`). The ThisDID driver Worker reads the same four names
from its wrangler `vars` (set to these defaults in
`src/driver-workers/webvh/wrangler.jsonc`) through the same `optionsFromEnv()`
this package exports — `getResolver({ ...optionsFromEnv(env) })` — and there a
malformed value fails every resolution closed with `internalError`.
`WEBVH_ALLOW_PRIVATE_HOSTS` must stay `0` in any deployment.

| Variable                    | Default           | Effect                                                                                               |
| --------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------- |
| `WEBVH_TIMEOUT_MS`          | `8000`            | wall-clock bound per retrieval in ms, body included (`fetchPolicy.timeoutMs`; positive)              |
| `WEBVH_MAX_RESPONSE_BYTES`  | `4194304` (4 MiB) | largest DID log or witness file accepted (`fetchPolicy.maxResponseBytes`; positive)                  |
| `WEBVH_MAX_REDIRECTS`       | `3`               | redirect hops followed, each re-validated (`fetchPolicy.maxRedirects`; `0` disables)                 |
| `WEBVH_ALLOW_PRIVATE_HOSTS` | `0`               | `1` permits http:// and loopback / private hosts (`fetchPolicy.allowPrivateHosts`; development only) |

A malformed value — not a number, a negative or zero where a positive integer
is required, anything but 1/0 (true/false, yes/no, on/off) for the flag — exits
2 without resolving. [`.dev.vars.example`](.dev.vars.example) lists all four at
their defaults:

```sh
cp .dev.vars.example .dev.vars          # .dev.vars is gitignored
node --env-file=.dev.vars lib/bin.js <did>
```

## License

Apache-2.0
