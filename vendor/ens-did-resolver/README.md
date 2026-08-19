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

## License

Apache-2.0
