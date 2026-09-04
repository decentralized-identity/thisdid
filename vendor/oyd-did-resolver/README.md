# @thisdid/oyd-did-resolver

did:oyd (OYDID) resolver for the DIF
[`did-resolver`](https://github.com/decentralized-identity/did-resolver)
interface — a TypeScript transliteration of OwnYourData's Ruby reference
implementation. Its goal is **reference-compatible OYDID resolution within a
documented profile** (Ed25519 / SHA-256 / base58btc), performed locally:

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

This is **not a claim of unconditional OYD-spec conformance**: within the
declared profile it aims to match the reference resolver's behavior (plus the
fail-closed hardening below), and inputs outside that profile are rejected, not
resolved. Where the reference implementation and the prose spec differ, the
[Deliberate deviations](./REFERENCE-MAP.md) list records which one this package
follows and why.

Because it resolves attacker-influenced logs from arbitrary repositories, it
is **stricter than the first-party reference on hostile input** — a stance
the method author confirmed when adjudicating every divergence this driver
raised, in a report shared with them during close collaboration, with the
reference adopting this driver's document-key-only update-authorization rule
in gem 0.9.4 and its repeat-collapse at log ingestion in gem 0.9.5. The
checks: UPDATE succession by the author's valid-survivor rule (every
candidate signature-verified against the superseded version's own key; junk
appends ignored, genuine forks rejected as ambiguous; delegation not
honored), **default-on revocation verification** (the REVOKE's signature
must verify against the revocation key AND its `doc` must commit to the
revoked version's `{doc, key}` — author-confirmed preimage, all 1,117
production revocations pass), **cryptographically confirmed deactivation** (a
repository 410 is a hint: the still-served records are walked and verified
before `deactivated` is reported), log-topology bounds including
dangling-reference rejection, validated Ed25519 key framing (canonical
varint `0xed 0x01` plus the legacy `0xed 0x20`; anything else rejected), an
SSRF policy on repository fetches (including IPv4-mapped IPv6), validated
rotation targets, **identity and authority invariants** (the resolved
`document.id` must exactly equal the requested did:oyd URI, and the
log-verified keys must survive as the authoritative `#key-doc`/`#key-rev`
methods — exact id, controller, type and key bytes — unless an
authenticated rotation was followed), and bounded, crash-safe input
handling (multibase length caps, out-of-range timestamps, RFC 8785-invalid
repository data — non-finite numbers, lone surrogates, duplicate object
members — rejected before hashing, status-driven error classification) —
all failing closed. Every supported valid golden vector and every live
corpus DID resolves unchanged. The details and their adversarial tests are
in
[REFERENCE-MAP.md](./REFERENCE-MAP.md#security-hardening-stricter-than-the-reference-never-more-permissive).

**Pubkey-form identifiers (`did:oyd:z6M…`) follow the author's ruling: a
repository lookup, not self-certifying.** Callers needing self-certification
use the hash form (a hash-form id is a commitment over the whole record).
By default a pubkey-form id therefore resolves exactly as the reference
resolves it; `getResolver({ strictPubkeyBinding: true })` opts into the
stricter §3.2.4 binding, requiring the embedded key to be a document key of
the DID's verified history — which rejects repository-trust-only aliases
(exactly one exists in production; history in
[OYD-DID-CORPUS.md](./OYD-DID-CORPUS.md)).

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

Further host options: `strictRevocationSig` is **ON by default** (the
author's rulings made revocation-key signature + doc-commitment
verification mandatory; `getResolver({ strictRevocationSig: false })` opts
out into legacy pre-0.9.4 parity, e.g. for differential testing).
`getResolver({ strictPubkeyBinding: true })` opts INTO the §3.2.4
pubkey-form binding (off by default per the ruling described above).
`getResolver({ maxLogEntries, maxPreviousRefs })` overrides the resource
bounds (exceeding one is an `internalError` service limit, not
`invalidDidDocument`), and `getResolver({ repositoryPolicy })` tunes the
SSRF policy (scheme list, host allowlist, private-host toggle).

Three reference points are kept distinct. The **transliteration source** is
the pinned commit
[OwnYourData/oydid@48a62c9](https://github.com/OwnYourData/oydid/tree/48a62c9c67d63a316bf2ca507babfc59ae4f48e3)
(Ruby gem 0.9.1) this code was ported from. The **behavioral-parity target** is
the hosted resolver `resolver.ownyourdata.eu`, which the DIF Universal Resolver
proxies `did:oyd` to (rather than running a dedicated container) — the golden
vectors are captured from it and the live corpus diffs against it, and its
deployed driver/spec version may differ from the pinned gem. The **normative
target** is the [OYDID method specification
v0.6](https://ownyourdata.github.io/oydid/). The function-by-function
correspondence — file:line citations, spec-section anchors, and every
deliberate deviation — is documented in [REFERENCE-MAP.md](./REFERENCE-MAP.md),
together with the re-verification procedure.
