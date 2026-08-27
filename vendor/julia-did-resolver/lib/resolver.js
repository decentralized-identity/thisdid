import { ChainError, FullNodeClient, NotFoundError, coinId, traceSingleton, } from "./chain.js";
import { InvalidDidError, parseDid } from "./identifier.js";
import { StateError, UnverifiableStateError, deriveVerifiedState, genesisPublicKey, isCurrentPuzzle, revealedKeysFromSpend, } from "./state.js";
import { buildDocument, errorResult, resolutionResult } from "./diddoc.js";
export const METHOD = "julia";
/**
 * Resolve a did:julia DID to a DID resolution result (spec §7.2, §8).
 *
 * Resolution options are not consulted: version-specific resolution
 * (`versionId` / `versionTime`) is not implemented, in common with the Python
 * reference resolver, and the only representation produced is
 * `application/did+ld+json`.
 */
export async function resolve(did, options = {}, signal) {
    let launcherId;
    try {
        launcherId = parseDid(did);
    }
    catch (cause) {
        if (cause instanceof InvalidDidError) {
            return errorResult("invalidDid", cause.message);
        }
        throw cause;
    }
    const client = options.client ?? new FullNodeClient(options);
    try {
        const lineage = await traceSingleton(client, launcherId, signal);
        const parentSpend = await client.getPuzzleAndSolution(coinId(lineage.parent.coin), lineage.parent.spentBlockIndex, signal);
        const derived = deriveVerifiedState(parentSpend, lineage.parent.coin.puzzleHash, lineage.current.coin.puzzleHash, launcherId);
        const candidates = revealedKeysFromSpend(parentSpend, derived.state);
        const genesisKey = await genesisPublicKey(client, lineage, signal);
        if (genesisKey !== null)
            candidates.push(genesisKey);
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
    }
    catch (cause) {
        if (cause instanceof NotFoundError) {
            return errorResult("notFound", cause.message);
        }
        if (cause instanceof UnverifiableStateError) {
            return errorResult("unverifiableState", cause.message);
        }
        if (cause instanceof ChainError || cause instanceof StateError) {
            return errorResult("internalError", cause.message);
        }
        return errorResult("internalError", cause.message);
    }
}
/** DIF `did-resolver` registry entry for `did:julia`. */
export function getResolver(options = {}) {
    const client = options.client ?? new FullNodeClient(options);
    const resolver = async (did, _parsed, _resolver, _resolutionOptions) => resolve(did, { ...options, client });
    return { [METHOD]: resolver };
}
//# sourceMappingURL=resolver.js.map