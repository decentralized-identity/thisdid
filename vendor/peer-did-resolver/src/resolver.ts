/**
 * @thisdid/peer-did-resolver — DIF `did-resolver` driver for did:peer.
 *
 * The method implementation is Veramo's `peer-did-resolver` DIF adapter over
 * the aviarytech `did-peer` core (numalgo 0, 1 and 2). Both are consumed from
 * ThisDID-custodied forks — `vendor/forks/peer-did-resolver` (2.0.0) and
 * `vendor/forks/did-peer` (0.0.22) — rather than the npm registry, so every
 * line that resolves a did:peer here can be read, audited and patched in this
 * repository. This package adds the standalone command-line resolver and is
 * the single import the ThisDID Worker and the CLI share.
 */
import { getResolver as coreGetResolver } from "peer-did-resolver";
import type { DIDResolver, ResolverRegistry } from "did-resolver";
import { applyRepresentation } from "./representation.js";

export {
  applyRepresentation,
  DID_JSON,
  DID_LD_JSON,
} from "./representation.js";

/** did:peer needs no configuration: the identifier encodes its own document. */
export function getResolver(): ResolverRegistry {
  const core = coreGetResolver().peer as DIDResolver;
  // DID Core representation negotiation, which the core does not perform.
  const peer: DIDResolver = async (did, parsed, resolver, options) =>
    applyRepresentation(
      await core(did, parsed, resolver, options),
      options?.accept,
    );
  return { peer } as ResolverRegistry;
}
