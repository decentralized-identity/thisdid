# Forked upstream driver code

Every TypeScript DID driver ThisDID runs is consumed from code custodied in
this repository. Where the implementation is a third-party package, that
package lives here as a **git submodule of a GoPlausible fork**, pinned to the
exact release that was previously installed from the npm registry, so nothing
changed behaviorally when the source moved — it can now be read, audited and
patched in place.

| Path                                                                 | Upstream                                 | Pinned release                                                        | Consumed by                                                                     |
| -------------------------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `web-did-resolver/`                                                  | decentralized-identity/web-did-resolver  | `2.0.32` (tag)                                                        | `vendor/web-did-resolver` (`@thisdid/web-did-resolver`)                         |
| `ethr-did-resolver/`                                                 | decentralized-identity/ethr-did-resolver | upstream `master` (`5d72109`) + `thisdid`                             | `vendor/ethr-did-resolver` (`@thisdid/ethr-did-resolver`)                       |
| `peer-did-resolver/`                                                 | veramolabs/peer-did-resolver             | `2.0.0` (tag)                                                         | `vendor/peer-did-resolver` (`@thisdid/peer-did-resolver`)                       |
| `did-peer/`                                                          | aviarytech/did-peer                      | `0.0.22` (commit `dc98ef8`)                                           | `peer-did-resolver/` above                                                      |
| `didwebvh-ts/`                                                       | decentralized-identity/didwebvh-ts       | `v2.8.0` (tag)                                                        | `vendor/webvh-did-resolver`                                                     |
| `atproto/` (`packages/identity`)                                     | bluesky-social/atproto                   | `@atproto/identity@0.5.9` (tag)                                       | `vendor/plc-did-resolver`                                                       |
| `js-did/` (`packages/key-did-resolver`, `packages/pkh-did-resolver`) | ceramicnetwork/js-did                    | `key-did-resolver@4.0.0`, `pkh-did-resolver@2.0.0` (commit `def0a5f`) | `vendor/key-did-resolver`, `vendor/pkh-did-resolver`, `vendor/dns-did-resolver` |

Each fork is checked out on a local `thisdid` branch at the pinned release
plus a minimal **build profile** so it builds here with pnpm and TypeScript
alone (no Bun, Yarn, microbundle, SvelteKit or Hardhat toolchains):

- `web-did-resolver`: additionally **hardened** — `getResolver(options?)` gained a
  wall-clock timeout, a streamed byte cap, manual redirect handling with
  per-hop re-validation and a destination policy that accepts only globally
  routable unicast literals (`src/address-policy.ts`, a positive
  classification with its own parser; all failing closed) — the first of two
  layers, the wrapper's `destinationGuard` being the connection-level second
  and sharing the same classification — validates the retrieved document
  against the DID Core data model instead of comparing only its `id`
  (`src/document.ts`: structure, exactly one well-formed verification-material property per method, relationship references resolved against every method in the document in a second pass, a JSON-LD `@context` starting with the DID Core context) with the material itself decoded (`src/key-material.ts`), and returns no document on any error, returns
  transport-class errors for network failures, and no longer needs
  `cross-fetch` (global fetch, injectable). The upstream jest suite runs under
  vitest in the fork, extended with the boundary cases. The `example/` demo app
  is removed from the branch (its lockfile only added Socket warnings).
- `didwebvh-ts`: additionally **hardened** — `src/utils/fetch-policy.ts`
  (`boundedFetchText/Json(url, policy?)`) bounds the DID-log, referenced-log
  and witness retrievals (timeout, byte cap, manual redirects, a destination
  policy that accepts only globally routable unicast literals —
  `src/utils/address-policy.ts`, a positive classification with its own
  parser) — the first of two layers: the wrapper's `destinationGuard` adds
  the connection-level check of what each name resolves to, with the same
  classification. Also corrected on the v0.5 path (the entry-hash chain was
  compared with itself and the timestamps carried a TODO), bounded in its
  `deriveHash` cache, inclusive at an entry's own `versionTime`, strict about
  witness thresholds, and every signed `state` is validated as a DID Core
  document (`src/utils/did-document.ts`, with real key-material checks in
  `src/utils/key-material.ts`). The policy
  travels with each resolution:
  `ResolutionOptions.fetchPolicy` is threaded through `resolveDID` →
  `fetchLogFromIdentifier`, `fetchWitnessProofs` and
  `countVerifiedWitnessApprovals` → `resolveVM`; `configureFetchPolicy()`
  only sets process-wide defaults for embedders. Connect-time refusals that
  undici reports as "fetch failed" keep their `cause` text. `examples/` is
  removed from the branch. The upstream `bun:test` suite runs under vitest
  through `test/bun-test-shim.ts` (maps the imports and Bun's extra matchers
  `toBeTrue/False`, `toStartWith`, `toEndWith`, `toBeEmpty`) with
  `json-canonicalize` aliased to its TypeScript source as in the build —
  20 files, 244 tests; `test/cli-e2e.test.ts` and
  `test/package-scripts.test.ts` are excluded because they shell out through
  Bun. `test/resolve-http.test.ts` stubs `fetch` with real `Response`
  objects and expects the bounded request options (marked "ThisDID fork").
