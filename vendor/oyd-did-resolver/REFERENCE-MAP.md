# Reference map — @thisdid/oyd-did-resolver ⇔ OYDID reference implementation

Three reference points, kept distinct (they are not the same thing):

| role                                  | what                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Transliteration source** (baseline) | [`OwnYourData/oydid@48a62c9`](https://github.com/OwnYourData/oydid/tree/48a62c9c67d63a316bf2ca507babfc59ae4f48e3) (2026-08-27) — Ruby gem 0.9.1. The exact source this package was ported from, function by function (the map below).                                                                                                                                   |
| **Behavioral-parity target**          | [`resolver.ownyourdata.eu`](https://resolver.ownyourdata.eu) — the hosted reference resolver. The DIF Universal Resolver proxies `did:oyd` to this endpoint (it does not run a dedicated OYD container), so this is what the golden vectors are captured from and the live corpus diffs against. Its deployed driver/spec version may differ from the pinned gem above. |
| **Normative target**                  | [OYDID method specification v0.6](https://ownyourdata.github.io/oydid/) (2026-08-25) — the authority when the source and the spec disagree.                                                                                                                                                                                                                             |
| Repository backend                    | `oydid.ownyourdata.eu` — the `/doc`, `/doc_raw`, `/log` content store the resolver reads.                                                                                                                                                                                                                                                                               |

This package is a **transliteration of the reference's resolution path under
a documented profile** — it does not claim functional identity with the Ruby
resolver, and no formal equivalence proof exists. What it does claim, and
what the artifacts here support:

- module boundaries, function names, argument shapes, return tuples
  (`[value, message]`) and control flow mirror the pinned Ruby source, so
  the two implementations can be reviewed side by side, function by
  function (the map below), as groundwork for a future formal comparison;
- every departure from the reference is deliberate and listed under
  **Deliberate deviations** — several are externally observable, which is
  precisely why they are enumerated for the method author's review (a
  standalone adjudication dossier — `SPEC-DIVERGENCES.md`, with live
  evidence and one concrete question per divergence — is maintained outside
  this package and delivered to the method author directly);
- within the supported profile (ed25519 / sha2-256 / base58btc), the
  package is **behaviorally compatible with the reference resolver for the
  captured vectors**: the spec's own published samples — single-version,
  updated (resolved through both its identifiers), revoked, and
  non-default-location — reproduce the reference deployment's `didDocument`
  and `didDocumentMetadata` field-for-field (deep structural equality via
  `toEqual`, not raw-byte serialization; `src/__tests__/fixture.ts`,
  `src/__tests__/samples.ts`);
- on hostile input it is **stricter than the reference by design**: the
  checks under **Security hardening** (stricter than the reference, never
  more permissive) fail closed, rejecting malformed or malicious logs, keys,
  repositories and rotation targets that the trusting first-party reference
  would accept. All supported valid golden vectors resolve unchanged; the one
  intentional exception to reference behavior is delegation, which is not honored
  (§2) — a reference-accepted DID relying on a delegated update key is
  deliberately rejected.

**Two separate guarantees.** _Resolution compatibility_: all supported valid
golden vectors resolve to a structurally identical document and metadata as the
reference (deep-equality, the delegation exception aside). _TypeScript API compatibility_: NOT guaranteed —
this is a new, unpublished package whose exported types are still being
tightened. In particular `w3c()` now returns a `W3cResult` discriminated
union (not a bare document), and `DidInfo.error` / `LogEntry.op` are the
closed unions `DidErrorCode` / `OpCode`. `LogEntry.op` being a validated
`OpCode` is enforced at the boundary: `parseLogEntries` rejects any entry
with an unknown operation code as a malformed log, so the type never lies.

## Function map

Line numbers refer to the pinned commit. Spec anchors refer to
https://ownyourdata.github.io/oydid/.

| TypeScript                                        | Reference                                                                     | Spec                                                |
| ------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------- |
| `basic.ts multiEncode`                            | `ruby-gem/lib/oydid/basic.rb:14 multi_encode`                                 | §2 `#format`                                        |
| `basic.ts multiDecode`                            | `basic.rb:24 multi_decode`                                                    | §2 `#format`                                        |
| `basic.ts hashDefault`                            | `basic.rb:32 hash`                                                            | §4.2.2 `#calculate_hash`                            |
| `basic.ts multiHash`                              | `basic.rb:36 multi_hash`                                                      | §4.2.2 `#calculate_hash`                            |
| `basic.ts getDigest`                              | `basic.rb:73 get_digest`                                                      | §4.2.1 `#digests`                                   |
| `basic.ts getEncoding`                            | `basic.rb:107 get_encoding`                                                   | §2 `#format`                                        |
| `basic.ts canonical`                              | `basic.rb:116 canonical` (`to_json_c14n` ⇒ RFC 8785)                          | §4.2.2 `#calculate_hash` step 2                     |
| `basic.ts percentEncode`                          | `basic.rb:125 percent_encode`                                                 | §2 `#format`                                        |
| `basic.ts getDelegatedPubKeysFromFullDidDocument` | `basic.rb:366 getDelegatedPubKeysFromFullDidDocument`                         | §4.1 `#log_ops` (DELEGATE)                          |
| `basic.ts verify`                                 | `basic.rb:494 verify` (ed25519-pub branch)                                    | §4.2.3 `#verify_signature`                          |
| `basic.ts stripLocation`                          | `basic.rb:1233 strip_location`                                                | §2 `#format`                                        |
| `basic.ts getLocation`                            | `basic.rb:1237 get_location`                                                  | §2 `#format`                                        |
| `basic.ts retrieveDocument`                       | `basic.rb:1251 retrieve_document` (HTTP branch)                               | §3.2.5 `#http_binding`                              |
| `basic.ts retrieveDocumentRaw`                    | `basic.rb:1296 retrieve_document_raw` (HTTP branch)                           | §3.2.5 `#http_binding`                              |
| `basic.ts retrieveLog`                            | `ruby-gem/lib/oydid/log.rb:26 retrieve_log` (HTTP branch)                     | §4.2.4 `#retrieve_log`                              |
| `basic.ts Op` (re-exported by log.ts)             | the reference's numeric `op` codes + `# TERMINATE`-style comments             | §4.1 `#log_ops`                                     |
| `log.ts Dag`                                      | the `simple_dag` gem's vertex/edge/successors/predecessors surface            | §4 `#log`                                           |
| `log.ts matchLogDid`                              | `log.rb:18 match_log_did?`                                                    | §4.2.3 `#verify_signature`                          |
| `log.ts dagDid`                                   | `log.rb:98 dag_did`                                                           | §4 `#log`                                           |
| `log.ts dag2array`                                | `log.rb:222 dag2array`                                                        | §3.2 `#read`                                        |
| `log.ts dag2arrayTerminate`                       | `log.rb:246 dag2array_terminate`                                              | §3.2 `#read`                                        |
| `log.ts REVOKED_ERROR_CODE`                       | `log.rb:268 REVOKED_ERROR_CODE`                                               | §3.2.3 `#deactivation`                              |
| `log.ts dagUpdate`                                | `log.rb:270 dag_update`                                                       | §4.2 `#verification`, §3.2.3 `#deactivation`        |
| `read.ts read`                                    | `ruby-gem/lib/oydid.rb:65 read`                                               | §3.2 `#read`                                        |
| `w3c.ts expandVerificationMethods`                | `oydid.rb:1441 expand_verification_methods`                                   | §3.2.1 `#resolution_result`                         |
| `w3c.ts versionIds`                               | `oydid.rb:1508 version_ids`                                                   | §3.2.1 `#resolution_result`                         |
| `w3c.ts versionMetadata`                          | `oydid.rb:1544 version_metadata`                                              | §3.2.1 `#resolution_result`                         |
| `w3c.ts documentId`                               | `oydid.rb:1587 document_id`                                                   | §3.2.1 `#resolution_result`                         |
| `w3c.ts w3c`                                      | `oydid.rb:1597 w3c` (ed25519 branch)                                          | §3.2.1 `#resolution_result`                         |
| `resolver.ts resolutionResult`                    | `uniresolver-plugin/app/controllers/dids_controller.rb:180 resolution_result` | §3.2.1 `#resolution_result`, §3.2.3 `#deactivation` |
| `resolver.ts dereferenceFragment`                 | the fragment branch of `dids_controller.rb:437 resolution_result`             | §3.2 `#read`                                        |
| `log.ts dagUpdate` (rotation branch)              | `log.rb:557` — the REVOKE / DID-Rotation case                                 | §3.2.3 `#deactivation`                              |

## Systematic transforms (apply everywhere)

1. **Sync → async.** Ruby hashes and verifies synchronously; TypeScript uses
   WebCrypto (`crypto.subtle`), so every hash/verify-touching function is
   `async`. Call order and data flow are unchanged.
2. **HTTParty → `fetch`.** Same URLs (`/doc/{hash}`, `/doc_raw/{hash}`,
   `/log/{hash}`), same non-200 ⇒ `[nil, message]` shape. Adds a request
   timeout and a response-size cap enforced on downloaded **bytes**
   (Content-Length pre-check plus a streamed byte counter with
   cancellation — a Worker resolving attacker-supplied custom `%40host`
   repositories must bound both).
3. **`[value, msg]` Ruby pairs ⇒ `Tuple<T> = [T | null, string]`.**
   Repository responses are additionally shape-validated
   (`parseDocRecord`/`parseLogEntries`) with explicit `malformed …`
   diagnostics — the reference leans on Ruby's dynamic typing here.
4. **Numeric op codes ⇒ the `Op` constants** — carrying the reference's own
   `# TERMINATE`-style comments in the code itself.
5. Trace/verbose output (`options[:trace]`, the `verification` narrative) is
   omitted; it never influences control flow in the reference.

## Deliberate deviations (each one is a review point for the method author)

1. **Version-hash commitment and identifier binding are ENABLED**
   (spec §4.2.2 `#calculate_hash`). The reference keeps its commitment
   check disabled — commented out in `dag_update` — because its repository
   guarantees it at write time; an independent resolver cannot extend that
   trust. Two checks are enforced instead, shaped by what the spec samples
   revealed about repository behavior (`/doc/{id}` serves the LATEST
   document even for an old version identifier, while `/doc_raw/{hash}` is
   version-exact): every `/doc_raw` response must hash to its version
   identifier, and the REQUESTED identifier must appear as a version
   (a CREATE/UPDATE entry) in the verified log chain — or, for a
   bare-public-key identifier (spec §3.2.4), as a document key of any
   verified version in that chain (the `version_document_keys` set collected
   across every CREATE/UPDATE in `dag_update`), not merely the final version's
   key.
   The spec binds a pubkey-form identifier to a document key in the DID's
   history; there is no separate cryptographic signature over the
   identifier, so this membership check is the binding.
2. **`followAlsoKnownAs` is a host opt-in, OFF by default** (the reference
   resolver defaults to true). The rotation branch of `dag_update` IS
   ported: a host that opts in (`getResolver({ followAlsoKnownAs: true })`,
   e.g. a standalone CLI) follows a revoked DID's rotation to its
   did:ebsi/did:cheqd target — with the reference's method restriction
   preserved — through the host's **own registered drivers** (the DIF
   `Resolvable` the driver receives) instead of the reference's hardcoded
   `DEFAULT_PUBLIC_RESOLVER` HTTP call. Without the opt-in a
   revoked-and-rotated did:oyd reports `didDocumentMetadata.deactivated:
true` (spec §3.2.3 `#deactivation`), which is what a universal-resolver
   driver must do: its `didDocument.id === requested DID` invariant forbids
   serving another method's document.
3. **The legacy resolver fallback (`resolve_did_legacy`) is not ported** —
   pre-0.x log formats fail with the normal error instead.
4. **ed25519 / sha2-256 / base58btc only** — the method defaults. The
   `p256-pub` branches (verify, w3c, JWK conversion), the BLAKE2b/SHA3
   digests and non-base58btc encodings answer `representationNotSupported`
   instead of resolving.
5. **Delegation (op 5) is not honored** — the reference derives update-
   authorizing keys from every DELEGATE entry without authenticating any of
   them (its own `!!!OPEN` note). Lacking a defined authorization rule and a
   positive vector, this driver ignores DELEGATE keys entirely rather than
   trust an unauthenticated one; see **Security hardening** §2. The
   reference-mapped `getDelegatedPubKeysFromFullDidDocument` is retained in
   the API surface but is deliberately not wired into resolution.
6. `resolution_result`'s fragment handling and `UNIRESOLVER_DEBUG` metadata
   are omitted — the DIF driver contract resolves DIDs, not DID URLs, and
   the surrounding Worker stamps its own resolution metadata.
7. **`read`'s log-location split also recognizes `%40`** (spec-conformance
   over reference fidelity: the spec defines `%40` as the W3C-conform
   representation of `@`, the reference splits the document's log reference
   on `@` only — its `dag_update` handles both forms).
