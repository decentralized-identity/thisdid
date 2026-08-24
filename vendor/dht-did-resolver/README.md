# @thisdid/dht-did-resolver

A `did:dht` resolver for the DIF [`did-resolver`](https://github.com/decentralized-identity/did-resolver)
interface — a clean-room implementation of the
[DID DHT method](https://did-dht.com) (DIF-registered) over a public
[Pkarr](https://github.com/pubky/pkarr) relay, with hand-rolled z-base-32, bencode signing
input, DNS packet parsing and RFC 7638 thumbprints (`@noble/curves` supplies the raw crypto).

## What it implements

- **One relay GET per resolution**: the DID's suffix IS the Ed25519 Identity Key (52-char
  z-base-32); the relay serves the BEP44 mutable item
  `signature (64) ‖ seq (8, big-endian) ‖ v` for that key.
- **Independent verification** — the method's defining property: the Ed25519 signature over the
  bencoded `3:seqi<seq>e1:v<len>:<v>` is checked against the Identity Key from the DID itself,
  so a relay (or the DHT) can withhold a record but can never forge one.
- **Full property-mapping reversal**: `v` is an RFC1035 DNS packet (compression pointers
  supported, loop-bounded); the `_did.<id>.` root TXT record's alias lists rebuild
  verification methods (`_kN._did.`), relationships (`auth`/`asm`/`agm`/`inv`/`del`), services
  (`_sN._did.`), controller (`_cnt`), alsoKnownAs (`_aka`), the type index (`_typ` →
  metadata), and authoritative-gateway NS records (→ metadata). A root rdata of `deactivated`
  resolves to `deactivated: true`.
- **Registry key types 0–3**: Ed25519, secp256k1, P-256, X25519. EC keys arrive as compressed
  SEC1 points and are decompressed to full `x`/`y` JWKs; `_k0`'s bytes MUST equal the Identity
  Key; unnamed keys get their RFC 7638 JWK Thumbprint as the verification method id — all per
  the spec and its registries.

Relay: `https://relay.pkarr.org` (the canonical public relay, resolution-verified live
24 Aug 2026) — override via `getResolver({ relayUrls })` (the ThisDID worker feeds a
comma-separated `DHT_RELAY_URLS` var; no secrets).

## Method status, honestly

The spec is complete (with test vectors) and the Mainline DHT + Pkarr relay rails are very much
alive, but **records expire unless their owners republish** and the method's main publisher
ecosystem (TBD/Block's Web5) shut down — its gateways (`diddht.tbddev.org`,
`ion.tbd.engineering`) are gone, and the spec's own vectors now answer 404 from the DHT. This
driver resolves any did:dht whose owner republishes; an absent record answers `notFound` —
deliberately NOT the spec's optional identity-key-only fallback document, which would
resurrect expired or deactivated DIDs. There is no default probe canary for the same reason
(`DHT_CANARY_DID` enables one once a continuously republished record exists).

## Trust model and fail-closed behavior

Nothing is trusted: the payload is signature-verified against the DID's own key before any
parsing result is served (a forged or corrupted payload returns `invalidDidDocument`). Bounds:
1072-byte BEP44 payload cap, DNS pointer-jump cap, alias syntax checks. A relay 404 is the
DHT's real answer (`notFound`) and never falls through; transport failures try the next relay.

## Test provenance

The suite replays a LIVE relay capture (a real published Pkarr record, 156 bytes, captured
24 Aug 2026) through signature verification and DNS parsing, and drives the full
reconstruction path with spec-shaped record sets signed by a fixed-seed test identity
(Ed25519 + secp256k1 keys, thumbprint ids, deactivation, forged-signature and wrong-identity-key
rejections).

## Exit criteria

Retire this package if DIF ships a maintained, workerd-compatible did:dht resolver of
equivalent scope (verified, bounded, relay-based); the DHT records themselves are the source of
truth this package must keep matching.
