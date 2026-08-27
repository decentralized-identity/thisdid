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
import {
  type Node,
  NIL,
  asInt,
  bytesEqual,
  curriedPuzzleHash,
  deserialize,
  fromHex,
  isAtom,
  isPair,
  atomHash,
  sha256tree,
  toHex,
  toList,
  uncurry,
} from "./clvm.js";
import {
  type CoinSpend,
  type FullNodeClient,
  type SingletonLineage,
  SINGLETON_LAUNCHER_PUZZLE_HASH,
  coinId,
  coinIdFrom,
} from "./chain.js";
import { candidateStates, nth } from "./transitions.js";
import { sha256 } from "@noble/hashes/sha256";

/**
 * Standard Chia `singleton_top_layer_v1_1` mod hash. The puzzle hash
 * recomputed with this constant is checked against the on-chain coin, so an
 * incorrect value fails verification loudly rather than being trusted.
 */
export const SINGLETON_TOP_LAYER_V1_1_HASH = fromHex(
  "7faa3253bfddd1e0decb0906b2dc6247bbc4cf608f58345d173adb63e8b47c9f",
);

/**
 * The current `julia_did.clsp` compiled hash, from the pinned puzzle-hash
 * table in the julia_did_chialisp README. A singleton whose state slot 1
 * differs is a coin from a predecessor deployment of the protocol, not a
 * conforming did:julia DID under the current specification; the resolver
 * still resolves it but reports `"did:julia:currentPuzzle": false`.
 */
export const CURRENT_JULIA_DID_PUZZLE_HASH = fromHex(
  "86361d36c86f3eb892a39b09539fda6d424628a4c7e25d6a4375efa5c4923fa1",
);

/**
 * The current `prelauncher.clsp` compiled hash. It is only used to re-derive a
 * launcher ID from a spend's `parent-info`; predecessor deployments used a
 * different prelauncher, so a DID on an older puzzle simply fails to bind
 * rather than failing to resolve (see `bindLineage`).
 */
export const PRELAUNCHER_PUZZLE_HASH = fromHex(
  "0ae8147842334ad8915e35ea63ba80a96b1179c43695afd6102954cd8f9d32d9",
);

export const BLS_G1_SIZE = 48;

export class StateError extends Error {}

/** No known transition reproduces the chain's commitment: fail closed. */
export class UnverifiableStateError extends StateError {}

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
export function singleLeafRoot(leafValue: Uint8Array): Uint8Array {
  const leaf = atomHash(leafValue);
  const keyClass = pairOf(leaf, leaf);
  return pairOf(keyClass, atomHash(NIL));
}

