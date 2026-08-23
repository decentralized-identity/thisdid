# @thisdid/sol-did-resolver

A `did:sol` resolver for the DIF [`did-resolver`](https://github.com/decentralized-identity/did-resolver)
interface — a clean-room reimplementation of the [Identity.com `sol-did`](https://github.com/identity-com/sol-did)
resolution semantics over plain Solana JSON-RPC (`getMultipleAccounts`), with no Anchor and no
`@solana/web3.js`.

## What it implements

- **Both on-chain programs in one RPC round-trip**: the current program
  (`didso1Dpqpm4CsiCjzP766BGY89CAdD6ZBL68cRhFPc`, seeds `["did-account", authority]`,
  Anchor/borsh `DidAccount` layout) and the legacy program
  (`idDa4XeCjVwKcprVAo812coUQbovSZ4kDGJf2sPaBnM`, seeds `[authority, "sol"]`, raw borsh) —
  real-world did:sol population predates the v3 program, so both must be read. Legacy state maps
  to modern flag semantics exactly as the on-chain `migrate()` does.
- **Generative fallback**: no account on either program → the method spec's default document
  (`#default` verification method, `capabilityInvocation` only).
- **Flag semantics**: the program's `VerificationMethodFlags` bitfield, with `DID_DOC_HIDDEN`
  methods omitted and `OWNERSHIP_PROOF`/`PROTECTED` never surfaced as relationships; EIP-55
  checksumming for `EcdsaSecp256k1RecoveryMethod2020`.

Supported networks: `mainnet` (default), `devnet`, `testnet` — cluster-scoped RPC URLs are
injected via `getResolver({ rpcUrls })` (the ThisDID worker feeds `SOL_RPC_{MAINNET,DEVNET,
TESTNET}_URL` secrets, e.g. Alchemy).

## Trust model and fail-closed behavior

The RPC endpoint is trusted for ledger reads (as with every RPC-based resolver); everything
decoded from it is bounds-checked (borsh reader limits, 64 KiB account cap, 1 MiB response cap).
Fail-closed rules:

- An unconfigured cluster returns `notConfigured` — never a generative-only answer that could
  hide on-chain rotations or revocations.
- A **data-bearing** account at a DID PDA owned by an unexpected program returns
  `invalidDidDocument` (integrity anomaly). A zero-data system-owned stub at the PDA is normal
  lamport dust (anyone can transfer to any address) and keeps resolving generatively — only the
  deriving program can ever allocate data at its own PDA.
- Malformed account bytes return `invalidDidDocument`, not a partial document.

## Test provenance

The suite replays a captured live devnet account for
`did:sol:devnet:2eK2DKs6vdzTEoj842Gfcs6DdtffPpw1iF6JbzQL4TuK` (legacy program — the wave-opening
verification proved the catalog example lives on the LEGACY program, PDA
`CsR1Bq35A2NBiFZpZXjFxjxDjk2qoyvfQeP1rP4UMWKW`) plus synthetic modern accounts; PDA derivation
is validated against live devnet addresses.

## Exit criteria

Retire this package if Identity.com publishes a maintained, workerd-compatible DIF driver of
equivalent scope (both programs, bounded reads); the on-chain programs are the source of truth
this package must keep matching.
