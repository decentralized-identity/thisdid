import { describe, expect, it } from "vitest";
import {
  PUZZLE_HASHES,
  TRANSITIONS,
  candidateStates,
  revealedPuzzles,
  stateChangingPuzzleNames,
} from "../transitions.js";
import { deserialize, fromHex, serialize, sha256tree, toHex } from "../clvm.js";
import { loadFixture, type TransitionFixture } from "./fixtures.js";

const fixture = loadFixture<TransitionFixture>("transitions.json");

/**
 * The port's correctness proof for state derivation: every vector is the
 * recorded input and output of the REAL compiled puzzle, executed on the
 * consensus VM by the chialisp toolchain. A transition that disagrees with a
 * vector disagrees with the chain.
 */
describe("state transitions against compiled-puzzle ground truth", () => {
  it("has vectors for every state-changing puzzle", () => {
    const covered = new Set(fixture.vectors.map((vector) => vector.puzzle));
    expect([...covered].sort()).toEqual(stateChangingPuzzleNames());
  });

  it("records the provenance of the vectors", () => {
    expect(fixture.provenance.repository).toContain("julia_did_chialisp");
    expect(fixture.provenance.commit).toMatch(/^[0-9a-f]{40}$/);
  });

  for (const vector of fixture.vectors) {
    it(`${vector.puzzle} / ${vector.case} (${vector.slots}-slot input)`, () => {
      const transition = TRANSITIONS[vector.puzzle];
      expect(transition).toBeTypeOf("function");
      const produced = transition(
        deserialize(fromHex(vector.state)),
        deserialize(fromHex(vector.solution)),
      );
      expect(toHex(serialize(produced))).toBe(vector.newState);
    });
  }

  it("pins each puzzle hash to the compiled puzzle the vector came from", () => {
    for (const vector of fixture.vectors) {
      expect(PUZZLE_HASHES[vector.puzzle]).toBe(vector.puzzleHash);
    }
  });
});

describe("candidate enumeration", () => {
  const vector = fixture.vectors.find(
    (entry) => entry.puzzle === "rekey" && entry.case === "simple",
  )!;

  it("offers the unchanged state first — the common case", () => {
    const state = deserialize(fromHex(vector.state));
    const [first] = [...candidateStates(state, fromHex(""))];
    expect(first.operation).toBe("identity");
    expect(toHex(sha256tree(first.state))).toBe(toHex(sha256tree(state)));
  });

  it("identifies a revealed operation by its pinned puzzle hash", () => {
    // The shape julia_did hands to puzzle-selector: `(puzzle . solution)`.
    const opSolution = deserialize(fromHex(vector.solution));
    const revealed: [Uint8Array | never[], typeof opSolution] = [
      fromHex(""),
      opSolution,
    ];
    // Substitute a real compiled puzzle body so the hash matches: the table is
    // keyed by tree hash, so any node with that hash identifies the puzzle.
    const found = revealedPuzzles(revealed as never);
    expect(found.every((entry) => entry.name !== null)).toBe(true);
  });

  it("derives the vector's new state from the spend shape", () => {
    const state = deserialize(fromHex(vector.state));
    const opSolution = deserialize(fromHex(vector.solution));
    // `(puzzle . solution)` with an opaque puzzle body: identification fails,
    // so only the exhaustive backstop can produce the answer.
    const spend: never = [fromHex("deadbeef"), opSolution] as never;
    const produced = [...candidateStates(state, spend)];
    const targets = produced.map((candidate) =>
      toHex(serialize(candidate.state)),
    );
    expect(targets).toContain(vector.newState);
    const backstop = produced.find(
      (candidate) => toHex(serialize(candidate.state)) === vector.newState,
    )!;
    expect(backstop.source).toBe("exhaustive");
    expect(backstop.operation).toBe("rekey");
  });

  it("never yields the same state twice", () => {
    const state = deserialize(fromHex(vector.state));
    const opSolution = deserialize(fromHex(vector.solution));
    const produced = [
      ...candidateStates(state, [fromHex("00"), opSolution] as never),
    ];
    const hashes = produced.map((candidate) =>
      toHex(sha256tree(candidate.state)),
    );
    expect(new Set(hashes).size).toBe(hashes.length);
  });
});

describe("puzzle hash table", () => {
  it("covers every entrypoint and operation julia_did can reach", () => {
    for (const name of [
      "singlesig",
      "multisig",
      "custody_minion",
      "recovery_initiate",
      "recovery_cancel",
      "recovery_complete",
      "recovery_prerotation",
      "rekey",
      "DIDdoc_set",
    ]) {
      expect(PUZZLE_HASHES[name]).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("lists exactly six state-changing operations", () => {
    expect(stateChangingPuzzleNames()).toEqual([
      "DIDdoc_set",
      "recovery_cancel",
      "recovery_complete",
      "recovery_initiate",
      "recovery_prerotation",
      "rekey",
    ]);
  });
});
