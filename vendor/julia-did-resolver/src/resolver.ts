/**
 * did:julia resolver for the DIF `did-resolver` interface.
 *
 * Resolution reads public Chia blockchain state (spec §7.2) through any full
 * node RPC — by default the open Coinset endpoint. No did:julia-specific
 * service is contacted, and no operator is trusted: the singleton's state is
 * re-derived from the most recent spend and checked against the puzzle hash of
 * the coin the chain actually holds.
 *
 * The driver executes no CLVM. See
 * `docs/adr/0001-state-derivation-without-clvm.md`.
 */
import type {
  DIDResolutionOptions,
  DIDResolutionResult,
  DIDResolver,
  ParsedDID,
  Resolvable,
  ResolverRegistry,
} from "did-resolver";
import {
  ChainError,
  FullNodeClient,
  type FullNodeClientOptions,
  NotFoundError,
  coinId,
  traceSingleton,
} from "./chain.js";
import { InvalidDidError, parseDid } from "./identifier.js";
import {
  StateError,
  UnverifiableStateError,
  deriveVerifiedState,
  genesisPublicKey,
  isCurrentPuzzle,
  revealedKeysFromSpend,
} from "./state.js";
import { buildDocument, errorResult, resolutionResult } from "./diddoc.js";

export const METHOD = "julia";

export interface JuliaResolverOptions extends FullNodeClientOptions {
  /** Supply a pre-built client instead of constructing one per registry. */
  client?: FullNodeClient;
}

/**
 * Resolve a did:julia DID to a DID resolution result (spec §7.2, §8).
 *
 * Resolution options are not consulted: version-specific resolution
 * (`versionId` / `versionTime`) is not implemented, in common with the Python
 * reference resolver, and the only representation produced is
 * `application/did+ld+json`.
 */
export async function resolve(
  did: string,
  options: JuliaResolverOptions = {},
  signal?: AbortSignal,
): Promise<DIDResolutionResult> {
  let launcherId: Uint8Array;
  try {
    launcherId = parseDid(did);
  } catch (cause) {
    if (cause instanceof InvalidDidError) {
      return errorResult("invalidDid", cause.message);
    }
    throw cause;
  }

  const client = options.client ?? new FullNodeClient(options);

  try {
    const lineage = await traceSingleton(client, launcherId, signal);
    const parentSpend = await client.getPuzzleAndSolution(
      coinId(lineage.parent.coin),
      lineage.parent.spentBlockIndex,
      signal,
    );
    const derived = deriveVerifiedState(
      parentSpend,
      lineage.parent.coin.puzzleHash,
      lineage.current.coin.puzzleHash,
      launcherId,
    );

    const candidates = revealedKeysFromSpend(parentSpend, derived.state);
    const genesisKey = await genesisPublicKey(client, lineage, signal);
    if (genesisKey !== null) candidates.push(genesisKey);

    return resolutionResult({
      state: derived.state,
      document: buildDocument(derived.state, candidates),
      versionCoinId: coinId(lineage.current.coin),
      confirmedTimestamp: lineage.current.timestamp,
      // True by construction: `deriveVerifiedState` only returns a state whose
      // recomputed singleton puzzle hash equals the unspent coin's, and throws
      // otherwise. The field is kept for parity with the reference resolver
      // and because its absence would be a silent claim.
      verified: true,
      currentPuzzle: isCurrentPuzzle(derived.state),
    });
  } catch (cause) {
    if (cause instanceof NotFoundError) {
      return errorResult("notFound", cause.message);
    }
    if (cause instanceof UnverifiableStateError) {
      return errorResult("unverifiableState", cause.message);
    }
    if (cause instanceof ChainError || cause instanceof StateError) {
      return errorResult("internalError", cause.message);
    }
    return errorResult("internalError", (cause as Error).message);
  }
}

/** DIF `did-resolver` registry entry for `did:julia`. */
export function getResolver(
  options: JuliaResolverOptions = {},
): ResolverRegistry {
  const client = options.client ?? new FullNodeClient(options);
  const resolver: DIDResolver = async (
    did: string,
    _parsed: ParsedDID,
    _resolver: Resolvable,
    _resolutionOptions: DIDResolutionOptions,
  ): Promise<DIDResolutionResult> => resolve(did, { ...options, client });
  return { [METHOD]: resolver };
}
