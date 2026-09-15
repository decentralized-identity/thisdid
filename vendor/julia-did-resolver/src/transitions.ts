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
import {
  MAX_DEPTH,
  NIL,
  type Node,
  fromHex,
  isPair,
  sha256tree,
  toHex,
} from "./clvm.js";

export class TransitionError extends Error {}

/** Slot indices of the did:julia state list (spec §6.1), zero-based. */
export const SLOT = {
  juliaDidPuzzleHash: 0,
  launcherId: 1,
  recoveryDelay: 2,
  multisigInfo: 3,
  custodians: 4,
  recoveryInfo: 5,
  documentPointer: 6,
  pendingRecovery: 7,
} as const;

/**
 * Compiled tree hashes of the `julia_did` sub-puzzles, from the pinned table
 * in the julia_did_chialisp README (verified against a local build of commit
 * 7fbc6bc, chialisp 0.4.5). Only the six state-changing entries carry a
 * transition; the rest are listed so an identified spend can be described
 * accurately and so a pass-through is distinguishable from an unknown puzzle.
 */
export const PUZZLE_HASHES: Record<string, string> = {
  coin_control:
    "cbf39fdd6fbe207ec8e690b2e7ee3d3c04607196ecee9851f90c842b32b48537",
  custodian: "6a6a53288bc5ae3c7d4cca8c0025d7fffc058c8610e6d1f28c6988830178a2f7",
  custody_minion:
    "597415b279e37b674f7c1712dcde98ff41525c6ca815716c9fdca5da6b630af1",
  DIDdoc_announce:
    "1a9ba4490df5a4b3fab26333fa8e6149f0065be0a55e7ef400896b28c2af3480",
  DIDdoc_set:
    "127b9a2fb92f5386eb95ecd910567f4120eb4d9744101ac9e2a7d83f5265a336",
  invalidate:
    "f0d86e1b4c7c952b85d250eb92703b01020d52093b5d7a64acf07db87df9b2b4",
  issuer_key_control:
    "18c6998efbfcb3679219b2f62feebf3e9d7ad1c5c511cc8fe2d693f057915bf5",
  launch_issuer_key:
    "f7b881117107bc93c8dc089e4b7ab734f5456c447f3c89a4ac739031c08c7a42",
  multisig: "951e25e46a5c0322bfa252838337d50a7481e87362387d759ddf0d635741b328",
  pass_thru: "c6c7601f55b6a0bd282f8b26d4a6a3d4a99934e313c38918c5122e7e3c6a0aed",
  present_claims:
    "f88047ab666408d85eace413dd821be91221fbb51925ce6e3695b7bcdf0e376f",
  present_delegated:
    "bce2f713c9d65fd8055f729c32998d9b60e4079126ed82f7e54c7dd51a2f6019",
  recovery_authorize:
    "87daba68c8db42790a554d7d2ad25f1c78320079ae9b767a15136dea50d2ae65",
  recovery_cancel:
    "32424505dc7e3b732c1f782c04f8cb1e72910f3cec6972affbc5371b6d1a8cc5",
  recovery_complete:
    "2dbae5830eee754faaef0448e3db038f8145a033c21a4a15ee00b018a49f27d9",
  recovery_initiate:
    "66043eaf12fd6a434efeefcdb3ac6b0ed91c0cb6159219dc73b72d94fea57df4",
  recovery_prerotation:
    "3aced81c44e5dccaaba10673ae127cf8d3f1f5d276c3fb3a92b24c6871046673",
  rekey: "47fc96435ef8f510457f70f5a2722208d6485168273eefd2eaf6565292b97cd3",
  sign_message:
    "2ddbdb3ce5461d9dfe7c92b04d84b145868f6b11139ff2dad090c81842854f18",
  singlesig: "afff1fd5e7a0e0d36831c61c41063584816adbf40f0ebda91b47e33a360c9ece",
};

/** `(old-state, operation-solution) -> new eight-slot state`. */
export type Transition = (state: Node, solution: Node) => Node;

// ── CLVM path access ────────────────────────────────────────────────────────
//
// The puzzles destructure with `assign`, which compiles to path access: extra
// trailing solution elements are ignored and a seven-slot state is read the
// same way as an eight-slot one. A path that runs off the end of the
// structure raises in CLVM, so it throws here too and the candidate is
// discarded.

