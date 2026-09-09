# @thisdid/ens-did-resolver

A `did:ens` driver for the DIF
[`did-resolver`](https://github.com/decentralized-identity/did-resolver) interface — a **thin
standard wrapper**: ENS name resolution and DID document construction are performed entirely by
veramolabs' [`ens-did-resolver`](https://www.npmjs.com/package/ens-did-resolver), this package's
only runtime dependency (ethers-v5 providers, JSON-RPC over fetch).

## What the wrapper adds

- Explicit, validated network configuration — an unconfigured resolver **fails closed** instead
  of silently resolving against nothing (RPC endpoints with credentials belong in Worker
  secrets, mirroring the ethr driver's convention).
- The pinned DIF registry contract for uniform consumption alongside ThisDID's other drivers.

**Exit criteria (vendoring convention):** retired in favor of direct upstream use if
`ens-did-resolver` modernizes (ethers v6) and the configuration needs disappear.

## Usage

```ts
import { Resolver } from "did-resolver";
import { getResolver } from "@thisdid/ens-did-resolver";

const resolver = new Resolver(
  getResolver({ networks: [{ name: "mainnet", rpcUrl: "https://…alchemy…/KEY" }] }),
);
const result = await resolver.resolve("did:ens:vitalik.eth");
```



## Command line

The package ships a standalone resolver command, `thisdid-resolve-ens`, that
needs nothing but Node 20+ — no resolver service, no Worker:

```sh
ETH_RPC_MAINNET_URL=https://… npx thisdid-resolve-ens did:ens:vitalik.eth
# from a checkout: node lib/bin.js <did>
```

It prints the DIF resolution result as JSON on stdout and exits 0 when the
DID resolved, 1 when the resolver reported an error
(`didResolutionMetadata.error`), 2 on a usage or configuration error.
`--version-id <id>` and `--version-time <iso>` are passed through as
resolution options, `--compact` prints single-line JSON, `--help` prints the
full reference. Host options are read from the environment, under the same names the ThisDID
Worker uses, so one `.dev.vars` file drives both:

| Variable | Effect |
| --- | --- |
| `ETH_RPC_MAINNET_URL` | complete JSON-RPC endpoint for Ethereum mainnet |
| `ETH_RPC_MAINNET_BASE_URL` | Alchemy base URL (ends with `/`), needs `ALCHEMY_API_KEY` |
| `ALCHEMY_API_KEY` | appended to `ETH_RPC_MAINNET_BASE_URL` |
| `ENS_TIMEOUT_MS` | per-request bound in ms (`timeoutMs`) |

The mainnet endpoint is required; without it the command exits 2.

## License

Apache-2.0