- `did-peer`: additionally **corrected and hardened** — numalgo 2 maps all six
  purpose codes (`A` assertion, `E` key agreement, `V` authentication, `I`
  capability invocation, `D` capability delegation, `S` service) to their own
  relationships instead of handling only `V`/`E`/`S` and promoting every `V`
  key into `assertionMethod`; an unknown purpose code is an error. New
  `src/lib/multikey.ts` decodes and validates every key (multibase,
  multicodec, per-codec length, curve point) and requires it to fit its
  purpose, for numalgo 0 and 2 alike. `isPeerDID` accepts the base64url
  alphabet the library's own encoder emits, and decoded services are
  validated (type, DID-URL or relative id, DIDComm endpoint object with a
  required `uri`, routing keys, accept list).
- `js-did`: additionally **corrected and hardened** — `key-did-resolver`
  enforces the did:key multicodec length table, decodes secp256k1 points,
  reports an unsupported multicodec explicitly, and emits the DID Core context
  plus the suite contexts (it emitted the legacy `w3id.org/did/v1` alias);
  `pkh-did-resolver` validates accounts against the CAIP-10 namespace profiles
  (`src/validate.ts`: eip155 hex + EIP-55, bip122 base58check/bech32 per
  chain, with the bech32 witness program decoded and length-checked per
  BIP-173/141, tezos base58check, solana on-curve Ed25519 keys) and types
  verification methods from the method's Networks table (Tezos by address
  prefix, Solana `Ed25519VerificationKey2018`). A Solana document is the Read
  algorithm's single `#blockchainAccountId` method, not the test vector's
  shape, which contradicts that algorithm and DID Core §5.2.1 (reported).
  Arweave, which has a vector but no Networks row, is refused as unsupported.
- `ethr-did-resolver`: the `thisdid` branch carries exactly the two changes
  proposed upstream — malformed, empty or repeated `versionId`/`versionTime`
  selectors are `invalidOptions` instead of resolving another version, and
  every resolution failure, including connectivity, timeout, server and archive-node errors, returns `internalError` instead of `notFound`. The history budget and the
  calendar-checked `versionTime` were dropped on 2026-09-14 because the
  maintainer did not take them.
- `did-peer`: additionally **corrected and hardened** — numalgo 2 maps all six
  purpose codes (`A` assertion, `E` key agreement, `V` authentication, `I`
  capability invocation, `D` capability delegation, `S` service) to their own
  relationships instead of handling only `V`/`E`/`S` and promoting every `V`
  key into `assertionMethod`; an unknown purpose code is an error. New
  `src/lib/multikey.ts` decodes and validates every key (multibase,
  multicodec, per-codec length, curve point) and requires it to fit its
  purpose, for numalgo 0 and 2 alike. `isPeerDID` accepts the base64url
  alphabet the library's own encoder emits, and decoded services are
  validated (type, DID-URL or relative id, DIDComm endpoint object with a
  required `uri`, routing keys, accept list).
- `js-did`: additionally **corrected and hardened** — `key-did-resolver`
  enforces the did:key multicodec length table, decodes secp256k1 points,
  reports an unsupported multicodec explicitly, and emits the DID Core context
  plus the suite contexts (it emitted the legacy `w3id.org/did/v1` alias);
  `pkh-did-resolver` validates accounts against the CAIP-10 namespace profiles
  (`src/validate.ts`: eip155 hex + EIP-55, bip122 base58check/bech32 per
  chain, with the bech32 witness program decoded and length-checked per
  BIP-173/141, tezos base58check, solana on-curve Ed25519 keys) and types
  verification methods from the method's Networks table (Tezos by address
  prefix, Solana `Ed25519VerificationKey2018`). A Solana document is the Read
  algorithm's single `#blockchainAccountId` method, not the test vector's
  shape, which contradicts that algorithm and DID Core §5.2.1 (reported).
  Arweave, which has a vector but no Networks row, is refused as unsupported.
- `ethr-did-resolver`: the `thisdid` branch carries exactly the two changes
  proposed upstream — malformed, empty or repeated `versionId`/`versionTime`
  selectors are `invalidOptions` instead of resolving another version, and
  every resolution failure, including connectivity, timeout, server and archive-node errors, returns `internalError` instead of `notFound`. The history budget and the
  calendar-checked `versionTime` were dropped on 2026-09-14 because the
  maintainer did not take them.