function first(node: Node): Node {
  if (!isPair(node)) throw new TransitionError("expected a pair");
  return node[0];
}

function rest(node: Node): Node {
  if (!isPair(node)) throw new TransitionError("expected a pair");
  return node[1];
}

/** `(f (r^index node))` — the index'th element reached by path access. */
export function nth(node: Node, index: number): Node {
  let current = node;
  for (let step = 0; step < index; step++) current = rest(current);
  return first(current);
}

function slot(state: Node, index: number): Node {
  return nth(state, index);
}

function eightSlots(slots: Node[]): Node {
  if (slots.length !== 8) {
    throw new TransitionError(`expected 8 slots, built ${slots.length}`);
  }
  let node: Node = NIL;
  for (let i = slots.length - 1; i >= 0; i--) node = [slots[i], node];
  return node;
}

// ── the six state-changing operations ───────────────────────────────────────

/** `rekey.clsp`: replace the multisig configuration; clear the pending slot. */
const rekey: Transition = (state, solution) =>
  eightSlots([
    slot(state, 0),
    slot(state, 1),
    slot(state, 2),
    nth(solution, 0), // new-multisig-info
    slot(state, 4),
    slot(state, 5),
    slot(state, 6),
    NIL,
  ]);

/** `DIDdoc_set.clsp`: repoint the DID document; clear the pending slot. */
const didDocSet: Transition = (state, solution) =>
  eightSlots([
    slot(state, 0),
    slot(state, 1),
    slot(state, 2),
    slot(state, 3),
    slot(state, 4),
    slot(state, 5),
    nth(solution, 0), // new-DID-doc
    NIL,
  ]);

/**
 * `recovery_initiate.clsp`: arm a recovery. The delay comes from the CURRENT
 * recovery configuration's sixth element, not from the solution; the proposed
 * parameters are parked in the pending slot until the delay elapses.
 */
const recoveryInitiate: Transition = (state, solution) => {
  const recoveryInfo = slot(state, 5);
  return eightSlots([
    slot(state, 0),
    slot(state, 1),
    nth(recoveryInfo, 5), // new-recovery-delay, from the old recovery-info
    slot(state, 3),
    slot(state, 4),
    recoveryInfo,
    slot(state, 6),
    eightSlotsPending(
      nth(solution, 2), // new-multisig-info
      nth(solution, 3), // new-custodian-DIDs
      nth(solution, 4), // new-recovery-info
    ),
  ]);
};

function eightSlotsPending(a: Node, b: Node, c: Node): Node {
  return [a, [b, [c, NIL]]];
}

/** `recovery_cancel.clsp`: disarm — clear the delay and the pending slot. */
const recoveryCancel: Transition = (state) =>
  eightSlots([
    slot(state, 0),
    slot(state, 1),
    NIL,
    slot(state, 3),
    slot(state, 4),
    slot(state, 5),
    slot(state, 6),
    NIL,
  ]);

/**
 * `recovery_complete.clsp`: apply the parked triple to the multisig,
 * custodian, and recovery slots. The solution is not read at all — anyone may
 * trigger completion once the delay has elapsed.
 */
const recoveryComplete: Transition = (state) => {
  const pending = slot(state, 7);
  return eightSlots([
    slot(state, 0),
    slot(state, 1),
    NIL,
    nth(pending, 0), // new-multisig-info
    nth(pending, 1), // new-custodian-DIDs
    nth(pending, 2), // new-recovery-info
    slot(state, 6),
    NIL,
  ]);
};

/**
 * `recovery_prerotation.clsp`: promote the pre-committed multisig out of the
 * recovery configuration, commit the next pre-rotation supplied in the
 * solution, and abort any active recovery.
 */
const recoveryPrerotation: Transition = (state, solution) => {
  const recoveryInfo = slot(state, 5);
  return eightSlots([
    slot(state, 0),
    slot(state, 1),
    NIL,
    nth(recoveryInfo, 0), // prerotation-multisig-info becomes the multisig
    slot(state, 4),
    [
      nth(solution, 2), // new-prerotation-multisig-info
      [
        nth(recoveryInfo, 1), // recovery-classes
        [
          nth(recoveryInfo, 2), // recovery-class-depth
          [
            nth(recoveryInfo, 3), // recovery-required-classes
            [
              nth(recoveryInfo, 4), // recovery-required-root
              [nth(recoveryInfo, 5), NIL], // recovery-delay-setting
            ],
          ],
        ],
      ],
    ],
    slot(state, 6),
    NIL,
  ]);
};

