# @thisdid/oyd-did-resolver

did:oyd (OYDID) resolver for the DIF
[`did-resolver`](https://github.com/decentralized-identity/did-resolver)
interface — a TypeScript transliteration of OwnYourData's Ruby reference
implementation that performs the method's full verification locally:

- identifier ⇔ document hash commitment (multibase/multihash),
- provenance-log DAG construction and traversal (CREATE/UPDATE/REVOKE/
  TERMINATE/DELEGATE),
- log-reference commitments and Ed25519 signature checks on every hop,
- revocation detection (`deactivated`), version walking
  (`canonicalId`/`equivalentId`/`versionId`), and the reference resolver's
  W3C document composition — behaviorally compatible with
  resolver.ownyourdata.eu on the captured vectors, which include the spec's
  own published samples (single-version, updated via both identifiers,
  revoked, non-default location).

Because it resolves attacker-influenced logs from arbitrary repositories, it
is **stricter than the first-party reference on hostile input**: mandatory
UPDATE authorization by the version's own key (unauthenticated delegation is
not honored), a revocation check that fails closed, log-topology bounds
including dangling-reference rejection, strict Ed25519 key framing, an SSRF
policy on repository fetches, and validated rotation targets — all failing
closed. Every supported valid golden vector resolves unchanged; the one
intentional exception is delegation, which is not honored (a DID relying on a
delegated update key is deliberately rejected). The details and their
adversarial tests are in
[REFERENCE-MAP.md](./REFERENCE-MAP.md#security-hardening-beyond-the-reference).

Zero runtime dependencies beyond `did-resolver`; all crypto is WebCrypto
(Ed25519 + SHA-256), so it runs unchanged in Cloudflare Workers and Node 20+.

```ts
import { Resolver } from "did-resolver";
import { getResolver } from "@thisdid/oyd-did-resolver";

const resolver = new Resolver(getResolver());
const result = await resolver.resolve(
  "did:oyd:zQmaBZTghndXTgxNwfbdpVLWdFf6faYE4oeuN2zzXdQt1kh",
);
```

The package is fully standalone — it has no dependency on any resolver
service or hosting environment. A local host (e.g. a CLI) that registers
several drivers can additionally opt into DID-Rotation following, which the
package delivers through the host's own `Resolver` rather than any hardcoded
public endpoint, and can dereference DID-URL fragments with the exported
helper:

```ts
import { Resolver } from "did-resolver";
import { getResolver, dereferenceFragment } from "@thisdid/oyd-did-resolver";
import { getResolver as cheqd } from "@cheqd/did-provider-resolver"; // example

const resolver = new Resolver({
  ...getResolver({ followAlsoKnownAs: true }), // rotation via YOUR drivers
  ...cheqd(),
});
const { didDocument } = await resolver.resolve("did:oyd:zQm…");
const keyDoc = dereferenceFragment(didDocument, "key-doc");
```

The transliteration targets the [OYDID method specification
v0.6](https://ownyourdata.github.io/oydid/) and is pinned to
[OwnYourData/oydid@48a62c9](https://github.com/OwnYourData/oydid/tree/48a62c9c67d63a316bf2ca507babfc59ae4f48e3)
(gem 0.9.1). The function-by-function correspondence — file:line citations,
spec-section anchors, and every deliberate deviation — is documented in
[REFERENCE-MAP.md](./REFERENCE-MAP.md), together with the re-verification
procedure; golden test vectors are live captures from the reference
deployment.
