# @thisdid/hedera-did-resolver

A `did:hedera` resolver for the DIF
[`did-resolver`](https://github.com/decentralized-identity/did-resolver) interface — a clean-room
driver over Hedera's **public mirror-node REST API** (no `@hashgraph/sdk`, no keys, no fees).
Sole dependency: `@noble/curves`. A `did:hedera:<network>:z<base58-key>_<shard.realm.num>`
identifier names an Ed25519 root key and an HCS topic; the topic's messages are the DID's event
log, folded per the [Hedera DID method](https://github.com/hashgraph/did-method) semantics.

## Trust model — signatures, not the topic

**HCS topics are publicly writable**, so trust comes exclusively from signatures: every message
envelope carries an Ed25519 signature over the serialized `message` object, and the driver
verifies each one against the DID root key (payload form determined empirically against all
captured envelopes). Unsigned, mis-signed, or junk messages are ignored, exactly as the
reference SDK ignores them. Events fold in consensus order: `DIDOwner` (create),
`VerificationMethod` / `VerificationRelationship` / `Service` upserts, `revoke` removals, and
`delete` (deactivation).

A valid signature proves *authorization*, not *structure*: every signed event entry is
additionally shape-validated before folding (own-DID `#fragment` ids, string type/controller,
string key material or service endpoint, and relationship names restricted to the five DID Core
relationship properties — a signed event naming anything else, including prototype-polluting
names, is ignored). Duplicates resolve deterministically last-write-wins.

## Bounded event history — fail-closed

The event read is bounded (`maxMessages`, default 1000) and **fail-closed**: a topic whose
history exceeds the bound refuses to resolve (`resourceLimitExceeded`) rather than composing
from partial history. Silent truncation would drop later rotations, revocations, or the
deactivation event — and because the topic is publicly writable, an attacker without the root
key could flood early positions with garbage to push validly signed events past any cap. The
flooding still costs the attacker per-message HCS fees and can never yield a *stale* document,
only a refusal (the mother Worker then falls through to its upstream chain). If Hedera exposes
an indexed, DID-filtered mirror query in the future, that is the preferred upgrade path;
authenticated state checkpoints are the fallback design if unbounded histories become common.

## Configuration

Keyless by default: public mirrors for `mainnet`, `testnet`, `previewnet` are built in;
`getResolver({ mirrorUrls, timeoutMs, maxMessages })` overrides per network (the ThisDID worker
exposes optional `HEDERA_MIRROR_{MAINNET,TESTNET}_URL` vars). An unknown network returns
`notConfigured`. All reads are paginated with a 1 MiB response bound.

## Test provenance

Fixtures are the raw HCS messages of
`did:hedera:testnet:zHirM7oP62rzBmw4oSbWZTSeTLzb9zrDTfQa1cdMBWCPp_0.0.7280148` captured live
from the public testnet mirror; the suite reproduces Archon's reference document byte-for-byte
(including created/updated millisecond metadata), rejects forged and flooded histories, and
exercises the shape-validation rules with events validly signed by a test-controlled root key.

## Exit criteria

Retire this package if Hashgraph publishes a maintained, workerd-compatible DIF driver with
equivalent signature verification and bounded, fail-closed reads; the HCS topic event log
remains the source of truth.