/** Every operation that rewrites did:julia state, by puzzle name. */
export const TRANSITIONS: Record<string, Transition> = {
  rekey,
  DIDdoc_set: didDocSet,
  recovery_initiate: recoveryInitiate,
  recovery_cancel: recoveryCancel,
  recovery_complete: recoveryComplete,
  recovery_prerotation: recoveryPrerotation,
};

const STATE_CHANGING_BY_HASH = new Map<string, string>(
  Object.keys(TRANSITIONS).map((name) => [PUZZLE_HASHES[name], name]),
);

/** Every sub-puzzle hash the resolver recognizes, for spend description. */
const NAME_BY_HASH = new Map<string, string>(
  Object.entries(PUZZLE_HASHES).map(([name, hash]) => [hash, name]),
);

export interface Candidate {
  /** Puzzle name, or `"identity"` for the no-state-change candidate. */
  operation: string;
  /** How the candidate was produced. */
  source: "identity" | "identified" | "exhaustive";
  state: Node;
}

/** Bound on candidates evaluated for one spend — a runaway guard, not a policy. */
const MAX_CANDIDATES = 4096;

interface RevealedPuzzle {
  name: string | null;
  /** The operation's solution: the `cdr` of the `(puzzle . solution)` pair. */
  solution: Node;
}

/**
 * Every `(puzzle . solution)` pair in a solution tree whose car tree-hashes to
 * a puzzle this resolver knows, innermost pairs last.
 */
export function revealedPuzzles(solution: Node): RevealedPuzzle[] {
  const found: RevealedPuzzle[] = [];
  const stack: Node[] = [solution];
  let visited = 0;
  while (stack.length > 0) {
    if (++visited > MAX_DEPTH * 8) break;
    const node = stack.pop() as Node;
    if (!isPair(node)) continue;
    const name = NAME_BY_HASH.get(toHex(sha256tree(node[0]))) ?? null;
    if (name !== null) found.push({ name, solution: node[1] });
    stack.push(node[1], node[0]);
  }
  return found;
}

/** All pairs in a solution tree — the exhaustive backstop's search space. */
function allPairs(solution: Node): Node[] {
  const pairs: Node[] = [];
  const stack: Node[] = [solution];
  while (stack.length > 0 && pairs.length < MAX_CANDIDATES) {
    const node = stack.pop() as Node;
    if (!isPair(node)) continue;
    pairs.push(node);
    stack.push(node[1], node[0]);
  }
  return pairs;
}

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
export function* candidateStates(
  curriedArgs: Node,
  operationSolution: Node,
): Generator<Candidate> {
  yield { operation: "identity", source: "identity", state: curriedArgs };

  const seen = new Set<string>();
  let produced = 1;

  const offer = function* (
    name: string,
    source: "identified" | "exhaustive",
    transition: Transition,
    solution: Node,
  ): Generator<Candidate> {
    if (produced >= MAX_CANDIDATES) return;
    let state: Node;
    try {
      state = transition(curriedArgs, solution);
    } catch {
      return; // the shape does not fit this operation
    }
    const key = toHex(sha256tree(state));
    if (seen.has(key)) return;
    seen.add(key);
    produced += 1;
    yield { operation: name, source, state };
  };

  for (const revealed of revealedPuzzles(operationSolution)) {
    if (revealed.name === null) continue;
    const transition = TRANSITIONS[revealed.name];
    if (transition === undefined) continue;
    yield* offer(revealed.name, "identified", transition, revealed.solution);
  }

  for (const pair of allPairs(operationSolution)) {
    for (const [name, transition] of Object.entries(TRANSITIONS)) {
      yield* offer(name, "exhaustive", transition, (pair as [Node, Node])[1]);
    }
  }
}

/** Names of the state-changing puzzles, for documentation and tests. */
export function stateChangingPuzzleNames(): string[] {
  return [...STATE_CHANGING_BY_HASH.values()].sort();
}

/** Puzzle hash lookup helper used by tests to pin the table. */
export function puzzleHashBytes(name: string): Uint8Array {
  const hex = PUZZLE_HASHES[name];
  if (hex === undefined) throw new TransitionError(`unknown puzzle ${name}`);
  return fromHex(hex);
}
