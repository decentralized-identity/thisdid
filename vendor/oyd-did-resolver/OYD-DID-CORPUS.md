# Real-world did:oyd corpus

Actual `did:oyd` identifiers discovered in OwnYourData's repositories and the
method specification, each verified live against the reference resolver
(`resolver.ownyourdata.eu`) on 2026-08-30. They drive the opt-in live test
`src/__tests__/real.test.ts`:

```bash
pnpm run test:live        # OYD_LIVE=1 vitest run — hits the network
```

The offline golden-vector suite never touches the network; this list is the
real-world / regression layer on top of it.

## Resolves identically to the reference (10)

| DID                                                                                 | shape                             |
| ----------------------------------------------------------------------------------- | --------------------------------- |
| `did:oyd:zQmaBZTghndXTgxNwfbdpVLWdFf6faYE4oeuN2zzXdQt1kh`                           | single-version canary             |
| `did:oyd:zQmdXNRiMWEYTiYF58a9BaiUkfB2xWUgL7G7ozyCCNPqjKV`                           | updated DID, original identifier  |
| `did:oyd:zQmeArtmfxJ1JB6CXvoFdcQCyxPcYii5DUTBR44g4xYpCLR`                           | updated DID, updated identifier   |
| `did:oyd:zQmYhESMRSvN9BkrCf7YcBfxNzigVphyBUbFMfJpEm1fdPF`                           | spec verification example         |
| `did:oyd:zQmTxrzHj3vJ4SmWm9a2gB6q3JdshvBLbxmU9j1Z4y9tPP2`                           | —                                 |
| `did:oyd:zQmYSydHP5A1nRuqMcAoxpb971mfJrKJxpGJPEsxc5mw5Wt`                           | —                                 |
| `did:oyd:zQmNauTUUdkpi5TcrTZ2524SKM8dJAzuuw4xfW13iHrtY1W%40did2.data-container.net` | non-default location              |
| `did:oyd:zQmSE1hzumtZ7AoK1qhHf4t5kiKsujMsJSHqoXtWrdd7K7W`                           | updated DPP DID, varint key frame |
| `did:oyd:zQmfEb3KgYZjZUPLTHPmFPdcV6peF5itB5NmJ9N6gaxxE8K`                           | same chain, updated identifier    |
| `did:oyd:z6MkrJVnaZkeFzdQyMZu1cgjg7k1pZZ6pvBQ7XJPt4swbTQ2`                          | pubkey-form alias (see below)     |

For each, `didDocument` **and** `didDocumentMetadata` match the reference
field-for-field (deep structural equality via `toEqual`, not raw-byte
serialization). The deactivation case below asserts only the `deactivated`
flag, not full-document equality.

The last two (a live Digital Product Passport DID and its updated identifier)
resolved only after the key-framing fix below — their keys are varint-framed
(`0xed 0x01`), which an earlier over-strict check rejected.

## Deactivated (1)

| DID                                                       |                                      |
| --------------------------------------------------------- | ------------------------------------ |
| `did:oyd:zQmQMvhHrccgcP2XzE2rM4E8MDx9P8D5FWPdDF1DTPikF4F` | revoked → `deactivated: true` (both) |

## The `z6MkrJVn…` case — settled by the method author

`did:oyd:z6MkrJVnaZkeFzdQyMZu1cgjg7k1pZZ6pvBQ7XJPt4swbTQ2` was originally
**excluded** from this corpus: its embedded key is in no document version of
its own DID, and this driver's then-default §3.2.4 binding rejected what the
reference resolves. The question went to the method author during close
collaboration, and their ruling settled it: **the pubkey form is a
repository lookup, explicitly not self-certifying** — callers needing
self-certification use the hash form — and this id is a pre-spec artifact,
**the only such row in the entire production store**. The spec is being
updated to say so. Accordingly the driver's default now resolves it exactly
as the reference does (it sits in the parity table above), and the stricter
binding survives as the `strictPubkeyBinding` opt-in, still covered
offline and deterministically (see the end of this section). The forensics
below are kept as the record that motivated the ruling.

**What the DID is.** A _pubkey-form_ identifier — the id embeds an Ed25519
public key (`0xed 0x01` varint framing) rather than a document hash.

