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

Not implemented, and reported rather than faked: `versionId` / `versionTime`
resolution, representations other than `application/did+ld+json`, DID URL
dereferencing, and multi-key Merkle-path replay for verification-method
enumeration — a v1 limitation shared with the reference resolver, visible in
the multi-class organization canary, which publishes its authentication
commitment and no verification methods.

## Trust model and fail-closed behavior

**The full node is a data source, not an authority.** It can withhold, in which
case resolution errors; it cannot forge.

The DID's method-specific identifier *is* the singleton launcher ID, so the
lineage walked is fixed by the identifier itself. State is served only when its
recomputed `singleton_top_layer_v1_1` puzzle hash equals the unspent coin's
on-chain puzzle hash — the coin's puzzle hash *commits* to the state, so a
lying or buggy endpoint cannot substitute a different authentication
configuration, recovery configuration, or document pointer. The spend's puzzle
reveal must hash to its own coin's puzzle hash before its solution is read, and
the genesis public key is used only after the prelauncher reveal is hashed
against the prelauncher coin. A key becomes a verification method only when its
membership in the *current* authentication Merkle root is provable (spec §8.2).

This also makes the derivation self-checking rather than fragile: a candidate
state that matches the chain's commitment **is** the state, whichever rule
produced it, and a wrong prediction cannot match without a SHA-256 collision.
Identifying the operation from the pinned puzzle-hash table is an optimization;
an exhaustive backstop tries every known transition against every solution
subtree, so a stale hash table costs performance, not correctness.

**Fail-closed:** a spend for which no known transition reproduces the chain's
commitment returns `didResolutionMetadata.error = "unverifiableState"`. Nothing
is guessed and nothing is served unverified. Because solution shapes are
puzzle-version-specific, this is the honest outcome for a DID whose most recent
spend rewrote state under a `julia_did` puzzle version predating this driver;
`didResolutionMetadata["did:julia:currentPuzzle"]` reports that condition
explicitly, and DIDs on older puzzles still resolve when their last spend
changed no state.

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
