# @thisdid/empe-did-resolver

A `did:empe` resolver for the DIF [`did-resolver`](https://github.com/decentralized-identity/did-resolver)
interface — a clean-room implementation of Empeiria's EVDI chain resolution over plain
Tendermint RPC, with no `@empe/blockchain-client`, no cosmjs, and no protobufjs.

## What it implements

- **One GET `abci_query` per resolution** against a public fullnode, path
  `/empe.diddoc.Query/DidDocument`, with a hand-encoded
  `QueryGetDidDocumentRequest { did }` (field 1, length-delimited string). The GET form is
  used deliberately — the public endpoint rejects POSTed JSON-RPC from some frontends.
- **Offline protobuf decode** of the `QueryGetDidDocumentResponse` → `DidDocument` message.
  Every field number and wire type is taken from the chain's own generated codec
  (`@empe/empejs` codegen, `/empe.diddoc.*`): document (id, contexts, controllers,
  verification methods, five relationship lists, services, alsoKnownAs), verification methods
  (base58/multibase/JWK material), relationships (reference or embedded method — embedded
  methods are preserved, unlike the reference transform, which drops them), services
  (endpoint sets flattened per DID Core).
- **Identity/network guard**: the decoded document's `id` must equal the queried DID exactly —
  a node serving another Empeiria network would answer a differently-namespaced id and be
  rejected.

Supported networks: `testnet` (`empe-testnet-2`, default `https://rpc-testnet.empe.io` from the
cosmos/chain-registry) — **Empeiria has no public mainnet yet** (verified 24 Aug 2026):
mainnet DIDs report `notConfigured` so routing chains fall through, until
`EMPE_RPC_MAINNET_URL` is set the day it launches.

## Trust model and fail-closed behavior

The fullnode is trusted for chain reads (as with every RPC-based resolver); everything decoded
from it is bounds-checked (256 KiB response cap, varint bounds, length-delimited slice checks).
Fail-closed rules:

- ABCI code 6 / `DID Document not found` is the chain's consensus answer → `notFound`, never a
  fall-through. Other nonzero codes are `networkError` with the chain's log attributed.
- Malformed protobuf — at any nesting level — returns `invalidDidDocument`, never a partial
  document.
- A document whose `id` names another DID (or another network's namespace) returns
  `invalidDidDocument`.

## Test provenance

The suite replays the live testnet capture for the catalog example
`did:empe:testnet:006308981b61932c5eaae1c39ace8ee3892f4a1f` (746-byte protobuf answer — two
secp256k1 `JsonWebKey` methods — captured 24 Aug 2026) plus the chain's real not-found
envelope. The hand decoder was validated against the live capture byte-for-byte before
implementation.

## Exit criteria

Retire this package if Empeiria publishes a maintained, workerd-compatible resolver of
equivalent scope (their current `@empe/empe-did-resolver` pulls cosmjs, protobufjs, typeorm and
node-fetch — unusable in a Worker); the `x/diddoc` module is the source of truth this package
must keep matching. Revisit the mainnet default the day Empeiria's mainnet endpoints exist.