8. **DIF error taxonomy.** The reference HTTP API can only distinguish
   404/410/500; the DIF interface has codes for what actually happened, so
   `errorCodeFor` reports `representationNotSupported` (unported profile),
   `invalidDidDocument` (the DID's own data fails verification — bad
   signatures, broken commitments, malformed records),
   `internalError` (transport: timeout, oversized or invalid response) and
   `notFound` (a genuinely absent DID) distinctly. The uncaught-exception
   guard also preserves the exception message instead of discarding it.

## Security hardening (stricter than the reference, never more permissive)

"Stricter than the reference" means exactly one thing here — these checks can
only _reject_ input the reference would have accepted; they never accept
anything it rejects, and they never change the document produced for a valid
DID. They are additional input validation, not a behavioral fork. The reason
they exist: the reference is a first-party toolkit that trusts its own
repository and Ruby's dynamic typing. An independent verifier that resolves
attacker-influenced logs from arbitrary repositories cannot. The following
checks have no counterpart in the reference (some address gaps the reference
author flagged in-code, e.g. the `!!!OPEN` note on delegation). **Every one
fails closed**: it can only turn malformed or hostile input into a rejection.
All supported valid golden vectors resolve to the same document unchanged; the
sole intentional departure is delegation (§2), which is not honored — so a
reference-accepted DID relying on a delegated update key is deliberately
rejected, not resolved. Each check is exercised adversarially in
`src/__tests__/security.test.ts`.

