# @thisdid/xrpl-did-resolver

A `did:xrpl` resolver for the DIF [`did-resolver`](https://github.com/decentralized-identity/did-resolver)
interface — a clean-room driver for **XLS-40**, the XRP Ledger's native, consensus-level DID
method (amendment active on mainnet since 30 October 2024). To our knowledge this is the first
published resolver for on-ledger XLS-40 DIDs, so this README doubles as its resolution profile.

## Identifier

```
did:xrpl:<network-id>:<idstring>
```

- `network-id` — the chain's own `server_info` network id: `0` mainnet, `1` testnet, `2` devnet
  (extensible to sidechains via `rpcUrls`).
- `idstring` — either a classic XRPL address (`r…`, base58check-validated) or the 66-hex-char
  master public key (`02`/`03` secp256k1 or `ED` ed25519). Both forms name the same DID entry;
  public-key queries surface the address form in `didDocumentMetadata.equivalentId`.

## Resolution

One JSON-RPC `ledger_entry {did: <address>, ledger_index: "validated"}` call:

- **Entry exists** — an on-ledger `DIDDocument` blob that decodes to a JSON object AND passes
  usability validation is served as the authored document with its `id` normalized to the
  queried DID (the original `id` moves to `alsoKnownAs`). Validation requires: every
  verification method carries an own-DID id (`#frag` or `<did>#frag`), a type, EXACTLY ONE
  supported key-material property (`publicKeyMultibase` / `publicKeyBase58` / `publicKeyHex` /
  `publicKeyJwk` / `blockchainAccountId`), and a DID-syntax controller when present; every
  relationship entry is an embedded valid method or a reference that resolves to a
  declared/embedded method (no dangling references); every service has an own-DID id, a type,
  and a DID-Core-valid `serviceEndpoint` (string, map, or set thereof — never a scalar).
  Key-material values must additionally pass encoding validation (base58btc multibase / base58 /
  hex with real-key length floors; a JWK with the public members its `kty` requires — OKP:
  `crv`+`x`, EC: `crv`+`x`+`y`, RSA: `n`+`e` — and NO private members (`d`, `p`, `q`, `dp`,
  `dq`, `qi`, `oth`, `k` all reject, so a mistakenly on-ledger private key is never served);
  CAIP-10 for `blockchainAccountId`), ids must be unique across methods and services (a duplicate fragment
  is a conflicting definition and rejects the blob), and the `#uri` fragment is reserved for
  the ledger's own URI service. A
  non-JSON or invalid blob falls back to the implicit base document with the raw hex in
  `didDocumentMetadata.didDocumentBlobHex` (plus `didDocumentBlobError: "invalidDidDocument"`
  when it was JSON but unusable). The `URI` blob becomes a `LinkedResource` service
  (`#uri`) plus `didDocumentMetadata.uri`; the `Data` attestation blob goes to
  `didDocumentMetadata.attestationData`. The driver **never fetches the URI's remote content** —
  it resolves only what the ledger attests. Ledger provenance (`objectId`, `previousTxnId`,
  `previousTxnLgrSeq`, `ledgerIndex`) rides along in the metadata.
- **No entry (`entryNotFound`)** — the spec's **implicit document**: public-key-form DIDs yield a
  single `Multikey` master key (`#master-key`) holding `authentication`, `assertionMethod`, and
  `capabilityInvocation`; address-form DIDs yield a minimal keyless document. Metadata carries
  `implicit: true`.

Every encoding rule was validated live before implementation: XRPL base58check round-trips real
mainnet addresses; `AccountID = RIPEMD-160(SHA-256(pubkey))` reproduces the spec's own example
pair; the DID entry's object ID `SHA-512Half(0x0049 ‖ AccountID)` matches live mainnet indexes
byte-for-byte. The test fixtures are raw `ledger_entry` responses captured from mainnet, testnet,
and devnet.

## Usage

```ts
import { Resolver } from "did-resolver";
import { getResolver } from "@thisdid/xrpl-did-resolver";

const resolver = new Resolver(getResolver());
const result = await resolver.resolve(
  "did:xrpl:0:r9BUM9z14j7bLFzQHRfurWNdNKYSABdGtE",
);
```

`getResolver({ rpcUrls, timeoutMs })` accepts per-network JSON-RPC overrides (keyed by
network-id) and a wall-clock bound. Defaults are the keyless public endpoints:
`xrplcluster.com` (0), `s.altnet.rippletest.net:51234` (1), `s.devnet.rippletest.net:51234` (2).

Sole runtime dependency: `@noble/hashes`.
