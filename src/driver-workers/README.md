# Tier 1 driver Workers

Each directory here is a private Cloudflare Worker deployment unit. It imports one published DID
method resolver package and runs that package with DIF's TypeScript `did-resolver` core. Method
implementation source is not copied into ThisDID.

The mother Worker invokes these Workers through Service Bindings using the versioned contract in
`contract.ts`. `workers_dev` and preview URLs are disabled, so the driver Workers do not expose
public routes. They do not select fallbacks or record analytics.

## Workers

| Binding        | Worker name            | Package                                        | Configuration |
| -------------- | ---------------------- | ---------------------------------------------- | ------------- |
| `DRIVER_WEB`   | `thisdid-driver-web`   | `web-did-resolver@2.0.32`                      | None          |
| `DRIVER_KEY`   | `thisdid-driver-key`   | `key-did-resolver@4.0.0`                       | None          |
| `DRIVER_PKH`   | `thisdid-driver-pkh`   | `pkh-did-resolver@2.0.0`                       | None          |
| `DRIVER_PEER`  | `thisdid-driver-peer`  | `peer-did-resolver@2.0.0`                      | None          |
| `DRIVER_ETHR`  | `thisdid-driver-ethr`  | `ethr-did-resolver@14.1.2`                     | Secret        |
| `DRIVER_WEBVH` | `thisdid-driver-webvh` | `@thisdid/webvh-did-resolver@1.0.0` (vendored) | None          |
| `DRIVER_PLC`   | `thisdid-driver-plc`   | `@thisdid/plc-did-resolver@1.0.0` (vendored)   | Var           |
| `DRIVER_EBSI`  | `thisdid-driver-ebsi`  | `@cef-ebsi/ebsi-did-resolver@4.1.0`            | Var           |
| `DRIVER_NEAR`  | `thisdid-driver-near`  | `@thisdid/near-did-resolver@1.0.0` (vendored)  | Vars          |

Every entrypoint registers a DIF `getResolver()` package directly. Six consume published npm
packages; `webvh`, `plc`, and `near` consume ThisDID-custodied `@thisdid/*` packages vendored
under `vendor/`: `@thisdid/webvh-did-resolver` and `@thisdid/plc-did-resolver` are thin DIF
standard wrappers whose only runtime dependency is the upstream method library (`didwebvh-ts`,
`@atproto/identity`) — the wrapper adds the registry contract plus required glue (a WebCrypto
Ed25519 proof verifier for webvh; a workerd-safe directory fetch for plc) — while
`@thisdid/near-did-resolver` is a clean-room fetch-native implementation, and
`@thisdid/jwk-did-resolver` is a clean-room, dependency-free implementation of the deterministic
did:jwk specification (fully offline). Each vendored package
documents its exit criteria back to upstream.

The plc Worker reads `PLC_DIRECTORY_URL` (public var, default `https://plc.directory`). The ebsi
Worker reads `EBSI_DID_REGISTRY` (public var, currently the EBSI pilot registry) and fails closed
without it so a misdeployed Worker can never silently answer from the wrong registry environment.

The near Worker consumes the **vendored** `@thisdid/near-did-resolver` package
([`vendor/near-did-resolver`](../../vendor/near-did-resolver/README.md)) instead of
`@kaytrust/did-near-resolver`, whose `near-api-js` chain carries the unpatched elliptic
CVE-2025-14505 and a native secp256k1 addon. It reads `NEAR_RPC_MAINNET_URL` /
`NEAR_RPC_TESTNET_URL` (public endpoints as vars; a keyed provider URL should be a secret
instead) and optional `NEAR_REGISTRY_CONTRACT_MAINNET` / `NEAR_REGISTRY_CONTRACT_TESTNET` for
base58 registry identifiers, and fails closed when no RPC endpoint is configured.

The cheqd Worker reads `CHEQD_RESOLVER_URL` (optional var; defaults to cheqd's official
`resolver.cheqd.net`). The dns Worker reads `DOH_URL` (optional var; defaults to Cloudflare's
DNS-over-HTTPS resolver). The ens Worker follows the ethr convention: it reads its own
`ETH_RPC_MAINNET_URL` secret and fails closed without it:

```sh
npx wrangler secret put ETH_RPC_MAINNET_URL --config src/driver-workers/ens/wrangler.jsonc
```

The ethr Worker reads full Alchemy RPC URLs from `ETH_RPC_MAINNET_URL` and
`ETH_RPC_SEPOLIA_URL`. Configure one or both as secrets on the ethr Worker; RPC credentials stay
inside that driver and never enter the mother Worker.

```sh
npx wrangler secret put ETH_RPC_MAINNET_URL --config src/driver-workers/ethr/wrangler.jsonc
npx wrangler secret put ETH_RPC_SEPOLIA_URL --config src/driver-workers/ethr/wrangler.jsonc
```

Use the complete provider URL, including its access token, as the secret value.

`ETH_RPC_ETH_MAINNET_URL` and `ETH_RPC_ETH_SEPOLIA_URL` are reserved for a Base-capable driver.
The installed `ethr-did-resolver` package does not publish ERC-1056 deployment metadata for Base,
so ThisDID does not guess a registry address or advertise Base `did:ethr` resolution.

`SVM_RPC_MAINNET_URL` and `SVM_RPC_DEVNET_URL` are reserved for the future isolated Solana driver.
They must be attached to that driver Worker when it is implemented, not to existing workers.

The secret naming convention is `<VM>_RPC_<NETWORK>_URL`, with an optional ecosystem qualifier such
as `ETH_RPC_ETH_MAINNET_URL`. Every value is the complete authenticated endpoint URL. A driver
receives only the secrets for networks it directly accesses; Service Bindings do not inherit the
mother Worker's environment.

## Deployment order

Run `npm run drivers:check`, then deploy the thirteen drivers before deploying the mother Worker:

```sh
npm run deploy:drivers
npm run deploy
# or drivers, probe, and mother Worker in the required order:
npm run deploy:all
```

Publishing, deployment, commits, and pushes remain explicit maintainer actions.

## Local development

`npm run dev` starts thirteen driver processes, the mother Worker, and the Vite SPA together. Wrangler
discovers the driver processes by their configured service names and connects the mother's Service
Bindings at `http://localhost:8787`; nothing is deployed. `npm run dev:drivers` and
`npm run dev:worker` are also available when separate terminals are preferable.

For local ethr resolution, copy `ethr/.dev.vars.example` to `ethr/.dev.vars` and insert the full
Alchemy URLs. The offline `key`, `pkh`, and `peer` drivers need no local secrets.
