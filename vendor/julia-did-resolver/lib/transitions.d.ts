/**
 * did:julia state-transition derivation — the core of resolving without a
 * CLVM evaluator.
 *
 * `julia_did` re-emits the next generation's full eight-slot state in a REMARK
 * condition, which the Python reference resolver reads by EXECUTING the most
 * recent spend. Conditions are not served by any RPC, so a Workers driver
 * that cannot execute CLVM must derive that state instead. It can, because:
 *
 *  1. every solution reveals the spend's own pre-spend state verbatim
 *     (`julia_did`'s parameters are `(CURRIED-ARGS-HASH curried-args
 *     parent-info solution)`), and
 *  2. every state-changing operation's new state is a pure function of that
 *     old state plus values carried in the same solution, and
 *  3. exactly one state-changing operation may run per spend (spec §7.3).
 *
 * Only six sub-puzzles rewrite state — `rekey`, `DIDdoc_set`, and the four
 * `recovery_*` operations. Every other sub-puzzle in the call chain passes
 * `curried-args` through untouched, so an unrecognized spend that changed
 * nothing still derives correctly through the identity candidate.
 *
 * DERIVATION IS NOT TRUSTED. Each candidate state is hashed into a full
 * singleton puzzle hash and compared against the unspent coin the chain
 * actually holds. A candidate that matches IS the real state — the coin's
 * puzzle hash commits to it — so a wrong prediction cannot be served, and a
 * spend that matches no candidate produces an honest error rather than a
 * guess. Identification of the operation is therefore an optimization;
 * verification is the authority.
 *
 * The transitions are transcribed from the puzzles' own `update-curry`
 * routines and pinned by ground-truth vectors captured from executing the
 * compiled puzzles (`tests/fixtures/transitions.json`).
 *
 * SCOPE: solution shapes are puzzle-version specific. This closed set is the
 * CURRENT `julia_did` puzzle, which `did:julia:currentPuzzle` already reports.
 */
import { type Node } from "./clvm.js";
export declare class TransitionError extends Error {
}
/** Slot indices of the did:julia state list (spec §6.1), zero-based. */
export declare const SLOT: {
    readonly juliaDidPuzzleHash: 0;
    readonly launcherId: 1;
    readonly recoveryDelay: 2;
    readonly multisigInfo: 3;
    readonly custodians: 4;
    readonly recoveryInfo: 5;
    readonly documentPointer: 6;
    readonly pendingRecovery: 7;
};
/**
 * Compiled tree hashes of the `julia_did` sub-puzzles, from the pinned table
 * in the julia_did_chialisp README (verified against a local build of commit
 * 7fbc6bc, chialisp 0.4.5). Only the six state-changing entries carry a
 * transition; the rest are listed so an identified spend can be described
 * accurately and so a pass-through is distinguishable from an unknown puzzle.
 */
export declare const PUZZLE_HASHES: Record<string, string>;
/** `(old-state, operation-solution) -> new eight-slot state`. */
export type Transition = (state: Node, solution: Node) => Node;
/** `(f (r^index node))` — the index'th element reached by path access. */
export declare function nth(node: Node, index: number): Node;
/** Every operation that rewrites did:julia state, by puzzle name. */
export declare const TRANSITIONS: Record<string, Transition>;
export interface Candidate {
    /** Puzzle name, or `"identity"` for the no-state-change candidate. */
    operation: string;
    /** How the candidate was produced. */
    source: "identity" | "identified" | "exhaustive";
    state: Node;
}
interface RevealedPuzzle {
    name: string | null;
    /** The operation's solution: the `cdr` of the `(puzzle . solution)` pair. */
    solution: Node;
}
/**
 * Every `(puzzle . solution)` pair in a solution tree whose car tree-hashes to
 * a puzzle this resolver knows, innermost pairs last.
 */
export declare function revealedPuzzles(solution: Node): RevealedPuzzle[];
/**
 * Candidate next states for a spend, most likely first.
 *
 * The identity candidate comes first: it covers the eve spend (which re-emits
 * `curried-args` unchanged) and every spend whose operation does not touch
 * state — which is most of them. Identified state-changing operations follow.
 * The exhaustive backstop pairs every known transition with every solution
 * subtree, so a stale puzzle-hash table degrades performance rather than
 * correctness.
 *
 * Nothing here is trusted: the caller verifies each candidate against the
 * chain and takes the first that matches.
 */
export declare function candidateStates(curriedArgs: Node, operationSolution: Node): Generator<Candidate>;
/** Names of the state-changing puzzles, for documentation and tests. */
export declare function stateChangingPuzzleNames(): string[];
/** Puzzle hash lookup helper used by tests to pin the table. */
export declare function puzzleHashBytes(name: string): Uint8Array;
export {};
//# sourceMappingURL=transitions.d.ts.map