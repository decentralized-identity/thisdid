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
| `peer-did-resolver/`                                                 | veramolabs/peer-did-resolver             | upstream `master` (`eb21093` = `2.0.0`) + `thisdid`                   | `vendor/peer-did-resolver` (`@thisdid/peer-did-resolver`)                       |
| `did-peer/`                                                          | aviarytech/did-peer                      | upstream `master` (`3cff9d4`; npm `1.1.2`) + `thisdid`                | `peer-did-resolver/` above                                                      |
| `didwebvh-ts/`                                                       | decentralized-identity/didwebvh-ts       | upstream `main` (`02950ce`, manifest `3.0.0`, unreleased) + `thisdid` | `vendor/webvh-did-resolver`                                                     |
| `atproto/` (`packages/identity`)                                     | bluesky-social/atproto                   | `@atproto/identity@0.5.9` (tag)                                       | `vendor/plc-did-resolver`                                                       |
| `js-did/` (`packages/key-did-resolver`, `packages/pkh-did-resolver`) | ceramicnetwork/js-did                    | `key-did-resolver@4.0.0`, `pkh-did-resolver@2.0.0` (commit `def0a5f`) | `vendor/key-did-resolver`, `vendor/pkh-did-resolver`, `vendor/dns-did-resolver` |

Each fork is checked out on a local `thisdid` branch. `web-did-resolver` and
`js-did` still carry the 2026-09-09 minimal **build profile** (pnpm and plain
TypeScript); `didwebvh-ts`, `ethr-did-resolver`, `did-peer` and
`peer-did-resolver` carry no ThisDID-specific files and build with upstream's
own toolchain (see the list further down). What each fork changes:

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
- `didwebvh-ts`: additionally **corrected** — five upstream-bound changes on
  `thisdid` over upstream `main`: the first log entry's claimed entry hash is
  compared with the derived one (V2); an entry is selected at exactly its own
  `versionTime` (V5); malformed `witness` parameters — non-integer, missing or
  out-of-range thresholds, missing witnesses — are rejected on read instead of
  being coerced to "no witnesses", and the CLI's `--witness-threshold` is
  parsed strictly (V6); the `deriveHash` cache is bounded (V4); and every
  signed `state` is validated as a DID Core document (`src/utils/did-document-state.ts`,
  with key material decoded in `src/utils/key-material.ts`) (V3) — verification
  material follows the method's type, as revised in the 2026-09-24 independent
  audit of the report (three rounds, closed). Each change carries its tests in
  upstream's own suite. The transport hardening (V1) is
  **not** in the fork: since upstream's #195 the core takes a `fetch`
  option, and the wrapper passes its own bounded, destination-checked fetch
  through it (`vendor/webvh-did-resolver/src/fetch-policy.ts`). Per-finding
  patches: `.notes/webvh/fixes/`.
- `did-peer`: additionally **corrected and hardened** — numalgo 2 maps all six
  purpose codes (`A` assertion, `E` key agreement, `V` authentication, `I`
  capability invocation, `D` capability delegation, `S` service) to their own
  relationships instead of handling only `V`/`E`/`S` and promoting every `V`
  key into `assertionMethod`; an unknown purpose code is an error.
  `src/lib/key-material.ts` decodes and validates every key (multibase,
  multicodec, per-codec length, curve point) and requires it to fit its
  purpose, for numalgo 0 and 2 alike, and `src/lib/document.ts` validates the
  document a numalgo 4 identifier carries as a DID Core document. `isPeerDID`
  accepts the base64url alphabet the library's own encoder emits and no
  longer backtracks exponentially, decoded services are validated, a numalgo
  4 short form must hash to the long form it is served with, and
  `createNumAlgo4` enforces Method 4's input-document rules. Details and
  patch: `.notes/peer/did-peer-report.md` (P1–P9), `.notes/peer/did-peer-patch.diff`.
