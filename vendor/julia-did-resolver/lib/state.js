/**
 * Parsing, derivation, and verification of did:julia singleton state (spec §6).
 *
 * The eight-slot state of the current generation is DERIVED from the most
 * recent spend's solution (see `transitions.ts`) and then VERIFIED by
 * recomputing the singleton's full puzzle hash from it and comparing against
 * the unspent coin's on-chain puzzle hash. Because the coin's puzzle hash
 * commits to the state, a derivation that matches is the state; one that does
 * not match is never served.
 */
import { NIL, asInt, bytesEqual, curriedPuzzleHash, deserialize, fromHex, isAtom, isPair, atomHash, sha256tree, toHex, toList, uncurry, } from "./clvm.js";
import { SINGLETON_LAUNCHER_PUZZLE_HASH, coinId, } from "./chain.js";
import { candidateStates } from "./transitions.js";
import { sha256 } from "@noble/hashes/sha256";
/**
 * Standard Chia `singleton_top_layer_v1_1` mod hash. The puzzle hash
 * recomputed with this constant is checked against the on-chain coin, so an
 * incorrect value fails verification loudly rather than being trusted.
 */
export const SINGLETON_TOP_LAYER_V1_1_HASH = fromHex("7faa3253bfddd1e0decb0906b2dc6247bbc4cf608f58345d173adb63e8b47c9f");
/**
 * The current `julia_did.clsp` compiled hash, from the pinned puzzle-hash
 * table in the julia_did_chialisp README. A singleton whose state slot 1
 * differs is a coin from a predecessor deployment of the protocol, not a
 * conforming did:julia DID under the current specification; the resolver
 * still resolves it but reports `"did:julia:currentPuzzle": false`.
 */
export const CURRENT_JULIA_DID_PUZZLE_HASH = fromHex("86361d36c86f3eb892a39b09539fda6d424628a4c7e25d6a4375efa5c4923fa1");
export const BLS_G1_SIZE = 48;
export class StateError extends Error {
}
/** No known transition reproduces the chain's commitment: fail closed. */
export class UnverifiableStateError extends StateError {
}
/**
 * Root of the deterministic single-leaf tree `((V . V) . 0)` — the shape the
 * production drivers build for one-key and one-participant configurations.
 */
export function singleLeafRoot(leafValue) {
    const leaf = atomHash(leafValue);
    const keyClass = pairOf(leaf, leaf);
    return pairOf(keyClass, atomHash(NIL));
}
function pairOf(left, right) {
    const buffer = new Uint8Array(1 + left.length + right.length);
    buffer[0] = 0x02;
    buffer.set(left, 1);
    buffer.set(right, 1 + left.length);
    return sha256(buffer);
}
/**
 * The protocol's uniform inert-tree sentinel (spec §7.3, §7.4): a single-leaf
 * tree of an all-zero value, with the leaf width matching the committed value
 * type. 48 zero octets is not a valid BLS12-381 G1 public key and 32 zero
 * octets is no real launcher ID, so both commitments are unsatisfiable by
 * construction. Derived, never hardcoded.
 */
