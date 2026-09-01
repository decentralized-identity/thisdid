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
import { type Node } from "./clvm.js";
import { type CoinSpend, type FullNodeClient, type SingletonLineage } from "./chain.js";
/**
 * Standard Chia `singleton_top_layer_v1_1` mod hash. The puzzle hash
 * recomputed with this constant is checked against the on-chain coin, so an
 * incorrect value fails verification loudly rather than being trusted.
 */
export declare const SINGLETON_TOP_LAYER_V1_1_HASH: Uint8Array<ArrayBufferLike>;
/**
 * The current `julia_did.clsp` compiled hash, from the pinned puzzle-hash
 * table in the julia_did_chialisp README. A singleton whose state slot 1
 * differs is a coin from a predecessor deployment of the protocol, not a
 * conforming did:julia DID under the current specification; the resolver
 * still resolves it but reports `"did:julia:currentPuzzle": false`.
 */
export declare const CURRENT_JULIA_DID_PUZZLE_HASH: Uint8Array<ArrayBufferLike>;
/**
 * The current `prelauncher.clsp` compiled hash. It is only used to re-derive a
 * launcher ID from a spend's `parent-info`; predecessor deployments used a
 * different prelauncher, so a DID on an older puzzle simply fails to bind
 * rather than failing to resolve (see `bindLineage`).
 */
export declare const PRELAUNCHER_PUZZLE_HASH: Uint8Array<ArrayBufferLike>;
export declare const BLS_G1_SIZE = 48;
export declare class StateError extends Error {
}
/** No known transition reproduces the chain's commitment: fail closed. */
export declare class UnverifiableStateError extends StateError {
}
export interface KeyClass {
    classId: Uint8Array;
    requiredMembers: number;
}
/** Slot 4: `(classes class-depth required-classes required-root)`. Spec §6.2. */
export interface AuthenticationConfig {
    classes: KeyClass[];
    classDepth: number;
    requiredClasses: number;
    merkleRoot: Uint8Array;
    /** True when the root is the inert-key-tree sentinel: unsatisfiable. */
    disabled: boolean;
}
/**
 * Slot 6: `(prerotation-multisig-info classes class-depth required-classes
 * required-root recovery-delay)`.
 *
 * `parsed` is false when the slot is non-empty but not in the current layout
 * (predecessor puzzle versions lack the pre-rotation element); the remaining
 * fields are then meaningless and the configuration is reported only as
 * present.
 */
export interface RecoveryConfig {
    agentsConfigured: boolean;
    agentsMerkleRoot: Uint8Array | null;
    prerotation: "committed" | "disabled" | null;
    delayBlocks: number;
    parsed: boolean;
}
/** The eight-slot did:julia singleton state. Spec §6.1. */
export interface JuliaDidState {
    juliaDidPuzzleHash: Uint8Array;
    launcherId: Uint8Array;
    recoveryDelay: number;
    authentication: AuthenticationConfig | null;
    custodians: Uint8Array[];
    recovery: RecoveryConfig | null;
    documentPointer: Uint8Array | null;
    recoveryPending: boolean;
    /** The raw CLVM slots, in order. */
    raw: Node[];
    /** The slots as a CLVM list — what the singleton's puzzle hash commits to. */
    node: Node;
    deactivated: boolean;
}
/**
 * Root of the deterministic single-leaf tree `((V . V) . 0)` — the shape the
 * production drivers build for one-key and one-participant configurations.
 */
export declare function singleLeafRoot(leafValue: Uint8Array): Uint8Array;
/**
 * The protocol's uniform inert-tree sentinel (spec §7.3, §7.4): a single-leaf
 * tree of an all-zero value, with the leaf width matching the committed value
 * type. 48 zero octets is not a valid BLS12-381 G1 public key and 32 zero
 * octets is no real launcher ID, so both commitments are unsatisfiable by
 * construction. Derived, never hardcoded.
 */
export declare const SENTINEL_ROOT_KEYS: Uint8Array<ArrayBufferLike>;
export declare const SENTINEL_ROOT_AGENTS: Uint8Array<ArrayBufferLike>;
export declare const PREROTATION_DISABLED_ROOT: Uint8Array<ArrayBufferLike>;
/** Parse an eight-slot state list. Spec §6.1. */
export declare function parseState(slotsNode: Node): JuliaDidState;
/**
 * Recompute the singleton's full puzzle hash from a state node (spec §6.1):
 * `singleton_top_layer_v1_1` curried with `(SINGLETON_STRUCT, julia_did
 * curried with sha256tree(state))`.
 */
