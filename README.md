# ThisDID

**ThisDID.com** is a [W3C DID Core](https://www.w3.org/TR/did-core/)-conformant
[DIF](https://identity.foundation/) Universal DID Resolver: one endpoint that resolves any
Decentralized Identifier and returns a unified, DID Core- and DIF-conformant resolution result.

A smart **routing engine** matches every DID to the appropriate method driver: **thirteen
methods resolve at the edge** through isolated TypeScript DID Resolver Workers, and the long tail
is routed to redundant upstream Universal Resolvers with failover. Newly added edge drivers run
under a **verification guarantee** — every resolution is double-checked in parallel against a
capable upstream until the driver's live match-rate earns its graduation. A connected **probe
sub-worker** health-checks every route with real canary DID resolutions every minute, feeding the
engine live per-resolver health (surfaced at [`/status`](https://thisdid.com/status)). The same
edge Worker serves the landing SPA and the JSON resolver API from a single origin via content
negotiation.

This repository is a **[Decentralized Identity Foundation (DIF)](https://identity.foundation/)**
project. ThisDID was built and donated to DIF by [GoPlausible](https://goplausible.com), which
continues to maintain it.

### Standards and specifications

ThisDID's resolution behavior, result shape, and interoperability model are based on these
authoritative specifications and projects:

- **[Decentralized Identifiers (DIDs) v1.0](https://www.w3.org/TR/did-core/)** — the latest
  published W3C Recommendation for DID syntax, DID URLs, the DID document data model, verification
  relationships, services, and JSON/JSON-LD representations. The sections on
  [representations](https://www.w3.org/TR/did-core/#representations) and
  [resolution](https://www.w3.org/TR/did-core/#resolution) are directly relevant to ThisDID. The
  [DID Core v1.1 editor's draft](https://w3c.github.io/did/) tracks ongoing work toward the next
  version and is not yet a W3C Recommendation.
- **[DID Resolution v0.3](https://www.w3.org/TR/did-resolution/)** — the latest published W3C
  Working Draft defining DID resolution and DID URL dereferencing algorithms, resolution options,
  resolution metadata, DID document metadata, error handling, result structures, and HTTP(S)
  bindings.
- **[DID Resolution Extensions](https://www.w3.org/TR/did-extensions-resolution/)** — the W3C
  registry for extension parameters and metadata used by DID resolution implementations.
- **[Decentralized Identifier Extensions](https://www.w3.org/TR/did-extensions/)** — the W3C index
  for DID document properties, resolution extensions, and DID methods.
- **[DID Specification Registries](https://www.w3.org/TR/did-spec-registries/)** — the W3C registry
  of known DID ecosystem properties, values, parameters, representations, and DID methods.
- **[DIF Universal Resolver](https://github.com/decentralized-identity/universal-resolver)** — the
  DIF resolver architecture and driver ecosystem behind the interoperable
  `GET /1.0/identifiers/{did}` interface implemented by ThisDID.
- **[DIF `did-resolver`](https://github.com/decentralized-identity/did-resolver)** — the TypeScript
  resolver interface and core implementation embedded in this repository as a maintained
  submodule.

#### DID Core version compatibility

The published interoperability baseline for ThisDID and its resolver routes is
**[DID Core v1.0](https://www.w3.org/TR/did-core/)**. DID Core v1.1 is currently an
**[editor's draft](https://w3c.github.io/did/)**, not a W3C Recommendation. No resolver in the
current routing chain makes an explicit, independently testable claim of full DID Core v1.1 draft
conformance, so the table does not infer such a claim merely from accepting or returning a DID
document that uses draft-compatible properties.

| Resolver route                                                        | DID Core v1.0 | DID Core v1.1 draft | Basis for this classification                                                                                                                                                                                                                                                                                 |
| --------------------------------------------------------------------- | ------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TypeScript DID Resolver**                                           | **Supported** | **Not claimed**     | The DIF [`did-resolver`](https://github.com/decentralized-identity/did-resolver) core used by each isolated driver Worker models the v1 DID context, DID documents, resolution metadata, and the DID Core resolution result. Actual method behavior also depends on its published or vendored method package. |
| **[GoPlausible](https://goplausible.com)**                            | **Supported** | **Not claimed**     | Its public Universal Resolver uses the DIF-compatible [`/api/1.0/identifiers`](https://goplausible.xyz/api/1.0/identifiers) interface and returns DID Core v1 resolution results for the `did:algo` and `did:nfd` routes used here.                                                                           |
| **[Godiddy](https://docs.godiddy.com/apis/universal-resolver/index)** | **Supported** | **Not claimed**     | Godiddy documents a DIF Universal Resolver implementation with DID resolution results and DID document representations; its examples use the DID v1 context. Its documentation does not declare DID Core v1.1 draft conformance.                                                                              |
| **[Archon](https://archon.technology/specs)**                         | **Supported** | **Not claimed**     | Archon documents DID Core-conformant DID documents and metadata plus the Universal Resolver [`/1.0/identifiers/{did}`](https://resolver.archon.technology/1.0/identifiers/did:web:example.com) interface. Its documentation does not declare DID Core v1.1 draft conformance.                                 |

“Not claimed” does not mean that a resolver must reject every document using a feature appearing
in the v1.1 draft. It means that ThisDID has found no provider declaration or conformance evidence
that justifies advertising complete support for that evolving draft. This table should be updated
when DID Core v1.1 reaches a stable W3C publication or a provider publishes a versioned support
statement and corresponding tests.

---

## Architecture

### Two DIF resolver flavors, combined by ThisDID

The DIF resolver ecosystem provides two complementary implementation models. They solve different
deployment problems, and ThisDID deliberately uses both:

| Resolver flavor                        | DIF project                                                                          | How it runs                                                                                                                             | Strength                                                                              | How ThisDID uses it                                                                                                                     |
| -------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Container-based Universal Resolver** | [`universal-resolver`](https://github.com/decentralized-identity/universal-resolver) | A driver-based framework commonly deployed with method drivers in separate containers behind the DIF Universal Resolver HTTP interface. | Broad, language-independent DID method coverage and independently maintained drivers. | ThisDID distributes requests across compatible public Universal Resolver implementations through its smart routing and failover engine. |
| **TypeScript DID Resolver**            | [`did-resolver`](https://github.com/decentralized-identity/did-resolver)             | An embeddable TypeScript resolver core combined directly with compatible JavaScript/TypeScript method packages.                         | Small, application-native integration with no container hop for compatible drivers.   | ThisDID embeds the core in isolated private driver Workers for fast, low-latency edge resolution.                                       |

These are complementary rather than competing resolver designs. The TypeScript path gives ThisDID
a fast embedded resolver for package-backed methods; the container-based ecosystem supplies broad
method coverage through distributed resolver implementations without forcing the mother Worker to
bundle or run every method driver.

```text
                                  ┌────────────────────────────────────┐
                                  │          ThisDID edge API          │
 DID request ──► parse method ──► │ health-aware smart routing engine  │
                                  └──────────────┬─────────────────────┘
                                                 │
                         ┌───────────────────────┴───────────────────────┐
                         │                                               │
                         ▼                                               ▼
      ┌─────────────────────────────────────┐       ┌────────────────────────────────────┐
      │ Embedded TypeScript DID Resolver    │       │ Distributed Universal Resolvers    │
      │                                     │       │                                    │
      │ DIF did-resolver core               │       │ DIF container/driver architecture  │
      │   + selected method package         │       │   across compatible deployments    │
      │   + isolated private Worker         │       │   and independently run providers  │
      │   + private Service Binding         │       │   through the standard HTTP binding│
      └──────────────────┬──────────────────┘       └─────────────────┬──────────────────┘
                         │ first where configured                      │ ordered fallback
                         └───────────────────────┬──────────────────────┘
                                                 ▼
                                  ┌────────────────────────────────────┐
                                  │ Validate requested/document IDs    │
                                  │ Normalize metadata and errors      │
                                  │ Record route attempts and latency  │
                                  └──────────────┬─────────────────────┘
                                                 ▼
                                      DIF DID Resolution Result
```

For every request, the routing registry constructs a method-specific ordered chain. A configured
TypeScript driver normally provides the shortest path. If that driver is unavailable, times out,
or returns no usable DID document, ThisDID can continue through healthy compatible Universal
Resolver deployments. Methods without a TypeScript package can begin directly on the distributed
path. The same validation, timeout policy, result normalization, analytics, and transparent route
metadata apply regardless of which resolver flavor succeeds.

```
┌────────────────────────── thisdid.com (one origin) ──────────────────────────┐
│  Cloudflare Worker  (root: src/, wrangler.jsonc)                              │
│                                                                              │
│   GET /                     Accept: text/html   → landing SPA (via ASSETS)   │
│                             Accept: */json      → API service info           │
│   GET /:did                 Accept: */json      → resolve (deep link)        │
│   GET /1.0/identifiers/:did                      → DIF Universal Resolver     │
│   GET /methods /health /status /openapi.json /docs → discovery + Swagger UI   │
│                                                                              │
│   resolve()  ──►  routing registry (src/resolvers/registry.ts)               │
│                     per-method ordered chain of:                             │
│                     ├─ TypeScript DID Resolver → private Service Bindings    │
│                     ├─ goplausible → goplausible.xyz (upstream, open)        │
│                     ├─ godiddy     → api.godiddy.com (upstream, API key)     │
│                     └─ archon      → resolver.archon.technology (upstream)   │
└──────────────────────────────────────────────────────────────────────────────┘
        ▲ static assets = web/dist (Vite + React + TS SPA, deployable as Pages)
        ▲ vendor/did-resolver = DIF did-resolver core (git submodule)

        DRIVER_WEB   DRIVER_KEY   DRIVER_PKH   DRIVER_PEER   DRIVER_ETHR
        DRIVER_WEBVH   DRIVER_PLC   DRIVER_EBSI   DRIVER_NEAR   DRIVER_JWK
             │            │             │             │
             ▼            ▼             ▼             ▼
        thirteen independently deployed private driver Workers (src/driver-workers/)

┌──────────────── thisdid-probe (probe/, connected sub-worker) ────────────────┐
│  cron `* * * * *`  →  one canary DID resolution round per route every minute │
│  results → D1 `probes` log  +  KV `routing:health:v2` snapshot → GET /status │
│  shares the main Worker's D1 + KV by id · never sits on the request path     │
└──────────────────────────────────────────────────────────────────────────────┘
```

| Path                       | What it is                                                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `src/`                     | The Cloudflare Worker — the ThisDID Resolver API and SPA host.                                                           |
| `src/driver-workers/`      | Private Tier 1 Worker entrypoints; each directly consumes one published resolver package.                                |
| `web/`                     | The landing-page SPA (Vite + React + TypeScript). Builds to `web/dist`.                                                  |
| `vendor/did-resolver`      | DIF [`did-resolver`](https://github.com/GoPlausible/did-resolver) core, pinned as a **git submodule**.                   |
| `vendor/near-did-resolver` | ThisDID-custodied [`near-did-resolver`](vendor/near-did-resolver/README.md) driver package (elliptic-free did:near).     |
| `probe/`                   | The **thisdid-probe** sub-worker — cron-driven resolver health prober feeding the routing engine (own `wrangler.jsonc`). |
| `wrangler.jsonc`           | Worker + static-assets config.                                                                                           |

### Isolated TypeScript driver Workers

The mother Worker does not bundle the thirteen driver packages. Each one is built and
deployed as its own private Cloudflare Worker, with `workers.dev` and preview URLs disabled. The
mother invokes only the selected method Worker through a Service Binding; Cloudflare starts or
reuses that deployed isolate on demand.

| DID method  | Service binding | Private Worker         | Published package                                                           | Resolution model                          | Configuration                                             |
| ----------- | --------------- | ---------------------- | --------------------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------- |
| `did:web`   | `DRIVER_WEB`    | `thisdid-driver-web`   | `web-did-resolver@2.0.32`                                                   | HTTPS DID document                        | None                                                      |
| `did:key`   | `DRIVER_KEY`    | `thisdid-driver-key`   | `key-did-resolver@4.0.0`                                                    | Deterministic, offline                    | None                                                      |
| `did:pkh`   | `DRIVER_PKH`    | `thisdid-driver-pkh`   | `pkh-did-resolver@2.0.0`                                                    | Deterministic CAIP-10                     | None                                                      |
| `did:peer`  | `DRIVER_PEER`   | `thisdid-driver-peer`  | `peer-did-resolver@2.0.0`                                                   | Deterministic, offline                    | None                                                      |
| `did:ethr`  | `DRIVER_ETHR`   | `thisdid-driver-ethr`  | `ethr-did-resolver@14.1.2`                                                  | ERC-1056 via EVM RPC                      | Mainnet/Sepolia RPC Worker secrets                        |
| `did:webvh` | `DRIVER_WEBVH`  | `thisdid-driver-webvh` | `@thisdid/webvh-did-resolver@1.0.0` (vendored wrapper of `didwebvh-ts`)     | Verifiable `did.jsonl` history over HTTPS | None                                                      |
| `did:plc`   | `DRIVER_PLC`    | `thisdid-driver-plc`   | `@thisdid/plc-did-resolver@1.0.0` (vendored wrapper of `@atproto/identity`) | PLC directory over HTTPS                  | `PLC_DIRECTORY_URL` var (default `https://plc.directory`) |
| `did:ebsi`  | `DRIVER_EBSI`   | `thisdid-driver-ebsi`  | `@cef-ebsi/ebsi-did-resolver@4.1.0`                                         | EBSI DID registry API                     | `EBSI_DID_REGISTRY` var (pilot registry)                  |
| `did:jwk`   | `DRIVER_JWK`    | `thisdid-driver-jwk`   | `@thisdid/jwk-did-resolver@1.0.0` (vendored, zero-dep)                      | Deterministic, offline                    | None                                                      |
| `did:cheqd` | `DRIVER_CHEQD`  | `thisdid-driver-cheqd` | `@thisdid/cheqd-did-resolver@1.0.0` (vendored, zero-dep)                    | cheqd's official resolver over HTTPS      | `CHEQD_RESOLVER_URL` var (official default)               |
| `did:dns`   | `DRIVER_DNS`    | `thisdid-driver-dns`   | `@thisdid/dns-did-resolver@1.0.0` (vendored)                                | DNS-over-HTTPS + offline did:key          | `DOH_URL` var (Cloudflare default)                        |
| `did:ens`   | `DRIVER_ENS`    | `thisdid-driver-ens`   | `@thisdid/ens-did-resolver@1.0.0` (vendored, ethers v6)                     | ENS via Ethereum JSON-RPC                 | Mainnet RPC Worker secret                                 |
| `did:near`  | `DRIVER_NEAR`   | `thisdid-driver-near`  | `@thisdid/near-did-resolver@1.0.0` (vendored)                               | NEAR JSON-RPC                             | RPC endpoint vars; optional registry contract vars        |

Every driver Worker registers a DIF `getResolver()` package directly. `webvh`, `plc`, and `near`
consume ThisDID-custodied `@thisdid/*` packages vendored under `vendor/`:
[`@thisdid/webvh-did-resolver`](vendor/webvh-did-resolver/README.md) and
[`@thisdid/plc-did-resolver`](vendor/plc-did-resolver/README.md) are thin DIF standard wrappers —
the method implementations remain `didwebvh-ts` and `@atproto/identity`, their only runtime
dependencies; the wrappers add the registry contract plus required glue (a WebCrypto Ed25519
proof verifier for webvh, a workerd-safe directory fetch for plc).
[`@thisdid/near-did-resolver`](vendor/near-did-resolver/README.md) is a clean-room fetch-native
package replacing `@kaytrust/did-near-resolver`, whose `near-api-js` chain carries the unpatched
elliptic CVE-2025-14505 and a native addon. Per the vendoring convention every vendored package
records its exit criteria back to upstream in its README.

All thirteen Workers use the vendored DIF TypeScript `did-resolver` core and the same versioned
internal request/response contract. The mother retains generic DID validation, timeouts,
returned-document ID validation, health-aware fallback, public metadata, rate limiting, and
analytics. A driver never chooses another provider or records analytics itself.

This separation keeps unrelated cryptographic and blockchain dependency graphs out of the mother
bundle. Driver source is not copied into ThisDID: the Tier 1 entrypoints consume published
packages directly. `vendor/did-resolver/src/drivers/` remains reserved for separately approved
Tier 2 adaptations that do not have a compatible TypeScript package.

### Smart routing

Every DID method is resolved through an **ordered fallback chain** defined in
[`src/resolvers/registry.ts`](src/resolvers/registry.ts). Each step is one of:

- **TypeScript DID Resolver** — resolved by an isolated method Worker through a private Cloudflare
  Service Binding. Waves one and two support `did:web`, `did:key`, `did:pkh`, `did:peer`,
  configured `did:ethr`, `did:webvh`, `did:plc`, `did:ebsi`, `did:near`, `did:jwk`, `did:cheqd`, `did:dns`, and `did:ens`; each Worker uses its
  published (or vendored) package with the vendored `did-resolver` core. See
  [`src/driver-workers/`](src/driver-workers/README.md).
- **`goplausible`** — routed to the [GoPlausible](https://goplausible.com) Universal Resolver
  (`goplausible.xyz/api/1.0/identifiers`), the Algorand-native resolver. Open, no key.
- **`godiddy`** — routed to the [Godiddy](https://godiddy.com) Universal Resolver
  (`api.godiddy.com`, by Danube Tech). **Requires an API key** (`Authorization: Bearer`).
- **`archon`** — routed to the [Archon](https://archon.technology) Universal Resolver
  (`resolver.archon.technology`), which runs the iden3 & did:cid drivers. Open, no key.

The chain is tried top-to-bottom; the first step that returns a usable DID document wins,
otherwise the next step is attempted (or the last error is returned if all fail).

#### Routing flows

```
did:iden3:…                          any other method (did:web, did:indy, …)
────────────                         ──────────────────────────────────────

  ┌─────────┐  hit? ──► return        ┌─────────┐  hit? ──► return
  │ Archon  │                         │  TS DID │
  └────┬────┘                         │Resolver │
       │ miss / error                 └────┬────┘
       ▼                                   │ miss / error
  ┌─────────┐  hit? ──► return             ▼
  │  TS DID │                         ┌─────────┐  hit? ──► return
  │Resolver │                         │ Godiddy │
  └────┬────┘                         └────┬────┘
       │ miss / error                      │ miss / error
       ▼                                   ▼
  ┌─────────┐  hit? ──► return        ┌─────────┐  hit? ──► return
  │ Godiddy │                         │ Archon  │
  └────┬────┘                         └────┬────┘
       │ all miss                          │ all miss
       ▼                                   ▼
   404 notFound                        404 notFound
```

| Method                                                                                            | Chain (in order)                               |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `web`, `key`, `pkh`, `peer`, `ethr`, `webvh`, `plc`, `ebsi`, `near`, `jwk`, `cheqd`, `dns`, `ens` | **TypeScript DID Resolver** → Godiddy → Archon |
| `algo`, `nfd`                                                                                     | **GoPlausible** → Godiddy → Archon             |
| `iden3`, `cid`                                                                                    | **Archon** → TypeScript DID Resolver → Godiddy |
| _all others_                                                                                      | **TypeScript DID Resolver** → Godiddy → Archon |

Only the first row has an implemented local TypeScript driver. For every other advertised method,
the `local` step reports `notConfigured` and the mother continues to its configured upstream
providers. A method in the broader catalog describes a routing policy, not a guarantee that every
upstream deployment can resolve every identifier.

Every response's `didResolutionMetadata` is extended with `route` (`local` for the TypeScript DID
Resolver, or `upstream` for a remote resolver),
`resolver`, `network`, `durationMs`, `via` (the upstream base that answered), and `chain`
(e.g. `local→godiddy→archon`) so clients — and the SPA route banner — can see exactly how a DID
was resolved. Change a method's routing by editing `ROUTE_CHAINS` in the registry.

#### Probation double-checking (new-driver guarantee)

Newly added edge drivers (currently `webvh`, `plc`, `ebsi`, `near`, `jwk`, `cheqd`, `dns`, `ens`) carry a **New · under test**
badge and run under a guarantee mechanism: every edge resolution is executed **in parallel** with
one redundant upstream, and the two documents' security core (document
`id`, the set of public verification keys, deactivation status) is compared in the mother Worker:

- **Core match** → the edge result is served, stamped
  `didResolutionMetadata.verification: { status: "match", provider }` and shown in the UI as a
  bold green **Double-checked by <Provider>** badge (and in the analytics live feed).
- **Core mismatch** (both sides resolved, documents disagree) → the upstream's answer is served
  conservatively, and the disagreement is logged **with both documents** to the D1
  `verification_mismatches` table
  ([`migrations/0003_verification.sql`](migrations/0003_verification.sql)) for adjudication.
- **Upstream cannot answer** — transport failure, unsupported method, or a failed resolution
  (e.g. `notFound`) → the edge result is served unbadged (`status: "unverified"`, reason
  recorded). A verifier with no answer has no opinion to disagree with, and the guarantee never
  becomes a new point of failure.

The verifier is chosen **capability- and health-aware** (`UPSTREAM_METHOD_SUPPORT` in
[`src/resolvers/registry.ts`](src/resolvers/registry.ts)): only an upstream known to resolve the
method, and not currently tripped `down` by the probes, is consulted (e.g. `did:plc` verifies
against Archon — the only upstream that speaks it; `did:jwk` against Godiddy — Archon's jwk
driver is broken). When no capable verifier exists or every capable one is down, the redundant
call is skipped entirely — the edge result is served at full edge latency with the `unverified`
stamp.

Per-method match/mismatch/unverified counts appear on [`/analytics`](https://thisdid.com/analytics)
— they are the graduation criteria: once a method sustains a high match-rate over real traffic,
it is removed from `PROBATION_METHODS` ([`src/methods.ts`](src/methods.ts)) and resolves at pure
edge latency with no redundant upstream call. NEAR implicit accounts are exempt (deterministic,
and unresolvable by upstreams).

#### Resolver health probes (`thisdid-probe`)

The routing engine is fed by a **connected sub-worker** ([`probe/`](probe/)) that pings every
route with **real canary DID resolutions** — not TCP checks — **once per minute**
(cron `* * * * *`). One canary per authoritative route, each bounded by the same 8s timeout as
live traffic: a resolution-verified canary per TypeScript driver (`web`, `key`, `pkh`, `peer`,
`webvh`, `plc`, `ebsi`, `jwk`, `cheqd`, `dns`, and two for `near` — an offline implicit account
plus a live mainnet RPC account; the ens canary is enabled with `ENS_CANARY_DID` once its RPC
secret is configured), `did:algo` + `did:nfd` via GoPlausible, and `did:iden3` via Archon.
**Godiddy is the one exception**: its public resolver API is quota-throttled, so a canary
resolution both burned shared quota and misread a 429 as an outage — the probe instead checks
Godiddy's always-on, unmetered ingress health endpoint (`GODIDDY_HEALTH`,
`api.godiddy.com/health`), sending the same `GODIDDY_API_KEY` bearer token as live resolution
traffic so it is measured on the same authenticated tier. Everywhere else a 429 counts as **up but throttled** (logged as
`rateLimited`), never as a failure. Driver health is tracked per method (`local:web`,
`local:jwk`, …), so one driver's failure never demotes the others. The network-backed ethr
canary is enabled with `ETHR_CANARY_DID` only after approved RPC networks are configured.

Each round is recorded twice:

- **D1 `probes` table** ([`migrations/0002_probes.sql`](migrations/0002_probes.sql)) — the raw
  probe log (30-day retention, pruned hourly), kept **separate from `resolutions`** so probe
  traffic never pollutes user analytics.
- **KV `routing:health:v2` snapshot** — per upstream provider and isolated driver: `status`
  (`up`/`degraded`/`down`), EWMA
  latency, rolling success rate, and a consecutive-failure counter (3 all-failed rounds ≈ 3 min
  trips `down`).

The snapshot + 24h aggregates are public at **`GET /status`**. The probe worker connects to the
main Worker only through the shared D1 + KV namespaces — it never sits on the request path, so
if it stops, resolution is completely unaffected and `/status` simply reports
`configured: false`.

This health data feeds the engine's **rules-based chain planner**: pinned method preferences remain
the baseline, while providers tripped `down` by the probe circuit breaker move behind healthy
routes. Down routes remain as fail-open fallbacks so stale or incorrect health never removes a
resolution path.

---

## Getting started

Requires **Node ≥ 22.12**, npm 11, and a recursive clone:

```bash
git clone --recurse-submodules https://github.com/decentralized-identity/thisdid
# Existing clone:
git submodule update --init --recursive

npm install            # installs the root Worker + web workspace
npm run install:vendor # installs all five pnpm-locked vendored packages
npm run build          # builds the vendored packages + the SPA
npm run drivers:check  # bundles all thirteen isolated drivers without deploying
npm run check          # Worker + web typechecks, all tests, and production builds
```

> Installs are gated through [Socket](https://socket.dev): use `socket npm install`.

The committed `package-lock.json` pins the Worker and web workspace graph — CI's `npm ci` (and
its npm cache key) depend on it. The vendored packages (`did-resolver` and the `@thisdid/*`
drivers) are linked as local runtime dependencies and keep their release/build toolchains isolated
in their own pnpm lockfiles. This prevents library publishing tools from being hoisted into the deployed
application's dependency graph.

### Develop

```bash
npm run dev            # mother Worker + thirteen bound driver Workers + Vite SPA
npm run dev:worker     # mother Worker only (drivers must already be running)
npm run dev:drivers    # thirteen discoverable local driver processes on ports 8791–8803
npm run dev:web        # Vite HMR dev server on http://localhost:5173 (proxies /1.0, /methods to :8787)
```

`npm run dev` already starts the Vite development server. Driver processes use ports 8791–8803
with separate inspector ports, while clients test the complete routing path through the mother API
on port 8787. For local ethr resolution, copy
`src/driver-workers/ethr/.dev.vars.example` to `src/driver-workers/ethr/.dev.vars` and add the full
Alchemy URLs.

### Build & deploy

```bash
npm run build          # → vendor/did-resolver/lib + web/dist
npm run deploy:drivers # deploy thirteen isolated driver Workers first
npm run deploy         # deploy the mother Worker only
npm run deploy:all     # deploy drivers, then probe, then mother Worker
npm run deploy:probe   # deploys the thisdid-probe sub-worker (starts the health cron)
npm run dev:probe      # probe worker locally; trigger: GET /__scheduled?cron=*+*+*+*+*
```

The mother Worker serves `web/dist` through its `ASSETS` binding, so its deployment ships both the
API and SPA. Driver Workers are separate deployments and must exist before the mother Worker is
first deployed with its Service Bindings. On the initial ethr deployment, deploy its Worker first,
add its RPC secrets, and then deploy the probe and mother Worker. Later `deploy:all` runs preserve
the existing secrets. `web/` can also be deployed independently as a Cloudflare **Pages** project
(point it at the Worker with `VITE_API_BASE`).

---

## API

Base: `https://thisdid.com`

| Method | Path                     | Description                                                                                              |
| ------ | ------------------------ | -------------------------------------------------------------------------------------------------------- |
| `GET`  | `/1.0/identifiers/{did}` | Resolve a DID (DIF Universal Resolver HTTP binding).                                                     |
| `GET`  | `/{did}` (Accept: json)  | Resolve via a root deep link.                                                                            |
| `GET`  | `/methods`               | Configured method routes and featured method metadata.                                                   |
| `GET`  | `/health`                | Liveness probe.                                                                                          |
| `GET`  | `/status`                | Per-resolver route health (probe snapshot + 24h aggregates).                                             |
| `GET`  | `/openapi.json`          | OpenAPI 3.1 spec.                                                                                        |
| `GET`  | `/docs`                  | Swagger UI.                                                                                              |
| `POST` | `/mcp`                   | Model Context Protocol endpoint (agentic access).                                                        |
| `GET`  | `/analytics`             | Resolution analytics page (HTML; JSON with `Accept: application/json`). `/dashboard` 301-redirects here. |
| `GET`  | `/data`                  | Analytics aggregates (JSON).                                                                             |
| `GET`  | `/recent`                | Live resolution feed, cursor-paginated (`?before=&limit=`).                                              |

```bash
curl -H 'Accept: application/json' https://thisdid.com/1.0/identifiers/did:web:identity.foundation
```

Errors follow the DIF binding: `invalidDid` → 400, `notFound` → 404, `unsupportedDidMethod` /
`methodNotSupported` → 501, `representationNotSupported` → 406. Upstream error codes are
canonicalized to the published spec's camelCase (providers on the newer problem-details draft
emit uppercase types such as `METHOD_NOT_SUPPORTED`), and failed resolutions carry sanitized
per-step `attempts` diagnostics — including the local drivers' own messages — so the API is
self-diagnosing. Resolution and MCP routes can also return 429 when the Cloudflare edge rate
limiter is configured.

`POST /mcp` requires `Content-Type: application/json` and accepts request bodies up to 64 KiB.
JSON-RPC batch requests are intentionally unsupported; notifications return HTTP 202 with no body.

### MCP (agentic access)

`POST /mcp` is a Model Context Protocol (Streamable-HTTP, JSON-RPC 2.0) endpoint that exposes the
resolver to AI agents / MCP clients as callable tools — point any MCP-compatible agent at
`https://thisdid.com/mcp`:

| Tool                  | Description                                                                  | Args     |
| --------------------- | ---------------------------------------------------------------------------- | -------- |
| `resolve_did`         | Resolve a W3C DID to its DID document with routing & resolution metadata.    | `did`    |
| `list_did_methods`    | List configured DID method routes and featured methods.                      | —        |
| `describe_routing`    | Return the ordered fallback chain (ThisDID / godiddy / archon) for a method. | `method` |
| `get_resolver_health` | Report resolver service status.                                              | —        |

### Analytics (`/analytics`)

Every resolution request is recorded and surfaced at **`/analytics`** (a live, self-refreshing
analytics page; the old `/dashboard` path 301-redirects) with a filterable **`/data`** JSON API. Storage uses **both** Cloudflare stores:

- **D1** (`DB`) — the authoritative event log: one row per resolution, tagged with `provider`
  (`ThisDID`/`GoPlausible`/`godiddy`/`archon`), `resolver`, `route`, `duration_ms`, `country`,
  `method`, and — for probation methods — `verification` / `verified_by`
  ([`migrations/0001_init.sql`](migrations/0001_init.sql)). All aggregates are SQL over it.
- **KV** (`STATS_KV`) — a live lifetime counter plus a short-TTL read-through cache of the unfiltered
  summaries, so the dashboard stays fast and cheap.

The dashboard shows:

- **Metrics** — total / success / failure, success rate, provider count and average latency.
- **Charts** — a requests-over-time **timeline**, a **routed-to pie**, a **by-method bar chart**, a
  **horizontal by-country bar chart**, a **latency-by-provider comparison** (avg / min / max), and a
  full-width **request-activity heatmap** (GitHub-style, daily over the last ~53 weeks).
- **Provider status** — four live tiles for **ThisDID**, **GoPlausible**, **Godiddy**, and
  **Archon**, showing probe status, EWMA latency, success rate, and last probe time. Method-level
  TypeScript driver health is aggregated into the single ThisDID provider tile.
- **Driver verification** — per-probation-method matched / mismatched / unverified counts, the
  graduation signal for new drivers.
- **Leaderboards** — tabbed by **method / routed-to / country / resolver**.
- **Filters** — by **scope** (Hourly / Day / Week / Month / YTD / All time — each with the matching
  bucket granularity), **country** and **method**.
- **Live feed** — recent requests with provider & resolver tags, geo, status, latency, and the
  double-check marker for verified probation resolutions, auto-refreshing, with a
  **"Load older"** button (cursor pagination).

`/data` accepts `?range=`, `?country=` and `?method=`. The feed pages via **`/recent`**
(`?before=<cursor>&limit=<n>` + the same filters), returning `{ recent, nextCursor }`.

Recording is fire-and-forget (`ctx.waitUntil`) and never affects resolution latency or success.
**GDPR-friendly:** no IP addresses, no cookies, no user-agents — only coarse `cf.country`, the
requested DID (the resource, like a URL in a server log) and timing are stored.

**Setup** (once — then paste the ids into `wrangler.jsonc`):

```bash
wrangler d1 create thisdid-analytics                 # → database_id
wrangler kv namespace create STATS_KV                # → id

wrangler d1 migrations apply thisdid-analytics --local    # local dev
wrangler d1 migrations apply thisdid-analytics --remote   # production
```

Until `DB` is bound the dashboard renders a setup notice; resolution keeps working regardless.

### Configuration

Public config lives in `wrangler.jsonc` → `vars`:

| Var                    | Purpose                                                         |
| ---------------------- | --------------------------------------------------------------- |
| `GOPLAUSIBLE_RESOLVER` | GoPlausible Universal Resolver base (DID appended as `/{did}`). |
| `GODIDDY_RESOLVER`     | Godiddy Universal Resolver base (DID appended as `/{did}`).     |
| `ARCHON_RESOLVER`      | Archon Universal Resolver base (DID appended as `/{did}`).      |
| `RESOLVER_LABEL`       | Service label reported by `/health`.                            |

The probe sub-worker keeps its own copy of the three resolver-base vars in
[`probe/wrangler.jsonc`](probe/wrangler.jsonc) (same values). Driver-specific configuration
(`PLC_DIRECTORY_URL`, `EBSI_DID_REGISTRY`, `NEAR_RPC_*`, the ethr RPC secrets) lives on each
driver Worker's own config — see [`src/driver-workers/`](src/driver-workers/README.md).

Godiddy requires an API key, kept as a **secret** (never committed):

```bash
# production
wrangler secret put GODIDDY_API_KEY
wrangler secret put GODIDDY_API_KEY --config probe/wrangler.jsonc   # probe worker's own copy

# local dev — copy the template and fill it in (.dev.vars is gitignored)
cp .dev.vars.example .dev.vars
```

Without a `GODIDDY_API_KEY`, the Godiddy step is skipped (401) and the chain falls through to the
next resolver, so resolution still works for methods Archon or ThisDID can serve.

The mother and probe Workers bind privately to the five services declared in their respective
`services` arrays. Only the ethr driver currently requires method-specific configuration. Store
its full Alchemy URLs as secrets on that Worker:

```bash
npx wrangler secret put ETH_RPC_MAINNET_URL --config src/driver-workers/ethr/wrangler.jsonc
npx wrangler secret put ETH_RPC_SEPOLIA_URL --config src/driver-workers/ethr/wrangler.jsonc
```

See [`src/driver-workers/README.md`](src/driver-workers/README.md) for the schema, package versions,
and driver deployment order.

---

## DIF community and contributions

ThisDID advances the work of the **[DIF Identifiers & Discovery Working
Group](https://identity.foundation/working-groups/identifiers-discovery.html)**, whose scope includes
the creation, resolution, and discovery of decentralized identifiers and names. The Working
Group's active projects include the **[Universal
Resolver](https://github.com/decentralized-identity/universal-resolver)** and its driver-based DID
resolution ecosystem. ThisDID also complements the **[DIF DID Methods Working
Group](https://identity.foundation/working-groups/did-methods.html)** and its work toward
collaborative, interoperable DID method standardization.

We warmly encourage implementers, DID method maintainers, researchers, and users to get involved:

- **[Join DIF](https://identity.foundation/join/)** and participate in the Identifiers & Discovery
  or DID Methods Working Group to begin effective, ongoing technical contributions.
- Contribute resolver drivers, interoperability tests, specifications, documentation, operational
  experience, or code through the **[Universal Resolver
  repository](https://github.com/decentralized-identity/universal-resolver)** and **[ThisDID
  repository](https://github.com/decentralized-identity/thisdid)**.
- Share comments, implementation experience, questions, and constructive opinions through
  **[ThisDID issues](https://github.com/decentralized-identity/thisdid/issues)** or the participation
  channels listed on the **[Identifiers & Discovery Working Group
  page](https://identity.foundation/working-groups/identifiers-discovery.html)**. Early feedback is
  valuable and can become the starting point for an effective contribution.

Explore **[all DIF Working Groups](https://identity.foundation/working-groups/)** to find related
standards and open-source work where your experience can help.

---

## License

MIT [LICENSE](LICENSE).