function pairOf(left: Uint8Array, right: Uint8Array): Uint8Array {
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

function requireAtom(node: Node, what: string): Uint8Array {
  if (!isAtom(node)) throw new StateError(`${what} must be an atom`);
  return node;
}

function parseAuthentication(node: Node): AuthenticationConfig | null {
  if (isAtom(node) && node.length === 0) return null;
  const items = toList(node);
  if (items.length !== 4) {
    throw new StateError(
      `authentication configuration has ${items.length} elements, expected 4`,
    );
  }
  const [classesNode, classDepth, requiredClasses, merkleRoot] = items;
  const classes = toList(classesNode).map((entry): KeyClass => {
    if (!isPair(entry)) throw new StateError("key class must be a pair");
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

const UNPARSED_RECOVERY: RecoveryConfig = {
  agentsConfigured: false,
  agentsMerkleRoot: null,
  prerotation: null,
  delayBlocks: 0,
  parsed: false,
};

function parseRecovery(node: Node): RecoveryConfig | null {
  if (isAtom(node) && node.length === 0) return null;
  let items: Node[];
  try {
    items = toList(node);
  } catch {
    items = [];
  }
  if (items.length !== 6 || (isAtom(items[0]) && items[0].length !== 0)) {
    return UNPARSED_RECOVERY;
  }
  const [prerotationNode, classes, , , root, delay] = items;
  let prerotation: "committed" | "disabled" | null = null;
  if (!(isAtom(prerotationNode) && prerotationNode.length === 0)) {
    const pre = parseAuthentication(prerotationNode);
    prerotation =
      pre !== null && bytesEqual(pre.merkleRoot, PREROTATION_DISABLED_ROOT)
        ? "disabled"
        : "committed";
  }
  const agents =
    !(isAtom(classes) && classes.length === 0) &&
    isAtom(root) &&
    root.length === 32 &&
    !bytesEqual(root, SENTINEL_ROOT_AGENTS);
  return {
    agentsConfigured: agents,
    agentsMerkleRoot: agents ? (root as Uint8Array) : null,
    prerotation,
    delayBlocks: asInt(delay),
    parsed: true,
  };
}

/** Parse an eight-slot state list. Spec §6.1. */
export function parseState(slotsNode: Node): JuliaDidState {
  const slots = toList(slotsNode);
  if (slots.length !== 8) {
    throw new StateError(`expected 8 state slots, found ${slots.length}`);
  }
  const custodiansNode = slots[4];
  const custodians =
    isAtom(custodiansNode) && custodiansNode.length === 0
      ? []
      : toList(custodiansNode).map((entry) =>
          requireAtom(entry, "custodian launcher ID"),
        );
  const documentPointer = slots[6];
  const authentication = parseAuthentication(slots[3]);
  const recovery = parseRecovery(slots[5]);

  // Spec §7.4: deactivated when no satisfiable control path exists. Each
  // control structure is dead when empty (the null encoding) or when it
  // carries its inert-tree sentinel. A recovery configuration in an
  // unrecognized (predecessor) layout is conservatively treated as live.
  const authDead = authentication === null || authentication.disabled;
  const recoveryDead =
    recovery === null ||
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
    documentPointer:
      isAtom(documentPointer) && documentPointer.length === 0
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
export function singletonPuzzleHash(
  juliaDidPuzzleHash: Uint8Array,
  launcherId: Uint8Array,
  stateNode: Node,
): Uint8Array {
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
export function verifyState(
  state: JuliaDidState,
  currentCoinPuzzleHash: Uint8Array,
): boolean {
  return bytesEqual(
    singletonPuzzleHash(state.juliaDidPuzzleHash, state.launcherId, state.node),
    currentCoinPuzzleHash,
  );
}

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
export function bindLineage(
  parentInfo: Node,
): { launcherId: Uint8Array; genesisKeyHash: Uint8Array } | null {
  try {
    const prelauncherParent = requireAtom(
      nth(parentInfo, 1),
      "prelauncher parent",
    );
    const genesisKeyHash = requireAtom(nth(parentInfo, 2), "genesis key hash");
    const amount = BigInt(asInt(nth(parentInfo, 3)));
    const prelauncherPuzzleHash = curriedPuzzleHash(PRELAUNCHER_PUZZLE_HASH, [
      genesisKeyHash,
    ]);
    const prelauncherId = coinIdFrom(
      prelauncherParent,
      prelauncherPuzzleHash,
      amount,
    );
    return {
      launcherId: coinIdFrom(prelauncherId, SINGLETON_LAUNCHER_PUZZLE_HASH, 1n),
      genesisKeyHash,
    };
  } catch {
    return null;
  }
}

export interface DerivedState {
  state: JuliaDidState;
  /** The spend's own pre-spend state, revealed in its solution. */
  previous: Node;
  /** Which transition produced the verified state. */
  operation: string;
  source: "identity" | "identified" | "exhaustive";
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
export function innerSolution(spend: CoinSpend): Node[] {
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
export function deriveVerifiedState(
  spend: CoinSpend,
  parentPuzzleHash: Uint8Array,
  currentCoinPuzzleHash: Uint8Array,
  launcherId: Uint8Array,
): DerivedState {
  const puzzle = deserialize(spend.puzzleReveal);
  if (!bytesEqual(sha256tree(puzzle), parentPuzzleHash)) {
    throw new StateError(
      "spend puzzle reveal does not hash to its coin's puzzle hash",
    );
  }

  const inner = innerSolution(spend);
  const curriedArgs = inner[0];
  const operationSolution = inner.length > 2 ? inner[2] : NIL;

  // The revealed puzzle is authenticated (it hashes to the coin's puzzle hash),
  // and it curries in `CURRIED-ARGS-HASH`. Requiring the solution's revealed
  // pre-spend state to match it binds that state to the coin, so a solution
  // cannot be paired with a puzzle it does not belong to.
  const curriedArgsHash = curriedArgsHashOf(puzzle);
  if (
    curriedArgsHash !== null &&
    !bytesEqual(sha256tree(curriedArgs), curriedArgsHash)
  ) {
    throw new StateError(
      "the spend's revealed state does not match the CURRIED-ARGS-HASH its " +
        "own puzzle commits to",
    );
  }

  const bound = bindLineage(inner[1]);
  const lineageBound =
    bound !== null && bytesEqual(bound.launcherId, launcherId);

  for (const candidate of candidateStates(curriedArgs, operationSolution)) {
    let state: JuliaDidState;
    try {
      state = parseState(candidate.state);
    } catch {
      continue;
    }
    if (!bytesEqual(state.launcherId, launcherId)) continue;
    if (!verifyState(state, currentCoinPuzzleHash)) continue;
    // A current-puzzle DID MUST bind: `julia_did` itself refuses a spend whose
    // parent-info does not re-derive the launcher ID, so a spend that fails
    // here could never have been accepted by consensus.
    if (!lineageBound && isCurrentPuzzle(state)) {
      throw new StateError(
        "the spend's parent-info does not re-derive this DID's launcher ID; " +
          "consensus would have rejected this spend",
      );
    }
    return {
      state,
      previous: curriedArgs,
      operation: candidate.operation,
      source: candidate.source,
      genesisKeyHash: lineageBound ? bound!.genesisKeyHash : null,
    };
  }

  throw new UnverifiableStateError(
    "no known did:julia state transition reproduces the current coin's " +
      "puzzle hash; the spend uses a puzzle version this resolver does not " +
      "understand",
  );
}

/**
 * `CURRIED-ARGS-HASH` from an authenticated singleton puzzle reveal: uncurry
 * the standard singleton top layer, then its `julia_did` inner puzzle, which
 * is curried with exactly that one argument. Returns null when the reveal is
 * not in that shape, so an unrecognized puzzle version is not rejected on
 * structure alone.
 */
function curriedArgsHashOf(puzzle: Node): Uint8Array | null {
  const outer = uncurry(puzzle);
  if (outer === null || outer[1].length !== 2) return null;
  const inner = uncurry(outer[1][1]);
  if (inner === null || inner[1].length !== 1) return null;
  const argument = inner[1][0];
  return isAtom(argument) && argument.length === 32 ? argument : null;
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
export function revealedKeysFromSpend(
  spend: CoinSpend,
  state: JuliaDidState,
): Uint8Array[] {
  let inner: Node[];
  let ownAuthentication: Node;
  try {
    inner = innerSolution(spend);
    ownAuthentication = toList(inner[0])[3];
  } catch {
    return [];
  }
  if (ownAuthentication === undefined) return [];
  if (!bytesEqual(sha256tree(ownAuthentication), sha256tree(state.raw[3]))) {
    return [];
  }

  const keys: Uint8Array[] = [];
  const seen = new Set<string>();
  const stack: Node[] = [inner.length > 2 ? inner[2] : NIL];
  while (stack.length > 0) {
    const node = stack.pop() as Node;
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
export async function genesisPublicKey(
  client: FullNodeClient,
  lineage: SingletonLineage,
  expectedKeyHash: Uint8Array | null,
  signal?: AbortSignal,
): Promise<Uint8Array | null> {
  // Without a hash the DID itself commits to, a revealed key proves only that
  // the endpoint is self-consistent — which a hostile endpoint trivially is.
  // Offer no genesis key at all rather than an unbound one.
  if (expectedKeyHash === null) return null;
  const prelauncher = lineage.prelauncher;
  if (!prelauncher.spent) return null;
  const spend = await client.getPuzzleAndSolution(
    coinId(prelauncher.coin),
    prelauncher.spentBlockIndex,
    signal,
  );
  const puzzle = deserialize(spend.puzzleReveal);
  if (!bytesEqual(sha256tree(puzzle), prelauncher.coin.puzzleHash)) {
    throw new StateError(
      "prelauncher puzzle reveal does not hash to its coin puzzle hash",
    );
  }
  const uncurried = uncurry(puzzle);
  if (uncurried === null) return null;
  const keys = uncurried[1].filter(
    (arg): arg is Uint8Array => isAtom(arg) && arg.length === BLS_G1_SIZE,
  );
  if (keys.length !== 1) return null;
  if (!bytesEqual(sha256tree(keys[0]), expectedKeyHash)) {
    throw new StateError(
      "the prelauncher reveals a key other than the one this DID's launcher " +
        "ID commits to",
    );
  }
  return keys[0];
}

/** True when the state's puzzle-version slot is the current `julia_did`. */
export function isCurrentPuzzle(state: JuliaDidState): boolean {
  return bytesEqual(state.juliaDidPuzzleHash, CURRENT_JULIA_DID_PUZZLE_HASH);
}