- `web-did-resolver`, `peer-did-resolver`, `did-peer`: `tsconfig.thisdid.json`
  (plain `tsc`, ESM output); `package.json` trimmed to the runtime
  dependencies pinned at the versions production already ran (`cross-fetch`
  4.1.0, `did-resolver` 4.1.0, `buffer` 6.0.3) plus `typescript`; `exports`
  point at the tsc output; the upstream test suites run under vitest inside
  each fork (`pnpm test`). `peer-did-resolver` depends on `did-peer` through
  `link:../did-peer`; its `example/` demo app is removed from the branch. One type-only change in `did-peer/src/lib/utils.ts`
  (`assert(exp: unknown)`) so its own validators type-check under strict.
- `didwebvh-ts`: `scripts/build.thisdid.mjs` reproduces the upstream Bun
  build with esbuild (ESM, CJS, browser bundles + tsc declarations);
  `json-canonicalize` 2.0.1 publishes only TypeScript sources, so the script
  bundles it from `src/` exactly as Bun did. `version` is set to `2.8.0`, the
  release the `v2.8.0` tag published (the tagged manifest still said 2.7.4).
- `ethr-did-resolver`: **no ThisDID-specific files.** The fork is upstream
  `master` plus the two upstream-bound changes on `thisdid`; it installs from
  upstream's own frozen lockfile with upstream's pinned pnpm 12.4.1 (Hardhat
  included). ThisDID's wiring lives in the root `package.json`: `build:forks`
  builds only the resolver package (`pnpm --filter ethr-did-resolver run
build`), and `test:forks` runs upstream's full suite on the in-process
  Hardhat chain (`HARDHAT_CONFIG=hardhat.config.mts vitest run`) except
  `networks.integration.test.ts`, which calls public RPC endpoints — 18 files,
  172 tests.
- `js-did`: the `thisdid` branch keeps only `packages/key-did-resolver` and
  `packages/pkh-did-resolver` in the tree and the pnpm workspace, with their
  dependencies pinned to the versions production ran and a fresh two-importer
  lockfile; plain `tsc` builds (`tsconfig.thisdid.json`); the upstream jest
  suites (incl. snapshots) run under vitest. See the section below
  for why the upstream monorepo lockfile could not be used as-is.
- `atproto`: untouched. Only `@atproto/identity` and its workspace
  dependencies are installed (`pnpm install --prod --filter
'@atproto/identity...'`) and built with the repo's own `tsc --build`.

Wrapper packages under `vendor/` depend on the forks directly with pnpm
`link:` specifiers (`"web-did-resolver": "link:../forks/web-did-resolver"`),
so `pnpm install` symlinks the fork into the wrapper's `node_modules` and the
Worker bundle, the tests and the CLI resolve it from there. The root project
does not list any vendored package as an npm dependency and never links one
into its `node_modules`: npm walks every dependency of a `file:` package and
rejects `link:`/`workspace:` specs, and it prunes and rewrites whatever it finds
under `node_modules` — including, through symlinks, the pnpm-installed trees
of the vendored packages and forks (both verified in this repository). Instead
the three consumers resolve `did-resolver` and `@thisdid/*` by alias: the
wrangler configs (`alias`, pointing at each package's entry file), the root
`tsconfig.json` (`paths`) and `vitest.config.ts` (`resolve.alias`, with the
vendor tree externalized so Node executes it natively). Result: no registry
copy of any driver core exists anywhere in the tree, and a root `npm install`
or `npm ci` cannot touch the vendored packages.
`npm run install:forks` and `npm run build:forks` (invoked by `install:vendor`
/ `build:vendor`) install and build the forks first, in dependency order.

## js-did (key, pkh) — why the branch is trimmed

The upstream monorepo lockfile carries `fs@0.0.1-security`, npm's
security-holding placeholder for the `fs` name, which Socket reports at policy
level `error`. It enters through `did-session` → `@ceramicnetwork/common` →
`@ceramicnetwork/node-metrics` (which declares the npm package `fs` instead of
the Node built-in; still present in node-metrics 1.0.5), never through
`key-did-resolver` or `pkh-did-resolver`. Rather than install from a flagged
lockfile or hand-edit it, the `thisdid` branch keeps only the two packages
ThisDID consumes, so the fresh lockfile has two importers and eleven packages
and scans clean. The finding is reported upstream (see the maintainer's notes).

## Updating a fork

1. Inside the fork, fetch upstream tags (`git fetch upstream --tags`) and
   rebase the `thisdid` branch onto the new release tag.
2. Re-pin dependency versions in the build profile deliberately (they are
   exact on purpose).
3. `npm run install:forks && npm run build:forks`, then the wrappers' tests.
4. Commit inside the fork, push the `thisdid` branch to the GoPlausible fork,
   then commit the updated gitlink in this repository.