1. **UPDATE authorization is mandatory, not incidental** (`log.ts`). An
   UPDATE is installed only if its signature was verified against the prior
   version's authorized keys in a preceding revocation branch; an UPDATE
   reached without that proof — e.g. spliced directly onto CREATE, or signed
   by a key that never held authority — is rejected. The reference verifies
   the update only inside the revocation walk and installs it unconditionally
   when reached.
2. **Delegation keys are not honored at all** (`log.ts`, `w3c.ts`). Update
   authorization uses only the current version's own document key, and the
   composed document lists no delegate-derived `capabilityDelegation`. The
   reference never authenticates DELEGATE entries — it derives keys from the
   raw `full_log` and flags this exact gap `!!!OPEN` — and no
   authenticated-delegation rule or reference-generated positive vector is
   available to implement safely, so any DELEGATE key (connected or not,
   signed or not) is treated as unauthenticated and ignored. A did:oyd that
   relied on a delegated update key fails closed (its delegated version does
   not resolve) rather than trust an unauthenticated key. Revisit when the
   spec defines delegation authorization and a positive vector exists.
3. **The revocation lookup fails closed** (`log.ts`). A timeout, HTTP error,
   or malformed/oversized response during the revocation check is an
   `internalError`, never read as "no revocation exists". The reference
   guarded the loop `unless log_array.nil?` and served the document.
   _Optional (`strictRevocationSig`, OFF by default = parity):_ two extra
   checks on the honored REVOKE. (a) Its signature must verify against the
   version's revocation key (spec §4.2.3). (b) Its `doc` must COMMIT to the
   version it revokes — spec §4.1 defines op=1 `doc` as the hash of the
   version's document and key; the preimage
   `multi_hash(canonical({doc, key}))` was verified against real repository
   data (SPEC-DIVERGENCES.md D3), and every real REVOKE-bearing corpus DID
   passes both checks live in strict mode. By default — like the reference —
   the REVOKE is honored on the TERMINATE→REVOKE hash commitment alone; that
   commitment already stops a repository/MITM from substituting a revocation
   (proven in `security.test.ts`: a tampered REVOKE sig is ignored), but it
   proves neither that the revocation _key_ authorized it (a creator holding
   only the document key can precommit an unauthorized revocation) nor that
   the REVOKE names the version it revokes. The opt-in closes both gaps for a
   verifier that will not trust issuance history; the default stays
   reference-parity.
