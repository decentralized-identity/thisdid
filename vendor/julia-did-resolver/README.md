# @thisdid/julia-did-resolver

A `did:julia` resolver for the DIF
[`did-resolver`](https://github.com/decentralized-identity/did-resolver)
interface — Chia singleton state read from any full node RPC and proven by
recomputing the singleton's own puzzle hash. Keyless, no secrets, and no CLVM
engine: `@noble/hashes` (SHA-256) is the only runtime dependency besides the
resolver core.

**Upstream:** the canonical implementation, the method specification, the
Python reference resolver, and the shared fixtures live in
[`julia-social/did-julia`](https://github.com/julia-social/did-julia). This is
a vendored copy of `ts/` from that repository (the package is not published to
npm, so the wrapper shape used by `webvh`/`plc` is not available yet — see
*Exit criteria*).

## What it implements

- **Identifier validation by decoding** (spec §5.2): base58, Bitcoin alphabet,
  no checksum, decoding to exactly 32 octets — the DID's singleton launcher ID.
  did:julia identifiers are 43 or 44 characters and the spec forbids validating
  by length, so a short decoding is rejected, never left-padded.
- **Singleton traversal** (spec §7.2): the launcher coin, then the odd-amount
  child of each spend, to the unspent current coin. Coinset's
  `POST /get_singleton_info` extension is a **fast path** when the configured
  endpoint serves it (one call, rather than two per generation); any node that
  does not serve it falls back to the portable walk. Both paths were verified
  live to produce identical results for both canary DIDs.
- **State derivation without CLVM execution.** `julia_did` re-emits the next
  generation's eight-slot state in a `REMARK` condition, which the reference
  resolver reads by *executing* the spend on the consensus VM. No RPC anywhere
  serves parsed conditions, and running a consensus-exact VM in workerd means
  shipping a WASM build whose operator set and hardfork flags must track
  mainnet forever. Instead this driver derives the state: every solution
  reveals the spend's own pre-spend state verbatim (`julia_did`'s parameters
  are `(CURRIED-ARGS-HASH curried-args parent-info solution)`), only six
  sub-puzzles rewrite state, each as a pure function of that state plus values
  in the same solution, and at most one may run per spend (spec §7.3).
- **DID Document construction** (spec §8): the `did/v1`,
  `security/multikey/v1`, and `https://not.bot/ns/did-julia/v1` contexts,
  Multikey verification methods (multicodec `0xea 0x01` + a 48-octet BLS12-381
  G1 key), content-addressed fragments, and the method's `juliaAuthentication`
  / `juliaCustodians` / `juliaRecovery` / `juliaRecoveryPending` /
  `juliaDocumentPointer` properties. Deactivation (§7.4) recognizes both the
  null encoding and the protocol's inert-tree sentinels, which are derived from
  the all-zero leaf rather than hardcoded.
- **Version-specific resolution** (spec §7.2.1): `versionId` — the coin id of a
  singleton generation — and `versionTime` walk the DID's lineage and answer
  for the generation the caller named. A superseded generation reveals its own
  pre-spend state in its own spend, so history is served under the same
  puzzle-hash commitment current state is, with no transition replayed; the
  result carries `created`, plus `nextVersionId` / `nextUpdate` when the
  version has been superseded. The two options are mutually exclusive, as DID
  Resolution requires. See
  [ADR 0004](https://github.com/julia-social/did-julia/blob/main/ts/docs/adr/0004-version-specific-resolution.md).

Not implemented, and **refused rather than faked**: every representation but
one. An `accept` this resolver cannot produce
returns the standard `representationNotSupported` rather than
`application/did+ld+json` under another name. Per RFC 9110 §12.5.1 that includes an
`accept` naming the JSON-LD type with `q=0` ("not acceptable", not a weak
preference) and one naming a media parameter the representation does not carry,
such as a JSON-LD `profile` this resolver does not emit; parameters after `q`
are accept extensions and are ignored. The most specific matching range decides,
so `application/did+ld+json, */*;q=0` is still served — answering a question the caller
did not ask is the one failure they cannot detect. Also not implemented: DID URL
dereferencing — including the version-specific form (`?versionId=…#fragment`) —
and multi-key Merkle-path replay for verification-method
enumeration — a v1 limitation shared with the reference resolver, visible in
the multi-class organization canary, which publishes its authentication
commitment and no verification methods.

## Trust model and fail-closed behavior

**What the DID itself proves.** A Chia coin id is the hash of the coin's own
fields, and a did:julia identifier *is* a singleton launcher coin id, so the
back of the lineage is checkable rather than trusted. Every RPC record is
verified against the identifier it was requested by — a coin record must hash
back to the requested coin id, children must carry the requested parent, a
spend must be a spend of the coin asked for. Every spend must carry a
`parent-info` that re-derives the DID's launcher ID, the same check `julia_did`
performs on chain before consensus will honour a spend; and because
`parent-info` carries `sha256tree` of the genesis key rather than the key
itself, **the DID string commits to its genesis public key**, which no endpoint
can forge. The revealed pre-spend state must match the `CURRIED-ARGS-HASH` the
spend's own authenticated puzzle commits to, and the state served must
recompute to the puzzle hash of the coin reported unspent — so an endpoint that
answers *inconsistently* is caught. A key becomes a verification method only
when its membership in the current authentication Merkle root is provable
(spec §8.2).

**What it does not prove — the trust boundary.** Nothing in a bare Chia RPC
response proves a coin was ever created on chain. The endpoint is **trusted for
the DID's current state**: one that fabricates a *coherent* lineage forward
from the real launcher is not detected, and detecting it would need
block-level verification (headers and inclusion proofs, i.e. a light client),
which this driver does not do and does not claim to. The checks above eliminate
the incoherent forgeries and every buggy-proxy and wrong-record case; they do
not make a hostile endpoint harmless. `JULIA_RPC_URL` exists so a deployment
can point at a node it trusts — the open Coinset default is a zero-configuration
convenience, not a security assumption.

**An outage is never an answer.** `notFound` is returned only when the node
itself reports the coin absent, recognized from a known structured code or a
message anchored to the coin record — never a free-text search for "not found",
which would read a proxy's "upstream service not found" as authoritative
absence. Every other failure — transport, timeout, non-2xx, oversized,
non-JSON, or a record failing the linkage checks — raises `internalError`,
which the mother Worker treats as transport-class. `notFound` is a semantic
verdict the mother stops the chain on and records, so an unreachable node must
never become an authoritative claim that a DID does not exist. Response bodies
are bounded *while streaming*, and an oversized `content-length` is rejected
before a chunk is read.

**Fail-closed:** a spend for which no known transition reproduces the chain's
commitment returns `didResolutionMetadata.error = "unverifiableState"`. Nothing
is guessed and nothing is served unverified. Solution shapes are
puzzle-version-specific, so this is the honest outcome for a DID whose most
recent spend rewrote state under a `julia_did` puzzle version predating this
driver; `didResolutionMetadata["did:julia:currentPuzzle"]` reports that
condition explicitly, and DIDs on older puzzles still resolve when their last
spend changed no state.

## Test provenance

Two independent bodies of ground truth, both replayed offline:

- **Recorded mainnet RPC traffic** for both canary DIDs, with the resolution
  results the Python reference resolver produced from them. The suite asserts
  **byte equivalence**, key order included, against those recorded results —
  the same fixture files the Python suite replays. No recording carries a
  `get_singleton_info` response, so every fixture test also exercises the
  portable traversal.
- **Compiled-puzzle transition vectors**: 18 recorded input/output pairs
  produced by executing the real compiled `julia_did` sub-puzzles on the
  consensus VM through the chialisp toolchain
  ([`julia-social/julia_did_chialisp`](https://github.com/julia-social/julia_did_chialisp)
  @ `7fbc6bc`, chialisp 0.4.5), using each puzzle's own test environment. All
  six state-changing operations are covered, including two adversarial cases
  pinning inputs the puzzles deliberately ignore.

Live end-to-end, 26 Aug 2026: both canary DIDs resolved against
`api.coinset.org` through the fast path and through the portable traversal, and
both outputs diffed identical to the Python reference resolver's live output.

Canaries: `did:julia:ArD2JyqfkVVbT9Liegqu4jcfBEXtHnPofmF2rsBuq1TX`
(single-key personal alias) and
`did:julia:BqJasSrzc9aGJmU4U3A2z4XrqozAAMiMhnqHaq4F2cDc` (the production Julia
Social DID, multi-class multisig).

## Configuration

Keyless. `JULIA_RPC_URL` optionally repoints the driver at another Chia full
node; the default is the open Coinset mainnet endpoint. `useSingletonInfo`
disables the Coinset fast path for nodes that do not serve it (the driver also
stops asking automatically after one failure).

## Exit criteria

Retire this vendored copy in favour of a thin wrapper — the `webvh`/`plc` shape
— once `@julia-social/did-julia-resolver` is published to npm from
[`julia-social/did-julia`](https://github.com/julia-social/did-julia); the
implementation would be unchanged. Retire the package entirely if the DIF
ecosystem gains a maintained, workerd-compatible did:julia driver from another
source. Until then the Chia chain and the `julia_did` puzzles are the source of
truth this package must keep matching: re-derive the transition vectors
whenever the puzzles are recompiled, and add a transition here if the protocol
ever gains a seventh state-changing operation — until it is added, such a spend
fails closed rather than resolving incorrectly.

Design decisions are recorded upstream:
[ADR 0001 — derive state instead of executing CLVM](https://github.com/julia-social/did-julia/blob/main/ts/docs/adr/0001-state-derivation-without-clvm.md),
[ADR 0002 — package custody](https://github.com/julia-social/did-julia/blob/main/ts/docs/adr/0002-package-custody-and-distribution.md),
[ADR 0003 — verification scope](https://github.com/julia-social/did-julia/blob/main/ts/docs/adr/0003-verification-scope-v1.md).
