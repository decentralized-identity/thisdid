# ThisDID

**ThisDID.com** is a [W3C DID Core](https://www.w3.org/TR/did-core/)-conformant
[DIF](https://identity.foundation/) Universal DID Resolver: one endpoint that resolves any
Decentralized Identifier and returns a unified, DID Core- and DIF-conformant resolution result.

A smart **routing engine** matches every DID to the appropriate method driver: **twenty-four
methods resolve inside ThisDID itself** through isolated TypeScript DID Resolver Workers, and the long tail
is routed to redundant upstream Universal Resolvers with failover. Newly added TS Universal Resolver drivers run
under a **verification guarantee** — wherever an independent upstream can resolve the method,
every resolution is double-checked in parallel against it until the driver's live match-rate
earns its graduation (methods no upstream serves are honestly stamped `unverified`). A connected **probe
sub-worker** health-checks every route with real canary DID resolutions every five minutes, feeding the
engine live per-resolver health (surfaced at [`/status`](https://thisdid.com/status)). The same
gateway Worker serves the landing SPA and the JSON resolver API from a single origin via content
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
| **TypeScript DID Resolver**            | [`did-resolver`](https://github.com/decentralized-identity/did-resolver)             | An embeddable TypeScript resolver core combined directly with compatible JavaScript/TypeScript method packages.                         | Small, application-native integration with no container hop for compatible drivers.   | ThisDID embeds the core in isolated private driver Workers for fast, low-latency in-gateway resolution.                                 |

These are complementary rather than competing resolver designs. The TypeScript path gives ThisDID
a fast embedded resolver for package-backed methods; the container-based ecosystem supplies broad
method coverage through distributed resolver implementations without forcing the mother Worker to
bundle or run every method driver.

```text
                                  ┌────────────────────────────────────┐
                                  │         ThisDID gateway API        │
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
        … (abbreviated — 24 bindings total, one per driver in the table below)
             │            │             │             │
             ▼            ▼             ▼             ▼
        twenty-four independently deployed private driver Workers (src/driver-workers/)

┌──────────────── thisdid-probe (probe/, connected sub-worker) ────────────────┐
│  cron `*/5 * * * *` →  one canary DID resolution round per route every 5 min │
│  results → D1 `probes` log  +  KV `routing:health:v2` snapshot → GET /status │
│  shares the main Worker's D1 + KV by id · never sits on the request path     │
└──────────────────────────────────────────────────────────────────────────────┘
```

| Path                    | What it is                                                                                                                                                                                                                                                                                                                  |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/`                  | The Cloudflare Worker — the ThisDID Resolver API and SPA host.                                                                                                                                                                                                                                                              |
| `src/driver-workers/`   | Private Tier 1 Worker entrypoints; each directly consumes one published or vendored resolver package.                                                                                                                                                                                                                       |
| `web/`                  | The landing-page SPA (Vite + React + TypeScript). Builds to `web/dist`.                                                                                                                                                                                                                                                     |
| `vendor/did-resolver`   | DIF [`did-resolver`](https://github.com/GoPlausible/did-resolver) core, pinned as a **git submodule**.                                                                                                                                                                                                                      |
| `vendor/*-did-resolver` | ThisDID-custodied `@thisdid/*` driver packages (webvh, plc, near, jwk, cheqd, dns, ens, cid, ion, sol, iden3, hedera, xrpl, iota, empe, dht, tz); each documents its trust model and exit criteria in its own README.                                                                                                       |
| `probe/`                | The **thisdid-probe** sub-worker — cron-driven resolver health prober feeding the routing engine (own `wrangler.jsonc`).                                                                                                                                                                                                    |
| `directory/`            | The **thisdid-directory** worker — the public DID method directory at [thisdid.com/directory](https://thisdid.com/directory): curated per-method research + live measured scores from the shared analytics, with a daily DIF registry sync (Universal Resolver compose catalog + DID Methods WG recommended/endorsed sets). |
| `wrangler.jsonc`        | Worker + static-assets config.                                                                                                                                                                                                                                                                                              |

### Isolated TypeScript driver Workers

The mother Worker does not bundle the twenty-four driver packages. Each one is built and
deployed as its own private Cloudflare Worker, with `workers.dev` and preview URLs disabled. The
mother invokes only the selected method Worker through a Service Binding; Cloudflare starts or
reuses that deployed isolate on demand.

| DID method      | Service binding    | Private Worker             | Resolver package                                                            | Resolution model                                                                                       | Configuration                                                  |
| --------------- | ------------------ | -------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| `did:web`       | `DRIVER_WEB`       | `thisdid-driver-web`       | `web-did-resolver@2.0.32`                                                   | HTTPS DID document                                                                                     | None                                                           |
| `did:key`       | `DRIVER_KEY`       | `thisdid-driver-key`       | `key-did-resolver@4.0.0`                                                    | Deterministic, offline                                                                                 | None                                                           |
| `did:pkh`       | `DRIVER_PKH`       | `thisdid-driver-pkh`       | `pkh-did-resolver@2.0.0`                                                    | Deterministic CAIP-10                                                                                  | None                                                           |
| `did:peer`      | `DRIVER_PEER`      | `thisdid-driver-peer`      | `peer-did-resolver@2.0.0`                                                   | Deterministic, offline                                                                                 | None                                                           |
| `did:ethr`      | `DRIVER_ETHR`      | `thisdid-driver-ethr`      | `ethr-did-resolver@14.1.2`                                                  | ERC-1056 via EVM RPC                                                                                   | Mainnet/Sepolia RPC Worker secrets                             |
| `did:webvh`     | `DRIVER_WEBVH`     | `thisdid-driver-webvh`     | `@thisdid/webvh-did-resolver@1.0.0` (vendored wrapper of `didwebvh-ts`)     | Verifiable `did.jsonl` history over HTTPS                                                              | None                                                           |
| `did:plc`       | `DRIVER_PLC`       | `thisdid-driver-plc`       | `@thisdid/plc-did-resolver@1.0.0` (vendored wrapper of `@atproto/identity`) | PLC directory over HTTPS                                                                               | `PLC_DIRECTORY_URL` var (default `https://plc.directory`)      |
| `did:ebsi`      | `DRIVER_EBSI`      | `thisdid-driver-ebsi`      | `@cef-ebsi/ebsi-did-resolver@4.1.0`                                         | EBSI DID registry API                                                                                  | `EBSI_DID_REGISTRY` var (pilot registry)                       |
| `did:jwk`       | `DRIVER_JWK`       | `thisdid-driver-jwk`       | `@thisdid/jwk-did-resolver@1.0.0` (vendored, zero-dep)                      | Deterministic, offline                                                                                 | None                                                           |
| `did:cheqd`     | `DRIVER_CHEQD`     | `thisdid-driver-cheqd`     | `@thisdid/cheqd-did-resolver@1.0.0` (vendored, zero-dep)                    | cheqd's official resolver over HTTPS                                                                   | `CHEQD_RESOLVER_URL` var (official default)                    |
| `did:dns`       | `DRIVER_DNS`       | `thisdid-driver-dns`       | `@thisdid/dns-did-resolver@1.0.0` (vendored)                                | DNS-over-HTTPS + offline did:key                                                                       | `DOH_URL` var (Cloudflare default)                             |
| `did:ens`       | `DRIVER_ENS`       | `thisdid-driver-ens`       | `@thisdid/ens-did-resolver@1.0.0` (vendored, ethers v6)                     | ENS via Ethereum JSON-RPC                                                                              | Mainnet RPC Worker secret                                      |
| `did:near`      | `DRIVER_NEAR`      | `thisdid-driver-near`      | `@thisdid/near-did-resolver@1.0.0` (vendored)                               | NEAR JSON-RPC                                                                                          | RPC endpoint vars; optional registry contract vars             |
| `did:cid`       | `DRIVER_CID`       | `thisdid-driver-cid`       | `@thisdid/cid-did-resolver@1.0.0` (vendored, chain-verifying)               | Archon Gatekeeper event chain, every operation signature re-verified by ThisDID itself                 | `CID_GATEKEEPER_URL` var (Archon default)                      |
| `did:sol`       | `DRIVER_SOL`       | `thisdid-driver-sol`       | `@thisdid/sol-did-resolver@1.0.0` (vendored, clean-room)                    | Both sol-did programs in one Solana RPC round-trip; generative fallback                                | `SOL_RPC_{MAINNET,DEVNET,TESTNET}_URL` secrets                 |
| `did:iden3`     | `DRIVER_IDEN3`     | `thisdid-driver-iden3`     | `@thisdid/iden3-did-resolver@1.0.0` (vendored, clean-room)                  | iden3 State contract over EVM RPC (`eth_call`)                                                         | `IDEN3_RPC_POLYGON_{MAIN,AMOY}_URL` secrets                    |
| `did:polygonid` | `DRIVER_POLYGONID` | `thisdid-driver-polygonid` | same `@thisdid/iden3-did-resolver` (ID type-byte enforced)                  | Privado ID on the same State-contract engine                                                           | `POLYGONID_RPC_POLYGON_{MAIN,AMOY}_URL` secrets                |
| `did:hedera`    | `DRIVER_HEDERA`    | `thisdid-driver-hedera`    | `@thisdid/hedera-did-resolver@1.0.0` (vendored, clean-room)                 | HCS topic events via public mirror REST — every message Ed25519-verified; bounded, fail-closed history | Keyless; optional `HEDERA_MIRROR_{MAINNET,TESTNET}_URL` vars   |
| `did:xrpl`      | `DRIVER_XRPL`      | `thisdid-driver-xrpl`      | `@thisdid/xrpl-did-resolver@1.0.0` (vendored, clean-room)                   | Native XLS-40 `DID` ledger entries via one `ledger_entry` call; authored documents usability-validated | Keyless; optional `XRPL_RPC_{MAINNET,TESTNET,DEVNET}_URL` vars |
| `did:iota`      | `DRIVER_IOTA`      | `thisdid-driver-iota`      | `@thisdid/iota-did-resolver@1.0.0` (vendored, clean-room)                   | Identity Move objects via one `iota_getObject` call, chain-identifier-asserted, unpacked offline       | Keyless; optional `IOTA_RPC_{MAINNET,TESTNET,DEVNET}_URL` vars |
| `did:empe`      | `DRIVER_EMPE`      | `thisdid-driver-empe`      | `@thisdid/empe-did-resolver@1.0.0` (vendored, clean-room)                   | Empeiria `x/diddoc` via one GET `abci_query`, protobuf-decoded offline (no public mainnet yet)         | Keyless; `EMPE_RPC_{MAINNET,TESTNET}_URL` vars                 |
| `did:dht`       | `DRIVER_DHT`       | `thisdid-driver-dht`       | `@thisdid/dht-did-resolver@1.0.0` (vendored, clean-room)                    | BEP44-signed DNS packets via a Pkarr relay — every payload Ed25519-verified against the DID's own key  | Keyless; optional `DHT_RELAY_URLS` var                         |
| `did:tz`        | `DRIVER_TZ`        | `thisdid-driver-tz`        | `@thisdid/tz-did-resolver@1.0.0` (vendored, clean-room)                     | Tezos layer-1 derivation, offline; revealed keys included only after BLAKE2b re-derivation via TzKT    | Keyless; optional `TZ_TZKT_{MAINNET,SHADOWNET}_URL` vars       |
| `did:ion`       | `DRIVER_ION`       | `thisdid-driver-ion`       | `@thisdid/ion-did-resolver@1.0.0` (vendored, clean-room)                    | Long-form Sidetree DIDs fully verified offline; short-form `notConfigured` (no public ION node exists) | Optional `ION_RESOLUTION_ENDPOINT` var (deliberately unset)    |

Every driver Worker registers a DIF `getResolver()` package directly, and the ThisDID-custodied
`@thisdid/*` packages live vendored under `vendor/`. Two families:

- **Wrappers** — [`@thisdid/webvh-did-resolver`](vendor/webvh-did-resolver/README.md) and
  [`@thisdid/plc-did-resolver`](vendor/plc-did-resolver/README.md) are thin DIF standard
  wrappers: the method implementations remain `didwebvh-ts` and `@atproto/identity`, their only
  runtime dependencies; the wrappers add the registry contract plus required glue (a WebCrypto
  Ed25519 proof verifier for webvh, a workerd-safe directory fetch for plc).
- **Clean-room implementations** — built where no workerd-compatible package exists or the
  existing one is unsafe: [`@thisdid/near-did-resolver`](vendor/near-did-resolver/README.md)
  (replacing a dependency chain carrying the unpatched elliptic CVE-2025-14505 and a native
  addon), [`@thisdid/cid-did-resolver`](vendor/cid-did-resolver/README.md) (a resolution-only
  Gatekeeper that re-verifies the full signed operation chain instead of trusting the courier),
  [`@thisdid/sol-did-resolver`](vendor/sol-did-resolver/README.md) (both on-chain sol-did
  programs, no Anchor/web3.js), [`@thisdid/iden3-did-resolver`](vendor/iden3-did-resolver/README.md)
  (direct State-contract reads serving both `iden3` and `polygonid`, replacing a 21 MB SDK
  path), [`@thisdid/hedera-did-resolver`](vendor/hedera-did-resolver/README.md) (HCS topics are
  publicly writable, so every event is Ed25519-verified against the DID root key, and the
  event history is bounded and **fail-closed** — a topic exceeding the bound refuses to resolve
  rather than serving potentially stale state), and
  [`@thisdid/xrpl-did-resolver`](vendor/xrpl-did-resolver/README.md) (to our knowledge the
  first published resolver for native XLS-40 DIDs; authored on-ledger documents pass a strict
  usability validation — own-DID ids, resolved references, exactly one encoding-validated
  public key per method, private JWK members rejected — before being served),
  [`@thisdid/iota-did-resolver`](vendor/iota-did-resolver/README.md) (IOTA Rebased Identity
  Move objects unpacked offline, package-allowlisted, with the spec's chain-identifier
  assertion — the official bindings are WASM-heavy for workerd),
  [`@thisdid/empe-did-resolver`](vendor/empe-did-resolver/README.md) (a hand-rolled protobuf
  decode of Empeiria's `x/diddoc` query, field numbers taken from the chain's own codec — the
  official packages pull cosmjs/protobufjs/typeorm),
  [`@thisdid/dht-did-resolver`](vendor/dht-did-resolver/README.md) (every Pkarr relay payload
  Ed25519-verified against the DID's own identity key before its DNS records are reconstructed
  — a relay can withhold but never forge),
  [`@thisdid/tz-did-resolver`](vendor/tz-did-resolver/README.md) (Tezos layer-1 derivation per
  the frozen-but-complete Spruce spec, with TzKT-discovered keys included only after BLAKE2b
  re-derivation of the address), and
  [`@thisdid/ion-did-resolver`](vendor/ion-did-resolver/README.md) (long-form Sidetree DIDs
  verified fully offline — suffix and delta hashes over canonicalized create data; short-form
  deliberately reports `notConfigured` since no public ION node exists, and the chain falls
  through to upstreams).

Per the vendoring convention every vendored package records its method scope, trust model,
fail-closed behavior, test-vector provenance, and exit criteria back to upstream in its README.
Drivers report `notConfigured` for missing per-network configuration (the mother treats it as a
transport-class failure and continues the chain) and method-specific fail-closed codes — e.g.
hedera's `resourceLimitExceeded` — rather than composing from partial data.

All twenty-four Workers use the vendored DIF TypeScript `did-resolver` core and the same versioned
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
  Service Binding. The driver waves so far support `did:web`, `did:key`, `did:pkh`, `did:peer`,
  configured `did:ethr`, `did:webvh`, `did:plc`, `did:ebsi`, `did:near`, `did:jwk`, `did:cheqd`, `did:dns`, `did:ens`, `did:cid`
  (a chain-verifying, resolution-only Archon Gatekeeper), `did:sol` (direct Solana RPC
  reads of both sol-did programs), `did:iden3` (State-contract reads over EVM RPC), `did:polygonid` (Privado ID on
  the same engine), `did:hedera` (signature-verified HCS topics via public mirror
  nodes), and `did:xrpl` (native XLS-40 DID ledger entries read straight from public
  XRPL JSON-RPC — mainnet, testnet, and devnet by network-id); each Worker uses its
  published (or vendored) package with the vendored `did-resolver` core. See
  [`src/driver-workers/`](src/driver-workers/README.md).
- **`goplausible`** — routed to the [GoPlausible](https://goplausible.com) Universal Resolver
  (`goplausible.xyz/api/1.0/identifiers`), the Algorand-native resolver. Open, no key.
- **`godiddy`** — routed to the [Godiddy](https://godiddy.com) Universal Resolver
  (`api.godiddy.com`, by Danube Tech). **Requires an API key** (`Authorization: Bearer`).
- **`archon`** — routed to the [Archon](https://archon.technology) Universal Resolver
  (`resolver.archon.technology`), which runs the iden3 driver. Open, no key. **Exception:
  `did:cid`** is served only by Archon's Gatekeeper API (`archon.technology/api/v1/did`,
  founder-confirmed) — the Universal Resolver deployment times out on cid, so the archon step
  switches base for that one method (`ARCHON_CID_RESOLVER`).

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

| Method                                                                                                                                                | Chain (in order)                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `web`, `key`, `pkh`, `peer`, `ethr`, `webvh`, `plc`, `ebsi`, `near`, `jwk`, `cheqd`, `dns`, `ens`, `sol`, `polygonid`, `hedera`, `xrpl`, `dht`, `ion` | **TypeScript DID Resolver** → Godiddy → Archon |
| `iden3`, `cid`, `iota`, `tz`, `empe`                                                                                                                  | **TypeScript DID Resolver** → Archon → Godiddy |
| `algo`, `nfd`                                                                                                                                         | **GoPlausible** → Godiddy → Archon             |
| _all others_ (long tail)                                                                                                                              | Godiddy → Archon (no local driver)             |

The first two rows are the twenty-four methods with implemented local TypeScript drivers (this table
mirrors `LOCAL_DRIVER_METHODS` and `ROUTE_CHAINS` in the source). For every other advertised
method, the `local` step reports `notConfigured` and the mother continues to its configured
upstream providers. A method in the broader catalog describes a routing policy, not a guarantee
that every upstream deployment can resolve every identifier.

Every response's `didResolutionMetadata` is extended with `route` (`local` for the TypeScript DID
Resolver, or `upstream` for a remote resolver),
`resolver`, `network`, `durationMs`, `via` (the upstream base that answered), and `chain`
(e.g. `local→godiddy→archon`) so clients — and the SPA route banner — can see exactly how a DID
was resolved. Change a method's routing by editing `ROUTE_CHAINS` in the registry.

#### Probation double-checking (new-driver guarantee)

Newly added TS Universal Resolver drivers (currently `webvh`, `plc`, `ebsi`, `near`, `jwk`, `cheqd`, `dns`, `ens`, `cid`, `sol`, `iden3`, `polygonid`, `hedera`, `xrpl`, `iota`, `empe`, `dht`, `tz`, `ion`) carry a **New · under test**
badge and run under a guarantee mechanism **wherever an independent verifier exists**: when a
capable upstream is configured for the method, every ThisDID resolution is executed **in parallel**
with that redundant upstream, and the two documents' security core (document
`id`, the set of public verification keys — or, for keyless methods like iden3/polygonid, the
on-chain identity state itself — and deactivation status) is compared in the mother Worker.
Methods no upstream anywhere can currently resolve (`polygonid`, `xrpl`, `dht`) are **local-authoritative**:
their results are honestly stamped `verification: { status: "unverified", reason:
"upstreamUnsupported" }` rather than being double-checked, until an independent verifier becomes
available:

- **Core match** → the ThisDID result is served, stamped
  `didResolutionMetadata.verification: { status: "match", provider }` and shown in the UI as a
  bold green **Double-checked by <Provider>** badge (and in the analytics live feed).
- **Core mismatch** (both sides resolved, documents disagree) → the upstream's answer is served
  conservatively, and the disagreement is logged **with both documents** to the D1
  `verification_mismatches` table
  ([`migrations/0003_verification.sql`](migrations/0003_verification.sql)) for adjudication.
- **Upstream cannot answer** — transport failure, throttled quota (`upstreamRateLimited`),
  unsupported method, or a failed resolution (e.g. `notFound`) → the ThisDID result is served
  unbadged (`status: "unverified"`, reason recorded). A verifier with no answer has no opinion
  to disagree with, and the guarantee never becomes a new point of failure.
- **Incomparable material** — a document carries a verification method whose material the
  comparator does not understand → served unbadged (`status: "unverified"`, reason
  `unverifiableMaterial`), never a fabricated match or mismatch. Keyless methods the comparator
  DOES understand are compared by their real security state: iden3/polygonid documents compare
  the on-chain identity state, GIST root, State contract, and proof — not just key sets.

The verifier is chosen **capability- and health-aware** (`UPSTREAM_METHOD_SUPPORT` in
[`src/resolvers/registry.ts`](src/resolvers/registry.ts)): only an upstream known to resolve the
method, and not currently tripped `down` by the probes, is consulted (e.g. `did:plc` verifies
against Archon — the only upstream that speaks it; `did:jwk` against Godiddy — Archon's jwk
driver is broken). When no capable verifier exists or every capable one is down, the redundant
call is skipped entirely — the ThisDID result is served at full speed with the `unverified`
stamp.

Per-method match/mismatch/unverified counts appear on [`/analytics`](https://thisdid.com/analytics)
— they are the graduation criteria: once a method sustains a high match-rate over real traffic,
it is removed from `PROBATION_METHODS` ([`src/methods.ts`](src/methods.ts)) and resolves at pure
gateway latency with no redundant upstream call. NEAR implicit accounts are exempt (deterministic,
and unresolvable by upstreams).

#### Resolver health probes (`thisdid-probe`)

The routing engine is fed by a **connected sub-worker** ([`probe/`](probe/)) that pings every
route with **real canary DID resolutions** — not TCP checks — **every five minutes**
(cron `*/5 * * * *`). One canary per authoritative route, each bounded by the same 8s timeout as
live traffic: a resolution-verified canary per TypeScript driver (`web`, `key`, `pkh`, `peer`,
`webvh`, `plc`, `ebsi`, `jwk`, `cheqd`, `dns`, `cid`, `sol`, `iden3`, `polygonid`, `hedera`,
`xrpl`, `iota`, `empe`, `tz`, an offline long-form `ion`, and two for `near` — an offline
implicit account plus a live mainnet RPC account; the ens canary is enabled with
`ENS_CANARY_DID` once its RPC secret is configured, and `dht` has no default canary — no
stable public did:dht record has survived TBD's shutdown, so `DHT_CANARY_DID` arms one once a
continuously republished record exists), `did:algo` +
`did:nfd` via GoPlausible, and `did:iden3` + `did:cid` via Archon (its Universal Resolver and
its cid-only Gatekeeper fold into the same `archon` health key).
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
  latency, rolling success rate, and a consecutive-failure counter (3 all-failed rounds ≈ 15 min
  trips `down`).

On its hourly housekeeping tick the probe worker additionally writes **durable stats history**
to D1 ([`migrations/0004_stats_rollups.sql`](migrations/0004_stats_rollups.sql)):
`provider_stats_hourly` (per provider × UTC hour — probe health, routed live traffic,
verification agreement, status-transition counts) and `method_stats_daily` (per method × UTC
day — popularity/availability history). Status changes are journaled to
`provider_status_events` the minute they happen, so uptime intervals survive the snapshot's
per-round overwrite. The rollups are idempotent and cursor-driven (`rollup_state`): a missed
tick self-heals, and a fresh deployment backfills automatically from the earliest raw rows.
This is the data feed for the upcoming ThisDID Directory's provider reliability scores.

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

Requires **Node ≥ 22.12**, **npm ≥ 11**, **pnpm 11** (for the vendored packages — e.g.
`npm install -g pnpm@11`), and a recursive clone:

```bash
git clone --recurse-submodules https://github.com/decentralized-identity/thisdid
# Existing clone:
git submodule update --init --recursive

npm run install:vendor # initializes submodules, then installs the pnpm-locked vendored packages
socket npm install     # installs the root Worker + web workspace (links the vendored packages);
                       # plain `npm install` works too — Socket gating is the recommended default
npm run build          # builds the vendored packages + the SPA
npm run drivers:check  # bundles all twenty-four isolated drivers without deploying
npm run check          # Worker + web typechecks, all tests, and production builds
```

`install:vendor` runs first on purpose: `npm install` links `vendor/did-resolver` as a
dependency, so the submodule must exist before it — and `install:vendor` guarantees that even on
a non-recursive clone.

> If `install:vendor` reports _“This project is configured to use npm”_, pnpm is running in an
> empty `vendor/did-resolver` — the submodule was not initialized. The script now initializes
> submodules itself; run it from the repository root.

> Installs are gated through [Socket](https://socket.dev): use `socket npm install`.

The committed `package-lock.json` pins the Worker and web workspace graph — CI's `npm ci` (and
its npm cache key) depend on it. The vendored packages (`did-resolver` and the `@thisdid/*`
drivers) are linked as local runtime dependencies and keep their release/build toolchains isolated
in their own pnpm lockfiles. This prevents library publishing tools from being hoisted into the deployed
application's dependency graph.

### Develop

```bash
npm run dev            # mother Worker + twenty-four bound driver Workers + Vite SPA
npm run dev:worker     # mother Worker only (drivers must already be running)
npm run dev:drivers    # twenty-four discoverable local driver processes on ports 8791–8809 and 8811–8815
npm run dev:web        # Vite HMR dev server on http://localhost:5173 (proxies /1.0, /methods to :8787)
npm test               # root Worker + probe + web test suites (per-package: cd vendor/<pkg> && pnpm test)
```

`npm run dev` already starts the Vite development server. Driver processes use ports 8791–8809
with separate inspector ports, while clients test the complete routing path through the mother API
on port 8787. For local ethr resolution, copy
`src/driver-workers/ethr/.dev.vars.example` to `src/driver-workers/ethr/.dev.vars` and add the full
Alchemy URLs.

### Build & deploy

```bash
npm run build          # → all vendored package libs + web/dist
npm run deploy:drivers # deploy twenty-four isolated driver Workers first
npm run deploy         # build, deploy the directory worker, then the mother Worker
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
self-diagnosing. Resolution and MCP routes can also return 429 when the Cloudflare rate
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

| Var                    | Purpose                                                                                      |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| `GOPLAUSIBLE_RESOLVER` | GoPlausible Universal Resolver base (DID appended as `/{did}`).                              |
| `GODIDDY_RESOLVER`     | Godiddy Universal Resolver base (DID appended as `/{did}`).                                  |
| `ARCHON_RESOLVER`      | Archon Universal Resolver base (DID appended as `/{did}`).                                   |
| `ARCHON_CID_RESOLVER`  | Archon's cid-only Gatekeeper base — `did:cid` is served here, not by its Universal Resolver. |
| `RESOLVER_LABEL`       | Service label reported by `/health`.                                                         |

The probe sub-worker keeps its own copy of the four resolver-base vars in
[`probe/wrangler.jsonc`](probe/wrangler.jsonc) (same values), plus probe-only vars:
`GODIDDY_HEALTH` (Godiddy's unmetered ingress health endpoint — probed instead of a canary
resolution because the public resolver API is quota-throttled) and the optional
`ENS_CANARY_DID` / `ETHR_CANARY_DID` (enable those drivers' network-backed canaries once their
RPC secrets are configured). Driver-specific configuration lives on each driver Worker's own
config — the full required/optional table is below, and
[`src/driver-workers/`](src/driver-workers/README.md) has the per-driver details.

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

The mother and probe Workers bind privately to all twenty-four driver services declared in their
respective `services` arrays. Per-driver configuration (each on that driver Worker's own config —
`--config src/driver-workers/<method>/wrangler.jsonc`):

| Driver                                      | Kind                             | Configuration                                                                                                                      |
| ------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `ethr`                                      | **Secrets, per enabled network** | `ETH_RPC_MAINNET_URL`, `ETH_RPC_SEPOLIA_URL` (full keyed RPC URLs; only the unconfigured network fails closed)                     |
| `ens`                                       | **Required secret**              | `ETH_RPC_MAINNET_URL` (its own copy — separate Worker, separate secret)                                                            |
| `sol`                                       | **Secrets, per enabled cluster** | `SOL_RPC_MAINNET_URL`, `SOL_RPC_DEVNET_URL`, `SOL_RPC_TESTNET_URL` (only an unconfigured cluster fails closed `notConfigured`)     |
| `iden3`                                     | **Secrets, per enabled network** | `IDEN3_RPC_POLYGON_MAIN_URL`, `IDEN3_RPC_POLYGON_AMOY_URL`                                                                         |
| `polygonid`                                 | **Secrets, per enabled network** | `POLYGONID_RPC_POLYGON_MAIN_URL`, `POLYGONID_RPC_POLYGON_AMOY_URL`                                                                 |
| `near`                                      | Vars with public defaults        | `NEAR_RPC_MAINNET_URL` / `NEAR_RPC_TESTNET_URL` (public RPC committed; swap for a keyed secret if desired), optional registry vars |
| `ebsi`                                      | Var with default                 | `EBSI_DID_REGISTRY` (pilot registry)                                                                                               |
| `plc`                                       | Var with default                 | `PLC_DIRECTORY_URL` (`https://plc.directory`)                                                                                      |
| `cheqd`                                     | Optional var                     | `CHEQD_RESOLVER_URL` (official resolver default built in)                                                                          |
| `dns`                                       | Optional var                     | `DOH_URL` (Cloudflare DNS-over-HTTPS default built in)                                                                             |
| `cid`                                       | Optional var                     | `CID_GATEKEEPER_URL` (Archon Gatekeeper default built in)                                                                          |
| `hedera`                                    | Optional vars                    | `HEDERA_MIRROR_MAINNET_URL` / `HEDERA_MIRROR_TESTNET_URL` (public mirror defaults built in — keyless)                              |
| `xrpl`                                      | Optional vars                    | `XRPL_RPC_MAINNET_URL` / `XRPL_RPC_TESTNET_URL` / `XRPL_RPC_DEVNET_URL` (public endpoint defaults built in — keyless)              |
| `iota`                                      | Optional vars                    | `IOTA_RPC_MAINNET_URL` / `IOTA_RPC_TESTNET_URL` / `IOTA_RPC_DEVNET_URL` (public fullnode defaults built in — keyless)              |
| `empe`                                      | Vars, per enabled network        | `EMPE_RPC_TESTNET_URL` (public default built in); `EMPE_RPC_MAINNET_URL` the day Empeiria's mainnet launches (fails closed until)  |
| `dht`                                       | Optional var                     | `DHT_RELAY_URLS` (comma-separated Pkarr relays; `relay.pkarr.org` default built in — keyless, payloads self-verifying)             |
| `tz`                                        | Optional vars                    | `TZ_TZKT_MAINNET_URL` / `TZ_TZKT_SHADOWNET_URL` (public TzKT defaults built in — keyless; derivation itself is offline)            |
| `ion`                                       | Optional var                     | `ION_RESOLUTION_ENDPOINT` (deliberately unset — long-form is offline; short-form falls through to upstreams until a node exists)   |
| `web`, `key`, `pkh`, `peer`, `webvh`, `jwk` | None                             | Deterministic or credential-free HTTPS — deploy and go                                                                             |

Store every required secret with `wrangler secret put` on the owning driver Worker, e.g.:

```bash
npx wrangler secret put ETH_RPC_MAINNET_URL --config src/driver-workers/ethr/wrangler.jsonc
npx wrangler secret put ETH_RPC_SEPOLIA_URL --config src/driver-workers/ethr/wrangler.jsonc
npx wrangler secret put ETH_RPC_MAINNET_URL --config src/driver-workers/ens/wrangler.jsonc
npx wrangler secret put SOL_RPC_MAINNET_URL --config src/driver-workers/sol/wrangler.jsonc
npx wrangler secret put SOL_RPC_DEVNET_URL --config src/driver-workers/sol/wrangler.jsonc
npx wrangler secret put SOL_RPC_TESTNET_URL --config src/driver-workers/sol/wrangler.jsonc
npx wrangler secret put IDEN3_RPC_POLYGON_MAIN_URL --config src/driver-workers/iden3/wrangler.jsonc
npx wrangler secret put IDEN3_RPC_POLYGON_AMOY_URL --config src/driver-workers/iden3/wrangler.jsonc
npx wrangler secret put POLYGONID_RPC_POLYGON_MAIN_URL --config src/driver-workers/polygonid/wrangler.jsonc
npx wrangler secret put POLYGONID_RPC_POLYGON_AMOY_URL --config src/driver-workers/polygonid/wrangler.jsonc
```

Secrets are per enabled network: configure only the networks you serve — a DID targeting an
unconfigured network fails closed (`notConfigured`) for that network alone, and the mother falls
through to the method's upstream chain, so resolution degrades gracefully rather than breaking.
For local dev, every secret-requiring driver directory (`ethr`, `ens`, `sol`, `iden3`,
`polygonid`) carries a `.dev.vars.example` to copy.

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
