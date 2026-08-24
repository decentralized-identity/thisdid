# @thisdid/iota-did-resolver

A `did:iota` resolver for the DIF [`did-resolver`](https://github.com/decentralized-identity/did-resolver)
interface — a clean-room implementation of the
[IOTA DID Method Specification v2.0](https://docs.iota.org/developer/iota-identity/references/iota-did-method-spec)
on IOTA Rebased (MoveVM) over plain fullnode JSON-RPC, with no `@iota/identity-wasm` and no SDK.

## What it implements

- **One `iota_getObject` call per resolution**: the DID's tag is the shared `Identity` Move
  object's id; the object's `did_doc` multicontroller `controlled_value` bytes are unpacked
  fully offline (`DID` magic, version 1, encoding 0 = plain JSON, little-endian u16 length,
  `{ doc, meta }` payload) and every `did:0:0` placeholder is substituted with the canonical
  DID, per the spec's Read operation.
- **Identity-package allowlisting**: the object's Move type must be
  `<package>::identity::Identity` with the package id in the network's published
  identity-package history, vendored from `iotaledger/identity`
  (`identity_iota_core/src/rebased/iota/package.rs`) — mainnet (2 versions), testnet (3),
  devnet (1).
- **The spec's network assertion**: each endpoint's `iota_getChainIdentifier` answer is checked
  (cached per isolate) against the chain id the DID's network segment implies
  (`iota`/mainnet = `6364aad5`, `testnet` = `2304aa97`, `devnet` = `daf90477`, all read live
  from the networks themselves on 24 Aug 2026), so a misconfigured endpoint can never serve
  another network's objects. An 8-hex chain id in the DID normalizes to its alias
  (`canonicalId` is stamped when the input differs).
- **Deactivation**: an Identity with `deleted_did` set resolves to `deactivated: true` with no
  document.

Supported networks: `iota` (mainnet, default), `testnet`, `devnet` — endpoint overrides are
injected via `getResolver({ rpcUrls })` (the ThisDID worker feeds
`IOTA_RPC_{MAINNET,TESTNET,DEVNET}_URL` vars; the public `api.*.iota.cafe` fullnodes are the
defaults and need no secrets).

## Trust model and fail-closed behavior

The fullnode is trusted for ledger reads (as with every RPC-based resolver); everything decoded
from it is bounds-checked (256 KiB response cap, exact payload-length match, JSON shape checks).
Fail-closed rules:

- A wrong-chain endpoint is a transport failure (next endpoint is tried), never a served answer.
- An object outside the published identity packages — or one that is not an
  `identity::Identity` at all — returns `invalidDidDocument`, not a coerced document.
- A malformed byte payload (bad magic/version/encoding/length, non-JSON, or a stored id that is
  not the placeholder) returns `invalidDidDocument`, never a partial document.
- `notExists` from consensus is `notFound` and never falls through to another endpoint.

## Test provenance

The suite replays two PRODUCTION mainnet Identity objects captured live on 24 Aug 2026 —
Turingcerts' domain-linkage DID
(`did:iota:0x0c6e3b00…697c`, Ed25519 `JsonWebKey2020`) and a service-only audit-trail Identity
(`did:iota:0xb42eed86…1fa0`, created 14 Aug 2026) — plus the fullnode's real `notExists`
answer. The byte-unpack rules were validated against those captures byte-for-byte before
implementation.

## Exit criteria

Retire this package if `iotaledger/identity` publishes a maintained, workerd-compatible
JS/WASM resolver of equivalent scope (read-only, bounded, no wallet machinery); the Identity
Move objects on the IOTA networks are the source of truth this package must keep matching.