export const SENTINEL_ROOT_KEYS = singleLeafRoot(new Uint8Array(48));
export const SENTINEL_ROOT_AGENTS = singleLeafRoot(new Uint8Array(32));
export const PREROTATION_DISABLED_ROOT = SENTINEL_ROOT_KEYS;
function requireAtom(node, what) {
    if (!isAtom(node))
        throw new StateError(`${what} must be an atom`);
    return node;
}
function parseAuthentication(node) {
    if (isAtom(node) && node.length === 0)
        return null;
    const items = toList(node);
    if (items.length !== 4) {
        throw new StateError(`authentication configuration has ${items.length} elements, expected 4`);
    }
    const [classesNode, classDepth, requiredClasses, merkleRoot] = items;
    const classes = toList(classesNode).map((entry) => {
        if (!isPair(entry))
            throw new StateError("key class must be a pair");
        return {
            classId: requireAtom(entry[0], "class id"),
            requiredMembers: asInt(entry[1]),
        };
    });
    const root = requireAtom(merkleRoot, "authentication merkle root");
    return {
        classes,
        classDepth: asInt(classDepth),
        requiredClasses: asInt(requiredClasses),
        merkleRoot: root,
        disabled: bytesEqual(root, SENTINEL_ROOT_KEYS),
    };
}
const UNPARSED_RECOVERY = {
    agentsConfigured: false,
    agentsMerkleRoot: null,
    prerotation: null,
    delayBlocks: 0,
    parsed: false,
};
function parseRecovery(node) {
    if (isAtom(node) && node.length === 0)
        return null;
    let items;
    try {
        items = toList(node);
    }
    catch {
        items = [];
    }
    if (items.length !== 6 || (isAtom(items[0]) && items[0].length !== 0)) {
        return UNPARSED_RECOVERY;
    }
    const [prerotationNode, classes, , , root, delay] = items;
    let prerotation = null;
    if (!(isAtom(prerotationNode) && prerotationNode.length === 0)) {
        const pre = parseAuthentication(prerotationNode);
        prerotation =
            pre !== null && bytesEqual(pre.merkleRoot, PREROTATION_DISABLED_ROOT)
                ? "disabled"
                : "committed";
    }
    const agents = !(isAtom(classes) && classes.length === 0) &&
        isAtom(root) &&
        root.length === 32 &&
        !bytesEqual(root, SENTINEL_ROOT_AGENTS);
    return {
        agentsConfigured: agents,
        agentsMerkleRoot: agents ? root : null,
        prerotation,
        delayBlocks: asInt(delay),
        parsed: true,
    };
}
/** Parse an eight-slot state list. Spec §6.1. */
export function parseState(slotsNode) {
    const slots = toList(slotsNode);
    if (slots.length !== 8) {
        throw new StateError(`expected 8 state slots, found ${slots.length}`);
    }
    const custodiansNode = slots[4];
    const custodians = isAtom(custodiansNode) && custodiansNode.length === 0
        ? []
        : toList(custodiansNode).map((entry) => requireAtom(entry, "custodian launcher ID"));
    const documentPointer = slots[6];
    const authentication = parseAuthentication(slots[3]);
    const recovery = parseRecovery(slots[5]);
    // Spec §7.4: deactivated when no satisfiable control path exists. Each
    // control structure is dead when empty (the null encoding) or when it
    // carries its inert-tree sentinel. A recovery configuration in an
    // unrecognized (predecessor) layout is conservatively treated as live.
    const authDead = authentication === null || authentication.disabled;
    const recoveryDead = recovery === null ||
        (recovery.parsed &&
            !recovery.agentsConfigured &&
            recovery.prerotation !== "committed");
    return {
        juliaDidPuzzleHash: requireAtom(slots[0], "julia_did puzzle hash"),
        launcherId: requireAtom(slots[1], "launcher ID"),
        recoveryDelay: asInt(slots[2]),
        authentication,
        custodians,
        recovery,
        documentPointer: isAtom(documentPointer) && documentPointer.length === 0
            ? null
            : requireAtom(documentPointer, "document pointer"),
        recoveryPending: !(isAtom(slots[7]) && slots[7].length === 0),
        raw: slots,
        node: slotsNode,
        deactivated: authDead && custodians.length === 0 && recoveryDead,
    };
}
/**
 * Recompute the singleton's full puzzle hash from a state node (spec §6.1):
 * `singleton_top_layer_v1_1` curried with `(SINGLETON_STRUCT, julia_did
 * curried with sha256tree(state))`.
 */
export function singletonPuzzleHash(juliaDidPuzzleHash, launcherId, stateNode) {
    const inner = curriedPuzzleHash(juliaDidPuzzleHash, [
        atomHash(sha256tree(stateNode)),
    ]);
    const structHash = sha256tree([
        SINGLETON_TOP_LAYER_V1_1_HASH,
        [launcherId, SINGLETON_LAUNCHER_PUZZLE_HASH],
    ]);
    return curriedPuzzleHash(SINGLETON_TOP_LAYER_V1_1_HASH, [structHash, inner]);
}
/** True when the state hashes to the coin the chain actually holds. */
export function verifyState(state, currentCoinPuzzleHash) {
    return bytesEqual(singletonPuzzleHash(state.juliaDidPuzzleHash, state.launcherId, state.node), currentCoinPuzzleHash);
}
/**
 * Split a `julia_did` spend solution into its three parameters:
 * `(curried-args parent-info solution)`, nested inside the singleton top
 * layer's `(lineage-proof amount inner-solution)`.
 */
