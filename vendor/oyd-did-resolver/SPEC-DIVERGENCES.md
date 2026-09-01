# OYDID: spec ⇔ implementation divergences — adjudication requests

**To:** the OYDID method author (OwnYourData)
**From:** the thisDID TypeScript `did:oyd` driver (`@thisdid/oyd-did-resolver`)
**Date:** 2026-09-01

While building an independent TypeScript resolver for `did:oyd` — a 1:1
transliteration of the Ruby reference implementation, pinned at
[`OwnYourData/oydid@48a62c9`](https://github.com/OwnYourData/oydid/tree/48a62c9c67d63a316bf2ca507babfc59ae4f48e3)
(gem 0.9.1), against the
[method specification v0.6](https://ownyourdata.github.io/oydid/) — we found a
number of places where the **spec's literal text**, the **reference
implementation's behavior**, and the **data actually stored in the public
repository** disagree with each other. Any independent implementation must
pick a side per issue; we would like your ruling on which behaviors are
normative.

This is **not a bug report against the reference** — several items are places
where the reference is deliberately tolerant (legacy support). We need to
know which of those tolerances are part of the method's contract and which
are incidental.

Every claim below was verified live against `resolver.ownyourdata.eu` /
`oydid.ownyourdata.eu` between 2026-08-30 and 2026-09-01; the appendix lists
the exact DIDs and computations so everything is reproducible.

Our driver's current position, for context: **default behavior follows the
reference implementation** (so a DID that resolves on your resolver — and
therefore on the DIF Universal Resolver, which proxies `did:oyd` to it —
resolves identically here), with stricter checks available as explicit
opt-ins. Where we reject something the reference accepts, it is enumerated
here and in the package's `REFERENCE-MAP.md`.

---

## D1 — CREATE signature: mandatory or legacy-optional?

- **Spec** (§4.1 `#log_ops`): CREATE — _"doc: hash of DID Document; **sig:
  doc signed by private document key**"_. §3.2 resolution verifies it.
- **Reference:** tolerates a missing CREATE signature (the comment at
  `ruby-gem/lib/oydid/log.rb:314` explains DIDs created before
  Client-Managed-Secret-Mode gained its signature collection phase carry
  none).
- **This driver:** tolerant by default (reference parity); a strict opt-in
  rejects unsigned CREATEs. Signatures that _are_ present are always
  verified.

**Question:** is the unsigned-CREATE tolerance a permanent part of the
method (legacy DIDs must remain resolvable forever), or a transitional
measure that independent resolvers may/should drop?

## D2 — REVOKE signature: verified at resolution or not?

- **Spec** (§4.1): REVOKE — _"**sig: doc signed by private revocation
  key**"_; §4.2.3 `#verify_signature`.
- **Reference:** locates the REVOKE via the TERMINATE hash commitment and
  never verifies its signature at resolution time.
- **This driver:** same by default; `strictRevocationSig` opt-in verifies it.
- **Evidence:** the real revoked chain in the appendix has a REVOKE whose
  signature verifies correctly against the version's revocation key — so
  properly-written DIDs would pass a mandatory check.
- **Consequence of not checking:** the TERMINATE→REVOKE hash commitment
  proves the REVOKE was _precommitted at creation_, but not that the
  _revocation key_ authorized it. A creator holding only the document key
  can precommit a REVOKE with a garbage signature; publishing it later
  deactivates the DID with no proof anyone ever held the revocation key.
  (An outside party still cannot forge a revocation — that would need a
  SHA-256 second preimage.)

**Question:** is resolution-time REVOKE signature verification intended to
be mandatory? Is the document-key / revocation-key authority separation a
security property of the method, or is "whoever created the DID may
precommit its revocation" acceptable?

## D3 — REVOKE `doc` commitment: is `hash({doc, key})` normative?

- **Spec** (§4.1): REVOKE — _"doc: **hash of doc and key in DID
  Document**"_.
- **Reference:** does not recompute or compare this hash at resolution.
- **Observed data:** we determined the preimage empirically. For the real
  chain in the appendix:

  ```
  REVOKE.doc  ==  multi_hash( canonical( { "doc": <record.doc>, "key": <record.key> } ) )
  ```

  i.e. the canonical JSON of the revoked version's record restricted to its
  `doc` and `key` members, hashed with the same options as log entries. The
  computed value matches the stored `REVOKE.doc` exactly.

- **This driver:** now enforces it under the strict opt-in
  (`strictRevocationSig`, together with the D2 signature check): a
  rev-key-signed REVOKE whose `doc` does not commit to the revoked version
  is rejected. Every real REVOKE-bearing DID in our corpus passes both
  checks live. The default performs neither check (reference parity).

**Questions:** (a) please confirm the preimage format above is the intended
one; (b) should resolvers reject a REVOKE whose `doc` is not the hash of the
version it revokes — and do any legacy DIDs exist that would fail such a
check?

## D4 — exactly one UPDATE successor?

- **Spec** (§3.2 `#read`, step 6): the repository must retrieve **exactly
  one** UPDATE following a REVOKE.
- **Reference:** takes the **first** UPDATE whose `previous` references the
  REVOKE and stops; multiple candidates are not rejected as ambiguous.
- **This driver:** first-match (reference parity).

**Question:** should an independent resolver treat multiple valid UPDATE
successors as an error (ambiguous fork), or is first-match the intended
resolution rule?

## D5 — operation-specific `previous` semantics: normative or descriptive?

- **Spec** (§4.1): each operation's `previous` is constrained — e.g.
  TERMINATE _"can reference Clone or Delegate log entries"_, REVOKE _"can
  reference 'Create' or 'Update' and always 'Terminate'"_, CREATE _"has only
  a reference when created using clone"_.
- **Reference:** builds a generic hash-reference graph; predecessor types
  and cardinality are not enforced.
- **This driver:** generic graph (parity), with added structural checks
  (duplicate-hash and dangling-reference rejection, bounded sizes).

**Question:** are the §4.1 `previous` rules normative constraints a resolver
should enforce, or descriptive of what the write path produces?

## D6 — CLONE (op=4): expected of resolvers?

- **Spec** (§4.1): defines CLONE, whose `previous` references an entry of
  **another** DID's log (a cross-DID reference).
- **Reference:** its own `dag_update` has no CLONE case — a log containing
  one fails resolution.
- **This driver:** the same (both reject at the op level). Our
  dangling-reference check also assumes all `previous` hashes resolve within
  the returned log, which is true for every op both implementations
  actually resolve — but contradicts CLONE's definition.

**Question:** is CLONE resolution expected of independent resolvers, or is
it a write-path/availability feature outside the resolution contract? If it
is expected: is there a specification of the retrieval + verification rule
for the external predecessor, and a positive test vector?

## D7 — DELEGATE (op=5): what authenticates a delegate key?

- **Spec** (§4.1): defines DELEGATE.
- **Reference:** derives delegated keys from the raw log **without
  authenticating the DELEGATE entries** — its own code flags this `!!!OPEN`.
- **This driver:** delegation is not honored at all (fail closed): update
  authorization uses only the version's own document key, so a DID relying
  on a delegated update key does not resolve here.

**Question:** what is the intended authorization rule for DELEGATE entries
(who must sign them, connected how), and can a reference-generated positive
vector be published? Until then, is fail-closed rejection the behavior you
would recommend for independent verifiers?

## D8 — pubkey-form identifiers (§3.2.4) and `did:oyd:z6MkrJVn…`

- **Spec** (§3.2.4 `#pubkey_identifier`): a pubkey-form identifier uses the
  document public key as identifier — i.e. the embedded key should be a
  document key of the DID.
- **Reference:** resolves a pubkey-form id by repository lookup without
  checking the embedded key against the document's keys (a legacy
  permissive path).
- **Observed data:** `did:oyd:z6MkrJVnaZkeFzdQyMZu1cgjg7k1pZZ6pvBQ7XJPt4swbTQ2`
  resolves on your resolver, but comparing raw key bytes (framing
  normalized), its embedded key matches **neither** the document key nor the
  revocation key of the document it resolves to, and the DID is
  single-version, so it is in no version's history:

  ```
  identifier key : b00d8d938e7f773d51565aad36a623f5344f7f5d1960f9cf3e8e12620ea2810f
  #key-doc       : f71e7d7d6d1723d4dd248c4a4fd209e1c1f6e886f99d2bea7f0dcdee79f8e285
  #key-rev       : 0a3be56be8218c94a6a80e73f8d7fb289600c6c1fe7a0d6a5208a255775e91ee
  ```

  Its `alsoKnownAs` twin `did:oyd:zQmYSydHP5A1nRuqMcAoxpb971mfJrKJxpGJPEsxc5mw5Wt`
  is hash-form, self-certifying, and resolves identically in both
  implementations — so the DID itself is fully usable through its hash-form
  identifier.

- **This driver:** enforces the §3.2.4 binding across the verified version
  history (either Ed25519 framing, compared on raw bytes) and therefore
  rejects `z6MkrJVn…` as `invalidDidDocument`.

**Questions:** (a) is `z6MkrJVn…` a pre-spec legacy artifact (e.g. an alias
minted from the wrong key) kept working for compatibility, or is there an
intended binding under which its key belongs to the DID? (b) roughly how
many such repository-trust-only pubkey-form aliases exist (we cannot
enumerate the repository from outside)? (c) do you agree the binding check
is the correct behavior for well-formed pubkey-form ids?

## D9 — two Ed25519 key framings in the wild

- **Observed data:** real DIDs carry Ed25519 public keys under two
  multicodec framings — multihash-style code+length (`0xed 0x20 <32B>`) and
  varint multicodec / did:key-style (`0xed 0x01 <32B>`). The revoked DPP
  chain in the appendix is varint-framed; most other DIDs are `0xed 0x20`.
- **Reference:** decodes permissively — `code = byte[0]`,
  `key = last 32 bytes`, middle byte ignored.
- **This driver:** accepts exactly these two framings (rejecting any other
  length byte or size), and preserves the original framing wherever a hash
  or comparison is computed over the framed key.

**Question:** which framing is canonical going forward, and is dual-framing
acceptance officially part of the method (worth stating in the spec)?

## D10 — repository-asserted deactivation

- **Observed:** for a deactivated DID the repository answers
  `HTTP 410` + `{"error":"revoked"}` to `/doc/{id}`, and the reference
  resolver reports `deactivated: true` on that basis — without the client
  walking the log.
- **This driver:** honors the `"revoked"` assertion **only on HTTP 410**
  (the same body on any other status is treated as a transport error), and
  independently detects revocation from the log when it resolves the chain
  itself.

**Question:** is repository-asserted deactivation (410) intended to be
trusted by resolvers without log proof, or should an independent verifier
confirm the published REVOKE cryptographically before reporting
`deactivated: true`?

## D11 — `%40` vs `@` in location references

- **Spec** (§2 `#format`): defines `%40` as the W3C-conform representation
  of `@`.
- **Reference:** `read` splits the document's log reference on `@` only
  (its `dag_update` handles both forms).
- **This driver:** recognizes both forms in both places.

**Question:** trivial, but worth confirming: both forms are equivalent
everywhere a location can appear?

---

## Driver profile notes (context, no ruling needed)

For completeness — deliberate limits of this driver that are **not** spec
questions, documented in its `REFERENCE-MAP.md`:

- Supported profile: Ed25519 / SHA-256 / base58btc. Other codecs, digests
  and encodings named by multiformats are rejected with a distinct error
  (`representationNotSupported`), never mis-resolved.
- Runs in environments without a filesystem (Cloudflare Workers), so
  local-file repositories are unsupported; repository fetches are
  https-only by default behind an SSRF policy (overridable by the host).
- Resource bounds (log length, back-references per entry) exist as
  DoS protection; they are far above anything observed in real data and
  configurable by the host.
- `sig: null` / missing `previous` are accepted as the repository emits
  them.

---

## Appendix — evidence & reproduction

All live checks performed 2026-08-30 … 2026-09-01.

**Parity corpus** (resolve identically in the reference resolver and this
driver, `didDocument` + `didDocumentMetadata` compared field-for-field):

```
did:oyd:zQmaBZTghndXTgxNwfbdpVLWdFf6faYE4oeuN2zzXdQt1kh   single-version
did:oyd:zQmdXNRiMWEYTiYF58a9BaiUkfB2xWUgL7G7ozyCCNPqjKV   updated, original id
did:oyd:zQmeArtmfxJ1JB6CXvoFdcQCyxPcYii5DUTBR44g4xYpCLR   updated, updated id
did:oyd:zQmYhESMRSvN9BkrCf7YcBfxNzigVphyBUbFMfJpEm1fdPF   spec sample
did:oyd:zQmTxrzHj3vJ4SmWm9a2gB6q3JdshvBLbxmU9j1Z4y9tPP2
did:oyd:zQmYSydHP5A1nRuqMcAoxpb971mfJrKJxpGJPEsxc5mw5Wt
did:oyd:zQmNauTUUdkpi5TcrTZ2524SKM8dJAzuuw4xfW13iHrtY1W%40did2.data-container.net
did:oyd:zQmSE1hzumtZ7AoK1qhHf4t5kiKsujMsJSHqoXtWrdd7K7W   updated DPP, varint keys
did:oyd:zQmfEb3KgYZjZUPLTHPmFPdcV6peF5itB5NmJ9N6gaxxE8K   same chain, updated id
did:oyd:zQmQMvhHrccgcP2XzE2rM4E8MDx9P8D5FWPdDF1DTPikF4F   deactivated (410)
```

**D3 preimage check** (chain `zQmSE1h…`):

1. `GET https://resolver.ownyourdata.eu/1.0/identifiers/did:oyd:zQmSE1h…` →
   `didDocumentMetadata.log`, the op=1 entry has
   `doc = zQmUfSprcoonF4jm1CpEDarmbDBYhiR4b3sWTEBpnKgCVbN`.
2. `GET https://oydid.ownyourdata.eu/doc_raw/zQmSE1h…` → the v1 record
   `{doc, key, log}`.
3. `multi_hash(canonical({"doc": record.doc, "key": record.key}))` (same
   digest/encoding options as log-entry hashing) equals the value in step 1.
4. The same op=1 entry's `sig` verifies as an Ed25519 signature over its
   `doc` string with `record.key.split(":")[1]` (the revocation key) — D2's
   evidence.

**D8 byte comparison** (`z6MkrJVn…`): base58-decode the identifier
(varint-framed, `0xed 0x01` + 32 bytes) and each `publicKeyMultibase` of the
resolved document (`0xed 0x20` + 32 bytes); compare the trailing 32 raw
bytes. Values listed under D8.

**Driver test suites:** the package ships an offline suite (72 tests:
golden vectors captured from the reference deployment + adversarial vectors
minted with real Ed25519 keys) and an opt-in live corpus
(`OYD_LIVE=1`, diffs each DID above against `resolver.ownyourdata.eu`).
