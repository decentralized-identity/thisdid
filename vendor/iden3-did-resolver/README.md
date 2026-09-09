# @thisdid/iden3-did-resolver

A `did:iden3` **and** `did:polygonid` resolver for the DIF
[`did-resolver`](https://github.com/decentralized-identity/did-resolver) interface — a clean-room
driver that reads the [iden3 State contract](https://github.com/iden3/contracts) directly over EVM
JSON-RPC (`eth_call`), replacing the heavyweight js-sdk path. Sole dependency: `@noble/hashes`.

## What it implements

- **Identifier decoding** per go-iden3-core: 31-byte base58 ID with a little-endian uint16
  checksum; **ID type-byte enforcement** (`DIDMethodByte`: iden3 = 0x01, polygonid = 0x02, plus
  the blockchain/network byte map) — an identifier whose typing disagrees with its DID method or
  network is `invalidDid`, matching the reference core.
- **Three `eth_call`s (two round-trips)** against the State contract: `getStateInfoById`,
  `getGISTProof` (71-word static struct, trailing-zero siblings trimmed), `getGISTRootInfo`.
- **Encoding rules validated live before implementation**: IDs convert to uint256
  **little-endian** (big-endian reverts "Identity does not exist"); state/root hashes render as
  **little-endian hex**. Unpublished identities resolve with `published: false`, never an error.
- The document carries a single keyless `Iden3StateInfo2023` verification method — exactly like
  the reference driver. (The mother Worker's probation comparator has a matching
  state-material extractor, so two documents with different states can never verify as a match.)

Supported networks (built-in State-contract map, extensible per network): `polygon:main`
(`0x624ce98D2d27b20b8f8d521723Df8fC4db71D79D`, chain 137) and `polygon:amoy`
(`0x1a4cC30f2aA0377b0c3bc9848766D90cb4404124`, chain 80002). RPC URLs are injected via
`getResolver({ networks })` (the ThisDID workers feed `IDEN3_RPC_POLYGON_{MAIN,AMOY}_URL` /
`POLYGONID_RPC_POLYGON_{MAIN,AMOY}_URL` secrets).

## Trust model and fail-closed behavior

The RPC endpoint is trusted for `eth_call` results (standard for on-chain resolvers); responses
are size-bounded and ABI-decoded defensively. An unconfigured network returns `notConfigured` —
resolving without chain access could misreport rotated or revoked identity state. Malformed
identifiers (checksum, type bytes, network bytes) are rejected offline as `invalidDid`.


## Command line

The package ships a standalone resolver command, `thisdid-resolve-iden3`, that
needs nothing but Node 20+ — no resolver service, no Worker:

```sh
npx thisdid-resolve-iden3 did:iden3:polygon:amoy:xC8VZLUUfo5p9DWUawReh7QSstmYN6zR7qsQhQCsw
# from a checkout: node lib/bin.js <did>
```

It prints the DIF resolution result as JSON on stdout and exits 0 when the
DID resolved, 1 when the resolver reported an error
(`didResolutionMetadata.error`), 2 on a usage or configuration error.
`--version-id <id>` and `--version-time <iso>` are passed through as
resolution options, `--compact` prints single-line JSON, `--help` prints the
full reference. Host options are read from the environment, under the same names the ThisDID
Worker uses, so one `.dev.vars` file drives both:

| Variable | Effect |
| --- | --- |
| `IDEN3_RPC_POLYGON_MAIN_URL` | complete JSON-RPC endpoint for Polygon mainnet (`networks["polygon:main"]`) |
| `IDEN3_RPC_POLYGON_AMOY_URL` | complete JSON-RPC endpoint for Polygon Amoy (`networks["polygon:amoy"]`) |
| `IDEN3_RPC_POLYGON_MAIN_BASE_URL` | Alchemy base URL (ends with `/`), needs `ALCHEMY_API_KEY` |
| `IDEN3_RPC_POLYGON_AMOY_BASE_URL` | Alchemy base URL (ends with `/`), needs `ALCHEMY_API_KEY` |
| `ALCHEMY_API_KEY` | appended to the `*_BASE_URL` variables |
| `POLYGONID_RPC_POLYGON_*` | accepted as aliases of the `IDEN3_*` variables (the `IDEN3_*` value wins) |
| `IDEN3_TIMEOUT_MS` | per-request bound in ms (`timeoutMs`) |

A network without an endpoint reports `notConfigured` rather than guessing a public RPC.

## Test provenance

Fixtures are raw `eth_call` returns captured live on Amoy together with Archon's document for
`did:iden3:polygon:amoy:xC8VZLUUfo5p9DWUawReh7QSstmYN6zR7qsQhQCsw` captured the same moment —
the suite reproduces the reference document **byte-for-byte**. The polygonid tests cover the
Privado docs' mainnet issuer DID (type bytes `[0x02, 0x11]`, unpublished → `published: false`).

## Exit criteria

Retire this package if the iden3/Privado teams publish a lightweight, workerd-compatible DIF
driver (the current js-sdk path is 21+ MB); the State contract remains the source of truth.