4. **Log topology is bounded, unambiguous, and complete** (`log.ts`,
   `security.ts`): entry-count and back-reference bounds (deployment-
   configurable via `getResolver({ maxLogEntries, maxPreviousRefs })`;
   exceeding one is an `internalError` service-limit, not
   `invalidDidDocument`); a duplicate-hash rejection (so a `previous`
   reference resolves to exactly one entry); a **dangling-reference
   rejection** (every `previous` hash must resolve to an entry in the returned
   log — among the ops this driver resolves there are no external references;
   CLONE, the one op the spec defines with a cross-DID predecessor, is not
   resolved by this driver nor by the reference's `dag_update`, both rejecting
   it at the op level — and the reference silently ignored unknown hashes);
   and a visited-set in `dag2array` so a cyclic graph terminates instead of
   overflowing the stack. `parseLogEntries` also requires a finite numeric
   `ts`.
5. **Validated Ed25519 key framing** (`basic.ts`). A key must carry the
   Ed25519 multicodec code (`0xed`) over exactly 32 key bytes, under one of
   the two framings the reference actually emits across its history —
   multihash-style code+length (`0xed 0x20`) or varint multicodec
   (`0xed 0x01`); like the reference we decode on `code = byte[0]`,
   `key = last 32 bytes`, but unlike it we reject any other length byte or
   size (the reference accepted any 34-byte `0xed…` value). Both the document
   key and the revocation key are validated (an invalid revocation key is
   `invalidDidDocument`, never a silent empty `publicKeyHex`). Offline
   regression: `security.test.ts` "accepts both Ed25519 key framings"; live:
   `real.test.ts` zQmSE1h/zQmfEb3K.
