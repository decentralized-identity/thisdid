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
is **stricter than the first-party reference on hostile input**: mandatory
UPDATE authorization by the version's own key (unauthenticated delegation is
not honored), a revocation check that fails closed, log-topology bounds
including dangling-reference rejection, validated Ed25519 key framing (both the
multihash `0xed 0x20` and varint `0xed 0x01` framings the reference emits are
accepted; anything else is rejected), an SSRF policy on repository fetches
(including IPv4-mapped IPv6), validated rotation targets, **identity and
authority invariants** (the resolved `document.id` must exactly equal the
requested did:oyd URI, and the log-verified document/revocation keys must
survive as the authoritative `#key-doc`/`#key-rev` verification methods —
exact id, controller, type and key bytes, not mere byte membership — unless
an authenticated rotation was followed; so a payload can neither spoof a
foreign DID nor hide or demote the keys that control this one), and bounded,
crash-safe input handling (multibase length caps, out-of-range timestamps,
RFC 8785-invalid repository data — non-finite numbers, lone surrogates,
duplicate object members — rejected before hashing, status-driven error
classification with repository "revoked" honored only on HTTP 410) — all
failing closed. Every supported valid golden vector resolves unchanged; the one
intentional exception is delegation, which is not honored (a DID relying on a
delegated update key is deliberately rejected). The details and their
adversarial tests are in
[REFERENCE-MAP.md](./REFERENCE-MAP.md#security-hardening-stricter-than-the-reference-never-more-permissive).

**Pubkey-form identifiers (`did:oyd:z6M…`) are bound, not trusted.** A
pubkey-form identifier embeds a public key instead of a document hash; per spec
§3.2.4 that key must be a document key of the DID. This driver enforces that
membership across the verified version history — a correctly-minted pubkey-form
DID resolves, but one whose embedded key is in no version is rejected rather
than served on repository trust alone. One real DID exhibits the latter
(`did:oyd:z6MkrJVn…`): the reference (and thus the DIF Universal Resolver)
resolves it permissively, but its embedded key matches none of its own document
keys, so it is deliberately excluded from the live corpus and documented in
full in [OYD-DID-CORPUS.md](./OYD-DID-CORPUS.md) §"Excluded". Its self-certifying
hash-form twin resolves identically to the reference, so the DID itself is not
lost — only the unbound alias is refused.

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

Two further host opt-ins, both **OFF by default so default resolution stays
reference-parity**: `getResolver({ strictRevocationSig: true })` additionally
requires each honored REVOKE to be **signed by the version's revocation key**
(spec §4.2.3) and to **commit to the version it revokes** — its `doc` must be
the hash of the revoked version's document and key (spec §4.1; preimage
verified against real repository data). A revocation failing either check is
rejected rather than honored on the hash commitment alone (defense-in-depth
for a verifier that will not trust issuance history; every real
REVOKE-bearing corpus DID passes both checks, and a repository/MITM still
cannot forge a revocation either way). And
`getResolver({ maxLogEntries, maxPreviousRefs })` overrides the resource bounds
(exceeding one is an `internalError` service limit, not `invalidDidDocument`),
while `getResolver({ repositoryPolicy })` tunes the SSRF policy (scheme list,
host allowlist, private-host toggle).

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
