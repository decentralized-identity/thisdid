# @thisdid/ethr-did-resolver

did:ethr driver for the DIF
[`did-resolver`](https://github.com/decentralized-identity/did-resolver)
interface. The method implementation is the DIF
[`ethr-did-resolver`](https://github.com/decentralized-identity/ethr-did-resolver)
core (ERC-1056 registry reads over ethers) — consumed from the
ThisDID-custodied fork under
[`vendor/forks/ethr-did-resolver`](../forks/ethr-did-resolver), pinned to the
14.1.2 release, rather than from the npm registry — so every line that
resolves a did:ethr in ThisDID can be read, audited and patched in this
repository. This package adds the environment → network configuration the
ThisDID Worker and the command-line resolver share, and is the single import
both use.

```ts
import { Resolver } from "did-resolver";
import { getResolver, networksFromEnv } from "@thisdid/ethr-did-resolver";

// From the ThisDID variable convention …
const resolver = new Resolver(getResolver({ networks: networksFromEnv(process.env) }));
// … or with the core's own options (rpcUrl, or a pre-built ethers provider).
const explicit = new Resolver(
  getResolver({ networks: [{ name: "mainnet", chainId: 1, rpcUrl: "https://…" }] }),
);
const result = await resolver.resolve("did:ethr:0xb9c5714089478a327f09197987f16f9e5d936e8a");
```

Networks without an endpoint are not registered: a DID on one of them resolves
to `unknownNetwork` rather than through a guessed public RPC.

## Command line

The package ships a standalone resolver command, `thisdid-resolve-ethr`, that
needs nothing but Node 20+ and an RPC endpoint — no resolver service, no
Worker:

```sh
ETH_RPC_MAINNET_URL=https://… npx thisdid-resolve-ethr did:ethr:0xb9c5714089478a327f09197987f16f9e5d936e8a
# from a checkout: node lib/bin.js <did>
```

It prints the DIF resolution result as JSON on stdout and exits 0 when the
DID resolved, 1 when the resolver reported an error
(`didResolutionMetadata.error`), 2 on a usage or configuration error.
`--version-id <block>` and `--version-time <iso>` select a version,
`--compact` prints single-line JSON, `--help` prints the full reference. The
endpoints are read from the environment under the ThisDID Worker's variable
names, so the same `.dev.vars` or secret set serves both:

| Variable                   | Effect                                                   |
| -------------------------- | -------------------------------------------------------- |
| `ETH_RPC_MAINNET_URL`      | complete JSON-RPC endpoint for Ethereum mainnet          |
| `ETH_RPC_SEPOLIA_URL`      | complete JSON-RPC endpoint for Sepolia                   |
| `ETH_RPC_MAINNET_BASE_URL` | Alchemy base URL (ends with `/`), needs `ALCHEMY_API_KEY` |
| `ETH_RPC_SEPOLIA_BASE_URL` | Alchemy base URL (ends with `/`), needs `ALCHEMY_API_KEY` |
| `ALCHEMY_API_KEY`          | appended to the `*_BASE_URL` variables                   |

At least one network must be configured, or the command exits 2.

## Development

```sh
pnpm install
pnpm run build      # tsc → lib/
pnpm test           # offline: a quiet in-memory provider stands in for the chain
pnpm run test:live  # + one mainnet resolution (ETHR_LIVE=1 ETH_RPC_MAINNET_URL=…)
```

The fork must be built first (`pnpm -r run build` in
`vendor/forks/ethr-did-resolver`); the root `npm run build:vendor` does that in
order.
