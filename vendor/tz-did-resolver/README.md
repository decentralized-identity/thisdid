# @thisdid/tz-did-resolver

A `did:tz` resolver for the DIF [`did-resolver`](https://github.com/decentralized-identity/did-resolver)
interface — a clean-room implementation of the Tezos DID method's layer-1 derivation, validated
against the Spruce reference implementation (`spruceid/ssi`), with BLAKE2b-verified public-key
discovery through the TzKT indexer (`@noble/hashes` supplies SHA-256 and BLAKE2b).

## What it implements

- **Tier-1 derivation, offline**: the address itself yields the document — one verification
  method `#blockchainAccountId` typed per curve exactly as the reference does
  (`tz1` → `Ed25519PublicKeyBLAKE2BDigestSize20Base58CheckEncoded2021`,
  `tz2` → `EcdsaSecp256k1RecoveryMethod2020`,
  `tz3` → `P256PublicKeyBLAKE2BDigestSize20Base58CheckEncoded2021`), carrying a CAIP-10
  `blockchainAccountId` (`tezos:<chain-id>:<address>`), referenced from `authentication` and
  `assertionMethod`. Addresses are base58check-validated (Tezos 3-byte version prefixes,
  double-SHA-256 checksum).
- **Verified key enrichment**: one TzKT call discovers the account's revealed public key
  (`edpk`/`sppk`/`p2pk`); it is added as `publicKeyBase58` ONLY after this driver re-derives
  the address from it (base58check decode → BLAKE2b-20 digest → address payload comparison) —
  a lying indexer cannot plant a key. Outcomes are attributed in
  `didDocumentMetadata.keyDiscovery`: `verified` / `unrevealed` / `mismatch` / `unavailable`.
  TzKT being unreachable degrades to the pure offline derivation, never to an error.
- **Networks pinned by chain id**, both read live 24 Aug 2026: `mainnet`
  (`NetXdQprcVkpaWU`, `api.tzkt.io`) and `shadownet` (`NetXsqzbfFenSTS`,
  `api.shadownet.tzkt.io` — Ghostnet was terminated in 2026). The spec's long-dead named
  testnets report `notConfigured`.

Not implemented (reported `notConfigured`, falling through to upstreams): `KT1`
smart-contract DIDs, which need TZIP-19 DID-manager Michelson view execution (the spec's
tier 2 — effectively unused in the wild); tier-3 signed off-chain updates. `tz4` (BLS)
addresses postdate the spec and are rejected as `invalidDid`.

## Trust model and fail-closed behavior

The derivation is trustless (pure address math). TzKT is consulted but NOT trusted: its key is
cryptographically re-bound to the address before inclusion, and a mismatch is surfaced (and the
key dropped) rather than served. Every valid account DID resolves — did:tz is a generative
method with no notFound.

## Test provenance

The suite replays live-captured revealed mainnet delegates for ALL THREE curves (including
Tezos Foundation Baker 1's `tz3`/`p2pk`), a live unrevealed account, a live `KT1` contract and
a live `tz4` delegate (captured via TzKT, 24 Aug 2026); the BLAKE2b reveal relationships are
re-verified in-test against the real pairs, and a real-but-foreign key is refused.

## Exit criteria

Retire this package if Spruce (or a successor) publishes a maintained, workerd-compatible
did:tz driver of equivalent scope (`spruceid/did-tezos` has been frozen since 2021; the ssi
crate is Rust-only); the Tezos chain and its address math are the source of truth this package
must keep matching. Revisit KT1 support if TZIP-19 DID managers ever see real adoption.