6. **Repository-fetch SSRF policy** (`security.ts`). Repository URLs
   (including custom `%40host` ones taken from the DID) are validated before
   any request: https-only, no embedded credentials, and no literal
   private / loopback / link-local / metadata / IPv4-mapped-IPv6 hosts by
   default; redirects are refused. Overridable via `RepositoryPolicy` (scheme
   list, host allowlist), now exposed as `getResolver({ repositoryPolicy })`.
   DNS rebinding is not fully solved at the `fetch` layer — a strict
   deployment should pin `allowHosts`.
7. **Rotation targets are validated, not trusted** (`resolver.ts`). A host
   driver's rotation result is accepted only if it resolves without error to
   a structurally valid document whose `id` equals the requested rotation
   DID, within `MAX_ROTATION_DEPTH` hops.
8. **Identity & authority invariants on the composed document**
   (`resolver.ts`). The stored payload is untrusted; a payload shaped like a
   W3C DID document (w3c's already-a-DID passthrough) or one carrying its own
   `id` / `verificationMethod` (the service merge) could otherwise (a) set
   the output `id` to a foreign identifier, a bare non-DID string, or a
   same-key-different-location variant, or (b) REPLACE or DEMOTE the
   verification methods — hiding the keys the verified log says control the
   DID, or retaining their raw bytes only in inert methods with foreign
   ids/controllers/types while the authoritative `#key-doc`/`#key-rev`
   disappear (reachable for pubkey-form ids, whose creator knows the id in
   advance). Composition itself stays byte-identical to the reference; two
   post-composition guards fail closed instead: `document.id` must EXACTLY
   equal the percent-encoded requested DID URI (`documentId`, location
   suffix included), and each authoritative method must be present with its
   exact id (`{did}#key-doc` / `{did}#key-rev`), this DID as `controller`,
   the profile's `Ed25519VerificationKey2020` type, and the matching raw key
   bytes (so either Ed25519 framing passes) — byte membership alone is not
   enough. The only license to differ is an authenticated DID-Rotation
   actually followed through the host's drivers (`DidInfo.rotated`, gated on
   `followAlsoKnownAs`). Violations are `invalidDidDocument`.
   _Uniqueness scope:_ the resolver requires **exactly one** authoritative
   `{did}#key-doc` and `{did}#key-rev` method (a duplicated authoritative id
   — valid first, attacker-controlled second — would leave relying parties
   with an ambiguous document, undermining the verified authority binding),
   and every entry must be a well-formed object (a `null` entry is a
   controlled `invalidDidDocument`, never a thrown error). It does NOT
   impose document-wide uniqueness on controller-authored
   verification-method identifiers: the OYD reference preserves those
   payload entries as-is, and DID Core 1.0 requires consumers to reject
   duplicate ids for _services_ (§5.4) but states no equivalent consumer
   requirement for verification methods (§5.2) — so a document-wide
   rejection would be a parity-breaking rule unrelated to the OYD authority
   invariant. Full-document id-uniqueness remains available as optional
   future hardening in a DID-document validation profile.
