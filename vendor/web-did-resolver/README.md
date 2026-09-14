# @thisdid/web-did-resolver

did:web driver for the DIF
[`did-resolver`](https://github.com/decentralized-identity/did-resolver)
interface. The method implementation is the DIF
[`web-did-resolver`](https://github.com/decentralized-identity/web-did-resolver)
core — consumed from the ThisDID-custodied fork under
[`vendor/forks/web-did-resolver`](../forks/web-did-resolver), pinned to the
2.0.32 release, rather than from the npm registry — so every line that
resolves a did:web in ThisDID can be read, audited and patched in this
repository. This package is the single import the ThisDID Worker and the
command-line resolver share.

```ts
import { Resolver } from "did-resolver";
import { getResolver } from "@thisdid/web-did-resolver";

const resolver = new Resolver(getResolver());
const result = await resolver.resolve("did:web:identity.foundation");
```

The identifier names the HTTPS origin its document is fetched from
(`https://<domain>/.well-known/did.json`, or the path form
`https://<domain>/<path>/did.json`). The fork adds fetch boundaries the upstream
lacks — a wall-clock timeout, a bounded body, manual redirect handling with
re-validation of every hop, and rejection of every literal host that is not
a globally routable unicast address (a positive classification: loopback,
private, shared/CGNAT, link-local, benchmarking, documentation, multicast,
reserved and the IPv6 transition prefixes are all refused) — all failing
closed by default and overridable through
`getResolver({ timeoutMs, maxResponseBytes, maxRedirects, allowPrivateHosts, fetch })`.

The retrieved JSON must also be a DID document, not merely one whose `id`
matches: the fork validates it against the DID Core data model and reports a
structural violation as `invalidDidDocument` (an `id` mismatch stays
`notFound`). The checks are structural, so a syntactically valid service
endpoint URI is accepted whatever its scheme — apply your own policy before
dereferencing one.

The hostname policy is the first of two layers: it sees literal names only.
What a name resolves to is decided at the connection, by whoever
`destinationGuard` names:

| `destinationGuard` | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Default               |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `"node"`           | the package's connect-time guard: each hostname is resolved once, any answer that is not a globally routable unicast address (IANA special-purpose, transition, multicast and reserved ranges included) refuses the connection, and the socket opens only to the validated addresses, so a name that changes its answer between check and connection (DNS rebinding) cannot reach an internal destination; every redirect hop is a new guarded connection | on Node               |
| `"platform"`       | the runtime cannot open connections to private destinations (Cloudflare Workers); the ThisDID driver Worker declares it explicitly                                                                                                                                                                                                                                                                                                                        | on Cloudflare Workers |
| `"caller"`         | the fetch in use enforces the policy at connection time, or runs behind a proxy that does; required whenever you supply your own `fetch`                                                                                                                                                                                                                                                                                                                  | never                 |

In any other runtime `getResolver()` throws `DestinationGuardError` rather
than resolve with an unchecked transport: declare the boundary explicitly. The
guard itself is exported from `@thisdid/web-did-resolver/node` as
`guardedFetch({ allowPrivateHosts })` for hosts that assemble their own
transport and then declare `"caller"`.

## Representation

`accept` is honoured: `application/did+json` returns the document without its
JSON-LD context, `application/did+ld+json` returns it with the DID Core
context (added when the hosted document is plain JSON, as DID Core's
production rule defines), and any other value is `representationNotSupported`.
Without `accept` the driver reports the representation the host served.

## Command line

The package ships a standalone resolver command, `thisdid-resolve-web`, that
needs nothing but Node 20.18.1 or later (the connect-time guard depends on
`undici`, which requires that) — no resolver service, no Worker:

```sh
npx thisdid-resolve-web did:web:localhost%3A8443
# from a checkout: node lib/bin.js <did>
```

It prints the DIF resolution result as JSON on stdout and exits 0 when the
DID resolved, 1 when the resolver reported an error
(`didResolutionMetadata.error`), 2 on a usage or configuration error.
`--version-id <id>` and `--version-time <iso>` are passed through as
resolution options, `--compact` prints single-line JSON, `--help` prints the
full reference. Host options are read from the environment, under the same names the ThisDID
Worker uses, so one `.dev.vars` file drives both:

| Variable                  | Effect                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------ |
| `WEB_TIMEOUT_MS`          | wall-clock bound per resolution in ms (`timeoutMs`, default 6000)                          |
| `WEB_MAX_RESPONSE_BYTES`  | largest DID document accepted (`maxResponseBytes`, default 1 MiB)                          |
| `WEB_MAX_REDIRECTS`       | https redirect hops followed, each re-validated (`maxRedirects`, default 3)                |
| `WEB_ALLOW_PRIVATE_HOSTS` | `1` — permit loopback / private / link-local hosts (`allowPrivateHosts`; development only) |

## Development

```sh
pnpm install
pnpm run build      # tsc → lib/
pnpm test           # offline suite
pnpm run test:live  # + resolves the DIF canary over the network (WEB_LIVE=1)
```

The fork must be built first (`pnpm run build` in
`vendor/forks/web-did-resolver`); the root `npm run build:vendor` does that in
order.
