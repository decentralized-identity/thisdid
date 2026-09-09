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



## Command line

The package ships a standalone resolver command, `thisdid-resolve-sol`, that
needs nothing but Node 20+ — no resolver service, no Worker:

```sh
SOL_RPC_MAINNET_URL=https://… npx thisdid-resolve-sol did:sol:ygGfLvAyuRymPNv2fJDK1ZMpdy59m8cV5dak6A8uHKa
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
| `SOL_RPC_MAINNET_URL` | complete JSON-RPC endpoint for mainnet-beta (`rpcUrls.mainnet`) |
| `SOL_RPC_DEVNET_URL` | complete JSON-RPC endpoint for devnet (`rpcUrls.devnet`) |
| `SOL_RPC_TESTNET_URL` | complete JSON-RPC endpoint for testnet (`rpcUrls.testnet`) |
| `SOL_RPC_{MAINNET,DEVNET,TESTNET}_BASE_URL` | Alchemy base URL (ends with `/`), needs `ALCHEMY_API_KEY` |
| `ALCHEMY_API_KEY` | appended to the `*_BASE_URL` variables |
| `SOL_TIMEOUT_MS` | per-request bound in ms (`timeoutMs`, default 6000) |

At least one cluster must be configured, or the command exits 2; a DID on an unconfigured cluster reports `notConfigured`.

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
