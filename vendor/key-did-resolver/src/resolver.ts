/**
 * @thisdid/key-did-resolver — DIF `did-resolver` driver for did:key.
 *
 * The method implementation is Ceramic's `key-did-resolver` (4.0.0) from the js-did
 * monorepo, consumed from the ThisDID-custodied fork under
 * `vendor/forks/js-did` rather than the npm registry, so every line that
 * resolves a did:key here can be read, audited and patched in this
 * repository. The fork's build profile keeps only this package and its sibling
 * in the workspace, which is how the monorepo's Ceramic-side dependency on the
 * npm security-holding package `fs` stays out of ThisDID. This package adds
 * the standalone command-line resolver and is the single import the ThisDID
 * Worker and the CLI share.
 */
import { getResolver as coreGetResolver } from "key-did-resolver";
import type { ResolverRegistry } from "did-resolver";

/** did:key needs no configuration: the identifier encodes its own document. */
export function getResolver(): ResolverRegistry {
  return coreGetResolver() as ResolverRegistry;
}
