# @thisdid/jwk-did-resolver

A `did:jwk` driver for the DIF
[`did-resolver`](https://github.com/decentralized-identity/did-resolver) interface — a clean-room
implementation of the
[did:jwk method specification](https://github.com/quartzjer/did-jwk/blob/main/spec.md).
Resolution is a deterministic, fully offline transformation of the base64url-encoded JWK in the
identifier into a DID document. **Zero runtime dependencies.**

## Why this package exists

No maintained standalone DIF driver package for did:jwk exists on npm: Sphereon's
`@sphereon/ssi-sdk-ext.did-resolver-jwk` is part of a broader Veramo-style stack, and the method
is otherwise served only by Universal Resolver deployments (Java driver). The method itself is
~150 lines of deterministic logic, so a dependency-free driver is the right shape.

**Exit criteria (vendoring convention):** retired in favor of a community package if the DIF
ecosystem publishes a maintained standalone `did:jwk` driver, or offered to the method community
as-is.

## Behavior

- Spec-conformant document shape: single `JsonWebKey2020` verification method with the fixed
  `#0` fragment, `use: "sig"` omits `keyAgreement`, `use: "enc"` emits _only_ `keyAgreement`.
- **Private key material is rejected, not stripped**: any of `d`, `p`, `q`, `dp`, `dq`, `qi`,
  `oth`, `k` in the JWK → `invalidDid`. A published private key is a compromised key; this driver
  refuses to launder it into a valid-looking document.
- Only public-capable key types (`EC`, `OKP`, `RSA`) with their required public members; unknown
  `kty` or `use` values are rejected.
- The encoded identifier is size-bounded before any decoding or parsing.
- DIF error results (`invalidDid` with a diagnostic `message`); never throws.

## Usage

```ts
import { Resolver } from "did-resolver";
import { getResolver } from "@thisdid/jwk-did-resolver";

const resolver = new Resolver(getResolver());
const result = await resolver.resolve(
  "did:jwk:eyJjcnYiOiJQLTI1NiIsImt0eSI6IkVDIiwieCI6ImFjYklRaXVNczNpOF91c3pFakoydHBUdFJNNEVVM3l6OTFQSDZDZEgyVjAiLCJ5IjoiX0tjeUxqOXZXTXB0bm1LdG00NkdxRHo4d2Y3NEk1TEtncmwyR3pIM25TRSJ9",
);
```

## License

Apache-2.0