- `peer-did-resolver`: additionally **corrected** (F24) — a failure the core
  reports (malformed identifier, unusable key material, malformed service) is
  `invalidDid` with the core's own reason, numalgo 1 is `notFound`, and a
  failed resolution carries no document or document metadata (upstream
  reported every failure as `notFound`, with a message about "a valid https
  URL" copied from did:web, and kept the document). Adapted to did-peer 1.x,
  which the fork links: the service type is imported from the package entry
  point (1.x exports only `.`), `alsoKnownAs` is passed through as the array
  it now is (wrapping it gave `[[…]]`), and the numalgo 2 test expects the
  spec's `V` → authentication mapping.
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
- `ethr-did-resolver`: the `thisdid` branch carries exactly the two changes
  proposed upstream — malformed, empty or repeated `versionId`/`versionTime`
  selectors are `invalidOptions` instead of resolving another version, and
  every resolution failure, including connectivity, timeout, server and archive-node errors, returns `internalError` instead of `notFound`. The history budget and the
  calendar-checked `versionTime` were dropped on 2026-09-14 because the
  maintainer did not take them.
- `web-did-resolver`: `tsconfig.thisdid.json` (plain `tsc`, ESM output);
  `package.json` trimmed to the runtime dependencies pinned at the versions
  production already ran (`cross-fetch` 4.1.0, `did-resolver` 4.1.0) plus
  `typescript`; `exports` point at the tsc output; the upstream test suite
  runs under vitest inside the fork (`pnpm test`).
- `did-peer`: **no ThisDID-specific files.** Upstream's toolchain, upgraded in
  the fork as an upstream-bound change (2026-09-24; Socket flagged the
  SvelteKit-`next` era tree): SvelteKit 2 with `@sveltejs/package` 2, which
  publishes `dist/` from the package root (`exports`, `files`) instead of a
  generated `package/`; Svelte 5, vite 8, vitest 5, ESLint 10 flat config,
  Prettier 3, TypeScript 6.0, `@noble/curves` 2. semantic-release is installed
  only in the release job (`npx -p …`), and the unused Playwright is removed.
  Installs with upstream's npm (`npm ci`), builds with `npm run build`;
  `test:forks` runs its vitest suite — 4 files, 76 tests. `svelte-check` keeps
  upstream's 20 pre-existing spec-typing errors; lint still reports upstream's
  own lines (neither is part of upstream's CI).
- `peer-did-resolver`: **no ThisDID-specific files** except the temporary
  `@aviarytech/did-peer: link:../did-peer` dependency (user-approved; reverted
  to the published did-peer release at PR time). Upstream's toolchain,
  upgraded: Babel 8, jest 30, ESLint 10 flat config, Prettier 3, TypeScript
  6.0 (`rootDir`, `bundler` resolution), yargs held at 17.7.2 by `resolutions`
  (17.7.3 carries a high Socket `obfuscatedFile` alert), semantic-release via
  `npx` in the release job, the unused microbundle and regenerator-runtime
  removed, CI on Node 22. Installs with upstream's yarn 1 (`yarn install
--frozen-lockfile`); the lockfile was resolved by npm (which honours
  `min-release-age`) and converted with `yarn import`. `test:forks` runs its
  jest suite — 5 tests.
- `didwebvh-ts`: **no ThisDID-specific files.** The fork is upstream `main`
  plus the five upstream-bound changes on `thisdid`; it installs from
  upstream's own frozen lockfile with upstream's pinned pnpm 11.27.0 and builds
  with upstream's `tsx scripts/build.ts` (esbuild; no Bun since 3.0.0), and
  `test:forks` runs upstream's full vitest suite — 32 files, 499 tests. The
  former build profile (esbuild script, `tsconfig.thisdid.json`, the
  `bun:test` shim) and the v2.8.0 branch are archived in the local
  `temp-old-changes` branch and `.notes/other/forks-backup-2026-09-18-didwebvh/`.
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
