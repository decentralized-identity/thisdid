# Tier 1 driver Workers

Each directory here is a private Cloudflare Worker deployment unit. It imports one DID method
resolver package (published npm or ThisDID-vendored) and runs it with DIF's TypeScript
`did-resolver` core.

The mother Worker invokes these Workers through Service Bindings using the versioned contract in
`contract.ts`. `workers_dev` and preview URLs are disabled, so the driver Workers do not expose
public routes. They do not select fallbacks or record analytics.

## Workers

All twenty-four active drivers:

| Binding            | Worker name                | Resolver package                                       | Configuration                                     |
| ------------------ | -------------------------- | ------------------------------------------------------ | ------------------------------------------------- |
| `DRIVER_WEB`       | `thisdid-driver-web`       | `web-did-resolver@2.0.32`                              | None                                              |
| `DRIVER_KEY`       | `thisdid-driver-key`       | `key-did-resolver@4.0.0`                               | None                                              |
| `DRIVER_PKH`       | `thisdid-driver-pkh`       | `pkh-did-resolver@2.0.0`                               | None                                              |
| `DRIVER_PEER`      | `thisdid-driver-peer`      | `peer-did-resolver@2.0.0`                              | None                                              |
| `DRIVER_ETHR`      | `thisdid-driver-ethr`      | `ethr-did-resolver@14.1.2`                             | Secrets per enabled network (`ETH_RPC_*`)         |
| `DRIVER_WEBVH`     | `thisdid-driver-webvh`     | `@thisdid/webvh-did-resolver@1.0.0` (vendored wrapper) | None                                              |
| `DRIVER_PLC`       | `thisdid-driver-plc`       | `@thisdid/plc-did-resolver@1.0.0` (vendored wrapper)   | `PLC_DIRECTORY_URL` var (default `plc.directory`) |
| `DRIVER_EBSI`      | `thisdid-driver-ebsi`      | `@cef-ebsi/ebsi-did-resolver@4.1.0`                    | `EBSI_DID_REGISTRY` var (pilot registry)          |
| `DRIVER_NEAR`      | `thisdid-driver-near`      | `@thisdid/near-did-resolver@1.0.0` (clean-room)        | `NEAR_RPC_*` vars (public defaults)               |
| `DRIVER_JWK`       | `thisdid-driver-jwk`       | `@thisdid/jwk-did-resolver@1.0.0` (clean-room)         | None (deterministic, offline)                     |
| `DRIVER_CHEQD`     | `thisdid-driver-cheqd`     | `@thisdid/cheqd-did-resolver@1.0.0` (vendored)         | `CHEQD_RESOLVER_URL` var (official default)       |
| `DRIVER_DNS`       | `thisdid-driver-dns`       | `@thisdid/dns-did-resolver@1.0.0` (vendored)           | `DOH_URL` var (Cloudflare default)                |
| `DRIVER_ENS`       | `thisdid-driver-ens`       | `@thisdid/ens-did-resolver@1.0.0` (vendored)           | `ETH_RPC_MAINNET_URL` secret                      |
| `DRIVER_CID`       | `thisdid-driver-cid`       | `@thisdid/cid-did-resolver@1.0.0` (clean-room)         | `CID_GATEKEEPER_URL` var (Archon default)         |
| `DRIVER_SOL`       | `thisdid-driver-sol`       | `@thisdid/sol-did-resolver@1.0.0` (clean-room)         | Secrets per enabled cluster (`SOL_RPC_*`)         |
| `DRIVER_IDEN3`     | `thisdid-driver-iden3`     | `@thisdid/iden3-did-resolver@1.0.0` (clean-room)       | Secrets per enabled network (`IDEN3_RPC_*`)       |
| `DRIVER_POLYGONID` | `thisdid-driver-polygonid` | same `@thisdid/iden3-did-resolver` package             | Secrets per enabled network (`POLYGONID_RPC_*`)   |
| `DRIVER_HEDERA`    | `thisdid-driver-hedera`    | `@thisdid/hedera-did-resolver@1.0.0` (clean-room)      | None (keyless; optional `HEDERA_MIRROR_*` vars)   |
| `DRIVER_XRPL`      | `thisdid-driver-xrpl`      | `@thisdid/xrpl-did-resolver@1.0.0` (clean-room)        | None (keyless; optional `XRPL_RPC_*` vars)        |
| `DRIVER_IOTA`      | `thisdid-driver-iota`      | `@thisdid/iota-did-resolver@1.0.0` (clean-room)        | None (keyless; optional `IOTA_RPC_*` vars)        |
| `DRIVER_EMPE`      | `thisdid-driver-empe`      | `@thisdid/empe-did-resolver@1.0.0` (clean-room)        | Vars per network (`EMPE_RPC_*`; no mainnet yet)   |
| `DRIVER_DHT`       | `thisdid-driver-dht`       | `@thisdid/dht-did-resolver@1.0.0` (clean-room)         | None (keyless; optional `DHT_RELAY_URLS` var)     |
| `DRIVER_TZ`        | `thisdid-driver-tz`        | `@thisdid/tz-did-resolver@1.0.0` (clean-room)          | None (keyless; optional `TZ_TZKT_*` vars)         |
| `DRIVER_ION`       | `thisdid-driver-ion`       | `@thisdid/ion-did-resolver@1.0.0` (clean-room)         | Optional `ION_RESOLUTION_ENDPOINT` (unset)        |

