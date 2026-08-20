# @thisdid/cid-did-resolver

[`did:cid`](https://github.com/archetech/archon) resolution for the DIF
[`did-resolver`](https://www.npmjs.com/package/did-resolver) interface — as a
**resolution-only Archon Gatekeeper**, not a proxy.

Instead of trusting a Gatekeeper's answer, this driver fetches the DID's
complete signed operation chain (`POST {gatekeeper}/dids/export`) and
re-derives the document itself:

- the DID suffix must equal the CIDv1 (json codec · sha256 · base32) of the
  JCS-canonicalized genesis operation,
- every operation must be signed by the *then-current* key (key rotation
  honored; asset operations verify against the controller's chain,
  recursively and depth-bounded),
- operations must be hash-linked (`previd` = recomputed CID of the previous
  operation), and deactivation is terminal.

Only event **discovery** is delegated: a misbehaving Gatekeeper can withhold
the tail of a chain (staleness) but cannot forge, alter, or reorder state.
Verification semantics are ported from
[`@didcid/gatekeeper`](https://www.npmjs.com/package/@didcid/gatekeeper)
(MIT) `resolveDID` with `verify: true`.

```ts
import { Resolver } from "did-resolver";
import { getResolver } from "@thisdid/cid-did-resolver";

const resolver = new Resolver(
  getResolver({ gatekeeperUrl: "https://archon.technology/api/v1" }),
);
const result = await resolver.resolve(
  "did:cid:bagaaieraoqzjgi6537vyu3h3rtetki5g4bk6stzyqplcmwpqgqxp7fewowcq",
);
```

Runs anywhere `fetch`, `TextEncoder`, and `atob` exist — including Cloudflare
Workers. Dependencies are pure JS: `@noble/curves`, `@noble/hashes`,
`multiformats`.