**What it resolves to.** A single-version document whose two keys are
multihash-framed (`0xed 0x20`), plus an `alsoKnownAs` pointing to
`did:oyd:zQmYSydHP5A1nRuqMcAoxpb971mfJrKJxpGJPEsxc5mw5Wt`. (The byte-level
key comparison is kept as private audit evidence rather than published here;
it is reproducible from the recipe at the end of this section.)

**The finding.** Normalising the framing away and comparing raw bytes, the
identifier's key (`b00d…`) equals **neither** document key, and the DID is
single-version (no rotation), so it is in **no** version of the chain. Spec
§3.2.4 binds a pubkey-form identifier to a document key in the DID's history;
here there is no such binding, so nothing cryptographically ties the identifier
to the document. The reference serves it anyway on **repository trust** — it
looks the id up in OwnYourData's own repository and returns the record without
checking the embedded key is a document key (this id lived in the reference's
`HACK` block). An independent verifier reading an arbitrary repository cannot
reproduce that trust. `b00d…` is most likely a _minting artifact_ (the alias
was created from the wrong key), not a document key.

**Its `alsoKnownAs` twin remains the self-certifying route.** The twin
`did:oyd:zQmYSyd…` is the **hash-form** identifier of the very same DID — it is
self-certifying (id = multihash of the record), it is in the parity table
above, and this driver resolves it to a structurally identical document
(deep-equality) against the reference. The same DID document is fully
resolvable through its proper identifier.

**How the binding is covered.** `resolver.test.ts` → "pubkey-form
identifiers (spec §3.2.4 binding)" mints, offline and deterministically:
by DEFAULT the unbound (`z6MkrJVn`) shape resolves via repository lookup
exactly as the reference resolves it, and under
`getResolver({ strictPubkeyBinding: true })` (a) a pubkey-form DID whose key
**is** a document key resolves, while (b) the unbound shape and a
rev-key-addressed id are rejected `invalidDidDocument`. Both directions of
the §3.2.4 binding stay network-free regression tests.

**The former open questions — answered by the ruling:** it IS a
pre-spec artifact (an alias minted from a key that is not the document's),
kept resolvable for compatibility; there is **exactly one** such row in the
entire production store; and the binding check is a legitimate strict
option, not a conformance requirement — the spec will state that the pubkey
form is not self-certifying.

## Bugs this corpus caught (fixed)

Testing real DIDs exposed two real defects — both fixed, both now guarded by
the parity DIDs above (and, for the framing, an offline regression test):

1. **Log fetched from the wrong endpoint.** `read` fetched the provenance log
   from `/log/{didHash}` instead of `/log/{document.log-hash}` (⇔ the
   reference's `retrieve_log(log_hash, …)`, `oydid.rb:87`). For hash-form DIDs
   the DID-hash endpoint happens to be populated, but a pubkey-form DID's log
   lives only at the log-hash endpoint, so resolution failed with "0 CREATE
   entries". Fixed in `read.ts`.
2. **Over-strict key framing.** The Ed25519 decode required the multihash
   length byte `0x20` and rejected the varint multicodec framing `0xed 0x01`,
   which the reference gem emits and which the reference decodes on
   `code = byte[0]`, `key = last 32 bytes` (ignoring the middle byte). Real
   DIDs whose keys are varint-framed (zQmSE1h / zQmfEb3K) were wrongly rejected
   as `invalidDidDocument`. Fixed in `basic.ts` `decodeEd25519PublicKey` /
   `ed25519KeyFramedHex` to accept both framings while still rejecting any
   other length byte or size. This also corrected an earlier misdiagnosis:
   these DIDs looked like an UPDATE-authorization divergence, but the whole
   chain verifies cleanly once the keys decode — the UPDATE **is** authorized
   by the version's own document key; no delegation is involved.

## How to refresh

Re-run `pnpm run test:live`. Every DID in the corpus is expected to pass; a
`PARITY` entry that starts failing means the reference output changed (or a
regression). The corpus was last re-validated against the gem 0.9.4
reference deployment (post-rulings). One further DID is a candidate for the
parity table once the author confirms its identifier and it resolves on both
sides.
