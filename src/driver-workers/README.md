# Tier 1 driver Workers

Each directory here is a private Cloudflare Worker deployment unit. It imports one published DID
method resolver package and runs that package with DIF's TypeScript `did-resolver` core. Method
implementation source is not copied into ThisDID.

The mother Worker invokes these Workers through Service Bindings using the versioned contract in
`contract.ts`. `workers_dev` and preview URLs are disabled, so the driver Workers do not expose
public routes. They do not select fallbacks or record analytics.

## Workers

| Binding       | Worker name           | Package                    | Configuration |
| ------------- | --------------------- | -------------------------- | ------------- |
| `DRIVER_WEB`  | `thisdid-driver-web`  | `web-did-resolver@2.0.32`  | None          |
| `DRIVER_KEY`  | `thisdid-driver-key`  | `key-did-resolver@4.0.0`   | None          |
| `DRIVER_PKH`  | `thisdid-driver-pkh`  | `pkh-did-resolver@2.0.0`   | None          |
| `DRIVER_PEER` | `thisdid-driver-peer` | `peer-did-resolver@2.0.0`  | None          |
| `DRIVER_ETHR` | `thisdid-driver-ethr` | `ethr-did-resolver@14.1.2` | Secret        |

The ethr Worker reads full Alchemy RPC URLs from `EVM_RPC_MAINNET_URL` and
`EVM_RPC_SEPOLIA_URL`. Configure one or both as secrets on the ethr Worker; RPC credentials stay
inside that driver and never enter the mother Worker.

```sh
npx wrangler secret put EVM_RPC_MAINNET_URL --config src/driver-workers/ethr/wrangler.jsonc
npx wrangler secret put EVM_RPC_SEPOLIA_URL --config src/driver-workers/ethr/wrangler.jsonc
```

Use the complete provider URL, including its access token, as the secret value.

`EVM_RPC_BASE_MAINNET_URL` and `EVM_RPC_BASE_SEPOLIA_URL` are reserved for a Base-capable driver.
The installed `ethr-did-resolver` package does not publish ERC-1056 deployment metadata for Base,
so ThisDID does not guess a registry address or advertise Base `did:ethr` resolution.

`SVM_RPC_MAINNET_URL` and `SVM_RPC_DEVNET_URL` are reserved for the future isolated Solana driver.
They must be attached to that driver Worker when it is implemented, not to existing workers.

The secret naming convention is `<VM>_RPC_<NETWORK>_URL`, with an optional ecosystem qualifier such
as `EVM_RPC_BASE_MAINNET_URL`. Every value is the complete authenticated endpoint URL. A driver
receives only the secrets for networks it directly accesses; Service Bindings do not inherit the
mother Worker's environment.

## Deployment order

Run `npm run drivers:check`, then deploy the five drivers before deploying the mother Worker:

```sh
npm run deploy:drivers
npm run deploy
# or drivers, probe, and mother Worker in the required order:
npm run deploy:all
```

Publishing, deployment, commits, and pushes remain explicit maintainer actions.

## Local development

`npm run dev` starts five driver processes, the mother Worker, and the Vite SPA together. Wrangler
discovers the driver processes by their configured service names and connects the mother's Service
Bindings at `http://localhost:8787`; nothing is deployed. `npm run dev:drivers` and
`npm run dev:worker` are also available when separate terminals are preferable.

For local ethr resolution, copy `ethr/.dev.vars.example` to `ethr/.dev.vars` and insert the full
Alchemy URLs. The offline `key`, `pkh`, and `peer` drivers need no local secrets.