9. **Bounded, crash-safe, classification-safe input handling** (`basic.ts`,
   `w3c.ts`). Multibase values are length-capped before the O(n²) base58
   decode (DoS guard); an out-of-`Date`-range timestamp is dropped, not fed
   to `toISOString()` (which would throw a `RangeError` outside `read()`'s
   guard and reject the resolve promise); every parsed repository response is
   validated against RFC 8785's input constraints at the single fetch choke
   point (non-finite numbers such as `1e999`→Infinity, lone Unicode
   surrogates, and duplicate object member names — which `JSON.parse`
   silently collapses to the last value, invisible to any post-parse check,
   so the raw text is scanned — are all rejected: canonical JSON feeds
   identifiers, log hashes and signature commitments, so a lossy
   serialization must never be hashed); and repository error handling is STATUS-driven — `"revoked"` is
   honored only on HTTP 410 (the reference's deactivation status), 404 maps
   to not-found, any other failure to a transport error, and the
   repository's message text can never steer the DIF error classification
   (it could otherwise echo marker substrings into `errorCodeFor`).

## Verification evidence — and its limits

This is **example-based evidence, not a proof**. There is no formal
operational model, no refinement relation, no exhaustive state exploration,
and no machine-checked equivalence argument; a property-based differential
harness against the Ruby gem is the natural next step if stronger evidence
is wanted. What the artifacts do establish:

1. Check out the pinned reference:
   `git clone https://github.com/OwnYourData/oydid && git -C oydid checkout 48a62c9c`
   — every `⇔ file:line` citation in `src/` resolves against that tree for
   side-by-side review.
2. Run `pnpm test` (offline, 41 tests). The **compatibility** half
   (`resolver.test.ts`) demonstrates, against captured reference data:
   identifier and log-reference commitments recompute; the CREATE signature
   verifies; the spec's published samples — single-version, **updated
   (resolved through BOTH its identifiers, exercising the full
   CREATE → TERMINATE → REVOKE → UPDATE → TERMINATE walk)**, revoked (both
   via the repository's 410 and by independent detection from the full log),
   and non-default-location — reproduce the reference resolver's
   `didDocument` and `didDocumentMetadata` with field-for-field deep-equality
   (`toEqual`, not raw-byte serialization). The **adversarial**
   half (`security.test.ts`, minting real keys/signatures via
   `builder.ts`) exercises each hardening above: a spliced UPDATE, an UPDATE
   signed by a never-authorized key, an injected disconnected DELEGATE, a
   revocation lookup failing (500 and malformed), a foreign TERMINATE, a
   rotation target with a mismatched id / a resolution error (plus the
   matching-id control), the SSRF policy (unit and via a private `%40`
   repository), key framing (both the `0xed 0x20` and `0xed 0x01` framings
   accepted, a malformed one rejected), the **pubkey-form §3.2.4 binding**
   (a bound identifier resolves, an unbound one — the `z6MkrJVn` shape —
   rejected), an invalid revocation key, an over-length log, a **connected
   DELEGATE with an irrelevant signature** (not honored), and a **dangling
   `previous` reference** (rejected).
3. Compare against the live reference at any time:
   `curl https://resolver.ownyourdata.eu/1.0/identifiers/<did>` versus this
   package through a `did-resolver` `Resolver`, for any of the vector DIDs.
4. `pnpm run test:live` runs the real-world corpus in `real.test.ts`
   (opt-in, network) — actual `did:oyd` identifiers from OwnYourData's
   repos/spec, each diffed live against the reference; every one is expected
   to pass. See [OYD-DID-CORPUS.md](./OYD-DID-CORPUS.md), which also documents one real
   DID **excluded** from that corpus (`did:oyd:z6MkrJVn…`): a pubkey-form
   identifier whose key matches no document key in its resolved DID's version
   history (spec §3.2.4), which the reference resolves only through a legacy
   permissive path. Rather than pin a network-dependent divergence, its
   binding is covered offline in `resolver.test.ts` (a bound pubkey-form DID
   resolves; the unbound `z6MkrJVn` shape is rejected) — an open question for
   the method author, without a red live test.

Remaining scope notes. **Delegation (op 5) is intentionally unsupported**
(Security hardening §2): a delegated-key update fails closed, so there is no
positive delegation behavior to vector — supporting it safely requires a
spec-defined authorization rule and a reference-generated vector first; both
delegation attack paths (disconnected and connected-but-unauthenticated) are
covered. CLONE (op 4) is likewise not handled (nor is it by the reference's
`dag_update`, so both reject it). Bare-public-key identifiers (`z6M…`) are
transliterated but not positively vectored. Everything outside the supported
profile (p256, non-sha2-256 digests, non-base58btc encodings) is
deliberately rejected, not resolved.

**REVOKE `doc` commitment — validated under the strict opt-in.** Spec §4.1
defines the op=1 REVOKE `doc` as the _hash of the document and key_ of the
version being revoked. The preimage was determined empirically against real
repository data — `multi_hash(canonical({doc, key}))` of the revoked
version's record (SPEC-DIVERGENCES.md D3) — and `strictRevocationSig` now
enforces it alongside the revocation-key signature: a correctly-key-signed
REVOKE whose `doc` names other content is rejected in strict mode
(`security.test.ts`), and every real REVOKE-bearing corpus DID passes both
checks live. The DEFAULT does not enforce it (the reference performs neither
check — parity). Still deliberately outside the default profile, as
strict-spec-mode candidates awaiting the method author's rulings: mandatory
CREATE signatures, exactly-one-UPDATE-successor, and operation-specific
predecessor cardinality — each would reject inputs the reference resolves.
