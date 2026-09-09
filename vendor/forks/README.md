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
| `ethr-did-resolver/`                                                 | decentralized-identity/ethr-did-resolver | `ethr-did-resolver@14.1.2` (tag)                                      | `vendor/ethr-did-resolver` (`@thisdid/ethr-did-resolver`)                       |
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
  and sharing the same classification — returns
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
  classification. The policy
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
- `ethr-did-resolver`: the workspace's own `tsc` build; the package's
  devDependencies are reduced to `typescript` and `vitest` so the install no
  longer pulls Hardhat. `vitest.thisdid.config.ts` runs the six test files
  that need neither a chain nor the network (`config`, `extended-id`,
  `helpers`, `index`, `logParser`, `wrap-did-document` — 70 tests);
  `networks.integration` calls public RPC endpoints and runs only with
  `ETHR_LIVE_TESTS=1`. The other thirteen files (`cachedProvider.*`,
  `errors`, `nonce`, `resolve.*`, `resolver.*`) deploy the registry on a
  Hardhat chain through `src/__tests__/testUtils.ts` and are **not run here**;
  they stay covered by the wrapper's suite and the live corpus. (`pnpm peers
check` reports vite's `@types/node` peer range against the workspace's
  pinned 22.7.5 — a warning only.)
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