export function innerSolution(spend) {
    const outer = toList(deserialize(spend.solution));
    if (outer.length < 3) {
        throw new StateError("singleton solution does not carry an inner solution");
    }
    const inner = toList(outer[2]);
    if (inner.length < 2) {
        throw new StateError("julia_did solution is missing its curried arguments");
    }
    return inner;
}
/**
 * Derive the state of the unspent coin from its parent's spend, and verify it
 * against the coin's own puzzle hash. Throws `StateError` when no candidate
 * transition reproduces the chain's commitment — an honest failure, never a
 * guess.
 */
export function deriveVerifiedState(spend, parentPuzzleHash, currentCoinPuzzleHash, launcherId) {
    const puzzle = deserialize(spend.puzzleReveal);
    if (!bytesEqual(sha256tree(puzzle), parentPuzzleHash)) {
        throw new StateError("spend puzzle reveal does not hash to its coin's puzzle hash");
    }
    const inner = innerSolution(spend);
    const curriedArgs = inner[0];
    const operationSolution = inner.length > 2 ? inner[2] : NIL;
    for (const candidate of candidateStates(curriedArgs, operationSolution)) {
        let state;
        try {
            state = parseState(candidate.state);
        }
        catch {
            continue;
        }
        if (!bytesEqual(state.launcherId, launcherId))
            continue;
        if (!verifyState(state, currentCoinPuzzleHash))
            continue;
        return {
            state,
            previous: curriedArgs,
            operation: candidate.operation,
            source: candidate.source,
        };
    }
    throw new UnverifiableStateError("no known did:julia state transition reproduces the current coin's " +
        "puzzle hash; the spend uses a puzzle version this resolver does not " +
        "understand");
}
/**
 * BLS public keys revealed in the most recent spend's solution.
 *
 * These are candidates for the spec §8.2 enumeration rule. A key revealed in
 * the spend's authorization path proves membership in the root that was
 * current AT THAT SPEND; it is only offered as a candidate when the spend left
 * the authentication configuration unchanged, so the proof carries to the
 * current root.
 */
export function revealedKeysFromSpend(spend, state) {
    let inner;
    let ownAuthentication;
    try {
        inner = innerSolution(spend);
        ownAuthentication = toList(inner[0])[3];
    }
    catch {
        return [];
    }
    if (ownAuthentication === undefined)
        return [];
    if (!bytesEqual(sha256tree(ownAuthentication), sha256tree(state.raw[3]))) {
        return [];
    }
    const keys = [];
    const seen = new Set();
    const stack = [inner.length > 2 ? inner[2] : NIL];
    while (stack.length > 0) {
        const node = stack.pop();
        if (isAtom(node)) {
            if (node.length === BLS_G1_SIZE) {
                const key = toHex(node);
                if (!seen.has(key)) {
                    seen.add(key);
                    keys.push(node);
                }
            }
            continue;
        }
        stack.push(node[1], node[0]);
    }
    return keys;
}
/**
 * The DID's original BLS12-381 G1 public key, from the prelauncher puzzle
 * reveal (spec §7.1). Returns null when the parent coin is not a recognizable
 * did:julia prelauncher.
 *
 * The reveal is authenticated by consensus: its tree hash must equal the
 * prelauncher coin's on-chain puzzle hash.
 */
export async function genesisPublicKey(client, lineage, signal) {
    const prelauncher = lineage.prelauncher;
    if (!prelauncher.spent)
        return null;
    const spend = await client.getPuzzleAndSolution(coinId(prelauncher.coin), prelauncher.spentBlockIndex, signal);
    const puzzle = deserialize(spend.puzzleReveal);
    if (!bytesEqual(sha256tree(puzzle), prelauncher.coin.puzzleHash)) {
        throw new StateError("prelauncher puzzle reveal does not hash to its coin puzzle hash");
    }
    const uncurried = uncurry(puzzle);
    if (uncurried === null)
        return null;
    const keys = uncurried[1].filter((arg) => isAtom(arg) && arg.length === BLS_G1_SIZE);
    return keys.length === 1 ? keys[0] : null;
}
/** True when the state's puzzle-version slot is the current `julia_did`. */
export function isCurrentPuzzle(state) {
    return bytesEqual(state.juliaDidPuzzleHash, CURRENT_JULIA_DID_PUZZLE_HASH);
}
//# sourceMappingURL=state.js.map