export declare function singletonPuzzleHash(juliaDidPuzzleHash: Uint8Array, launcherId: Uint8Array, stateNode: Node): Uint8Array;
/** True when the state hashes to the coin the chain actually holds. */
export declare function verifyState(state: JuliaDidState, currentCoinPuzzleHash: Uint8Array): boolean;
/**
 * Re-derive a DID's launcher ID from a spend's `parent-info`, exactly as
 * `julia_did` does on chain before it will honour a regular spend (it raises
 * error 15 otherwise):
 *
 *   prelauncher puzzle hash = curry(PRELAUNCHER, genesis-key-hash)
 *   prelauncher coin id     = coin(prelauncher-parent, that, amount)
 *   launcher coin id        = coin(prelauncher coin id, LAUNCHER, 1)
 *
 * `parent-info`'s third element is the TREE HASH of the 48-octet genesis key,
 * not the key itself — so a launcher ID that re-derives correctly also commits
 * to the DID's genesis key. Returns null when the shape does not fit.
 */
export declare function bindLineage(parentInfo: Node): {
    launcherId: Uint8Array;
    genesisKeyHash: Uint8Array;
} | null;
export interface DerivedState {
    state: JuliaDidState;
    /** The spend's own pre-spend state, revealed in its solution. */
    previous: Node;
    /** Which transition produced the verified state. */
    operation: string;
    source: "identity" | "identified" | "exhaustive" | "revealed";
    /**
     * `sha256tree` of the DID's genesis public key, re-derived from the spend
     * and bound to the launcher ID the DID itself encodes — null when the DID
     * predates the current prelauncher and the binding could not be evaluated.
     */
    genesisKeyHash: Uint8Array | null;
}
/**
 * Split a `julia_did` spend solution into its three parameters:
 * `(curried-args parent-info solution)`, nested inside the singleton top
 * layer's `(lineage-proof amount inner-solution)`.
 */
export declare function innerSolution(spend: CoinSpend): Node[];
/**
 * Derive the state of the unspent coin from its parent's spend, and verify it
 * against the coin's own puzzle hash. Throws `StateError` when no candidate
 * transition reproduces the chain's commitment — an honest failure, never a
 * guess.
 */
export declare function deriveVerifiedState(spend: CoinSpend, parentPuzzleHash: Uint8Array, currentCoinPuzzleHash: Uint8Array, launcherId: Uint8Array): DerivedState;
/**
 * The state a SPENT generation held, read from its own spend (spec §7.2.1).
 *
 * Every `julia_did` solution reveals the spend's own pre-spend state as its
 * first inner argument, and the coin's puzzle curries in that state's hash —
 * so the reveal is what the coin itself committed to. Nothing is taken on
 * trust: the puzzle reveal must hash to the coin's on-chain puzzle hash, the
 * revealed state must match the `CURRIED-ARGS-HASH` that puzzle curries in,
 * and the state must recompute to the coin's puzzle hash. A tampered reveal
 * fails all three rather than producing a document.
 *
 * This is the route version-specific resolution takes for every superseded
 * generation. It applies no transition — the state is *revealed*, not
 * derived — so it also answers for a DID's first generation, whose parent is
 * the launcher and therefore REMARKs nothing.
 */
export declare function revealedVerifiedState(spend: CoinSpend, coinPuzzleHash: Uint8Array, launcherId: Uint8Array): DerivedState;
/**
 * BLS public keys revealed in the most recent spend's solution.
 *
 * These are candidates for the spec §8.2 enumeration rule. A key revealed in
 * the spend's authorization path proves membership in the root that was
 * current AT THAT SPEND; it is only offered as a candidate when the spend left
 * the authentication configuration unchanged, so the proof carries to the
 * current root.
 */
export declare function revealedKeysFromSpend(spend: CoinSpend, state: JuliaDidState): Uint8Array[];
/**
 * The DID's original BLS12-381 G1 public key, from the prelauncher puzzle
 * reveal (spec §7.1). Returns null when the parent coin is not a recognizable
 * did:julia prelauncher.
 *
 * The reveal is authenticated by consensus: its tree hash must equal the
 * prelauncher coin's on-chain puzzle hash.
 */
export declare function genesisPublicKey(client: FullNodeClient, lineage: Pick<SingletonLineage, "prelauncher">, expectedKeyHash: Uint8Array | null, signal?: AbortSignal): Promise<Uint8Array | null>;
/** True when the state's puzzle-version slot is the current `julia_did`. */
export declare function isCurrentPuzzle(state: JuliaDidState): boolean;
//# sourceMappingURL=state.d.ts.map