Every entrypoint registers a DIF `getResolver()` package directly. Six consume published npm
packages; the rest consume ThisDID-custodied `@thisdid/*` packages vendored under `vendor/`, in
two families:

- **Wrappers** — `@thisdid/webvh-did-resolver` and `@thisdid/plc-did-resolver` are thin DIF
  standard wrappers whose only runtime dependency is the upstream method library (`didwebvh-ts`,
  `@atproto/identity`); the wrapper adds the registry contract plus required glue (a WebCrypto
  Ed25519 proof verifier for webvh; a workerd-safe directory fetch for plc).
- **Clean-room implementations** — built where no workerd-compatible package exists or the
  existing one is unsafe: `near` (replaces a chain carrying the unpatched elliptic
  CVE-2025-14505 and a native addon), `jwk` (dependency-free, fully offline), `cid` (a
  resolution-only Archon Gatekeeper that re-verifies the full signed operation chain), `sol`
  (both on-chain sol-did programs in one RPC round-trip, no Anchor/web3.js), `iden3` (direct
  State-contract reads, serving `polygonid` too with ID type-byte enforcement), `hedera`
  (every publicly-writable HCS topic event Ed25519-verified against the DID root key; bounded,
  **fail-closed** event history), and `xrpl` (native XLS-40 ledger entries; authored on-ledger
  documents pass strict usability validation before being served), `iota` (Rebased Identity
  Move objects unpacked offline, package-allowlisted, chain-identifier-asserted), `empe`
  (hand-rolled protobuf decode of Empeiria's `x/diddoc` query — no cosmjs/protobufjs), `dht`
  (every Pkarr relay payload Ed25519-verified against the DID's own identity key before its DNS
  records are reconstructed), `tz` (Tezos layer-1 derivation with TzKT-discovered keys included
  only after BLAKE2b re-derivation of the address), and `ion` (long-form Sidetree DIDs verified
  fully offline; short-form deliberately `notConfigured` — no public ION node exists, so the
  mother's chain falls through to upstreams). Each vendored package
  documents its trust model, fail-closed behavior, test-vector provenance, and exit criteria in
  its own README under [`vendor/`](../../vendor/).

## Configuration and security conventions

- The full **required/optional configuration table** with `wrangler secret put` commands lives
  in the [root README](../../README.md) — this file only records the conventions.
- Secret naming is `<VM>_RPC_<NETWORK>_URL` (e.g. `SOL_RPC_DEVNET_URL`,
  `IDEN3_RPC_POLYGON_AMOY_URL`), with an optional ecosystem qualifier such as
  `ETH_RPC_ETH_MAINNET_URL`. Every value is the complete authenticated endpoint URL — RPC
  credentials stay inside the owning driver and never enter the mother Worker; Service Bindings
  do not inherit the mother's environment.
- Secrets are **per enabled network**: a driver fails closed (`notConfigured`) only for the
  specific network/cluster that is unconfigured — an ethr deployment may configure mainnet
  without Sepolia, and sol only the clusters it serves. `notConfigured` is transport-class for
  the mother, which falls through to the method's upstream chain.
- The ebsi Worker fails closed without `EBSI_DID_REGISTRY` so a misdeployed Worker can never
  silently answer from the wrong registry environment; near fails closed when no RPC endpoint
  is configured for the requested network.
- `ETH_RPC_ETH_MAINNET_URL` / `ETH_RPC_ETH_SEPOLIA_URL` remain reserved for a Base-capable
  driver: the installed `ethr-did-resolver` publishes no ERC-1056 deployment metadata for Base,
  so ThisDID does not guess a registry address or advertise Base `did:ethr` resolution.

## Deployment order

Run `npm run drivers:check` (dry-run bundles all twenty-four), then deploy the drivers before the
mother Worker:

```sh
npm run deploy:drivers
npm run deploy
# or drivers, probe, and mother Worker in the required order:
npm run deploy:all
```

Publishing, deployment, commits, and pushes remain explicit maintainer actions.

## Local development

`npm run dev` starts the twenty-four driver processes, the mother Worker, and the Vite SPA
together. Wrangler discovers the driver processes by their configured service names and connects
the mother's Service Bindings at `http://localhost:8787`; nothing is deployed.
`npm run dev:drivers` (ports 8791–8809 and 8811–8815; 8810 belongs to `dev:directory`) and
`npm run dev:worker` are also available when
separate terminals are preferable.

For local network-backed resolution, copy `.dev.vars.example` to `.dev.vars` inside each
secret-requiring driver directory (`ethr`, `ens`, `sol`, `iden3`, `polygonid`) and insert the
full provider URLs. The keyless drivers (`hedera`, `xrpl`, `iota`, `empe`, `dht`, `tz`) and the offline drivers
(`key`, `pkh`, `peer`, `jwk`, and long-form `ion`) need no local secrets.
