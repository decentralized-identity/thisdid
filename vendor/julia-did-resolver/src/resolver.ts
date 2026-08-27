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

/** The single representation this resolver produces. */
export const CONTENT_TYPE = "application/did+ld+json";

/**
 * Whether an `accept` value asks for something this resolver can produce.
 *
 * Only the JSON-LD representation is produced, so anything else is refused with
 * `representationNotSupported` rather than answered with a document the caller
 * did not ask for. `application/did+json` is deliberately NOT accepted: serving
 * a JSON-LD-shaped document under that media type would be the same overclaim
 * in the other direction.
 *
 * Per RFC 9110 §12.5.1 a quality of zero means "not acceptable", so it is a
 * rejection rather than a weak preference — and the MOST SPECIFIC matching
 * entry decides, so `application/did+ld+json, *\/*;q=0` is acceptable while
 * `application/did+ld+json;q=0, *\/*` is not. Precedence is exact type over
 * `type/*` over `*\/*`; among equally specific entries the highest quality
 * wins, so a contradictory header errs toward serving the caller.
 *
 * This is deliberately not full content negotiation — there is only one
 * representation to negotiate over.
 */
export function producesRepresentation(accept: string): boolean {
  // An empty or whitespace-only value carries no preference, like no header.
  if (accept.trim() === "") return true;

  let best: { specificity: number; quality: number } | null = null;
  for (const entry of accept.split(",")) {
    const parts = entry.split(";");
    const media = parts[0].trim().toLowerCase();
    const specificity =
      media === CONTENT_TYPE
        ? 3
        : media === "application/*"
          ? 2
          : media === "*/*"
            ? 1
            : 0;
    if (specificity === 0) continue;

    let quality = 1;
    for (const parameter of parts.slice(1)) {
      const separator = parameter.indexOf("=");
      if (separator < 0) continue;
      if (parameter.slice(0, separator).trim().toLowerCase() !== "q") continue;
      const parsed = Number.parseFloat(parameter.slice(separator + 1).trim());
      // An unparseable quality is ignored rather than treated as a rejection.
      if (Number.isFinite(parsed)) quality = parsed;
    }

    if (
      best === null ||
      specificity > best.specificity ||
      (specificity === best.specificity && quality > best.quality)
    ) {
      best = { specificity, quality };
    }
  }
  return best !== null && best.quality > 0;
}

export interface JuliaResolverOptions extends FullNodeClientOptions {
  /** Supply a pre-built client instead of constructing one per registry. */
  client?: FullNodeClient;
}

/** Per-request DID resolution options, plus a cancellation signal. */
export interface JuliaResolutionRequest extends DIDResolutionOptions {
  signal?: AbortSignal;
}

/**
 * Resolve a did:julia DID to a DID resolution result (spec §7.2, §8).
 *
 * Version-specific resolution (`versionId` / `versionTime`) is NOT implemented
 * — this resolver always reads the singleton's current state. Rather than
 * ignoring those options and returning the latest document as though it were
 * the requested one, a request carrying either is REFUSED with
 * `unsupportedResolutionOption`. Silently answering the wrong question is the
 * one failure mode a caller cannot detect.
 *
 * The only representation produced is `application/did+ld+json`, which every
 * result reports in `didResolutionMetadata.contentType`.
 */
export async function resolve(
  did: string,
  options: JuliaResolverOptions = {},
  resolutionOptions: JuliaResolutionRequest = {},
): Promise<DIDResolutionResult> {
  const accept = resolutionOptions.accept;
  if (accept !== undefined && !producesRepresentation(accept)) {
    return errorResult(
      "representationNotSupported",
      `did:julia resolution produces ${CONTENT_TYPE} only; '${accept}' is not available`,
    );
  }
  for (const option of ["versionId", "versionTime"] as const) {
    if (resolutionOptions[option] !== undefined) {
      return errorResult(
        "unsupportedResolutionOption",
        `did:julia resolution does not implement '${option}'; this resolver ` +
          "reads current singleton state only, and will not return the latest " +
          "document in place of a requested version",
      );
    }
  }
  const signal = resolutionOptions.signal;
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
    const genesisKey = await genesisPublicKey(
      client,
      lineage,
      derived.genesisKeyHash,
      signal,
    );
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
    resolutionOptions: DIDResolutionOptions,
  ): Promise<DIDResolutionResult> =>
    resolve(did, { ...options, client }, resolutionOptions ?? {});
  return { [METHOD]: resolver };
}
