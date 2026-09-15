export type Atom = Uint8Array;
export type Pair = [Node, Node];
export type Node = Atom | Pair;
export declare const NIL: Atom;
export declare const ONE: Atom;
/** Largest CLVM blob the resolver will parse (puzzle reveals and solutions). */
export declare const MAX_BLOB_BYTES: number;
/** Largest structural depth the resolver will build. */
export declare const MAX_DEPTH = 2048;
export declare class ClvmError extends Error {
}
export declare function isPair(node: Node): node is Pair;
export declare function isAtom(node: Node): node is Atom;
/** Deserialize the standard CLVM wire format. Rejects trailing bytes. */
export declare function deserialize(blob: Uint8Array): Node;
/** Serialize a Node back to the standard CLVM wire format. */
export declare function serialize(node: Node): Uint8Array;
/** sha256(0x01 || atom) — the CLVM tree hash of an atom. */
export declare function atomHash(atom: Atom): Uint8Array;
/** sha256(0x02 || left || right) — the CLVM tree hash of a pair. */
export declare function pairHash(left: Uint8Array, right: Uint8Array): Uint8Array;
/** CLVM tree hash. Iterative: depth is bounded by the deserializer, but the
 * same routine also hashes trees this resolver builds itself. */
export declare function sha256tree(node: Node): Uint8Array;
/**
 * Tree hash of `curry(mod, args)` from the mod's tree hash and each argument's
 * tree hash, without materializing the curried program. A curried puzzle is
 * `(a (q . mod) (c (q . arg1) (c (q . arg2) 1)))`.
 */
export declare function curriedPuzzleHash(modHash: Uint8Array, argHashes: Uint8Array[]): Uint8Array;
/** If `node` is a curried program `(a (q . mod) env)`, return `[mod, args]`. */
export declare function uncurry(node: Node): [Node, Node[]] | null;
/** Materialize a proper CLVM list. Throws on an improper tail. */
export declare function toList(node: Node): Node[];
/** Build a proper CLVM list from items. */
export declare function fromList(items: Node[]): Node;
/** CLVM atom to integer (big-endian, two's complement). */
export declare function asInt(atom: Node): number;
/** Integer to the minimal CLVM atom encoding. */
export declare function intToAtom(value: number | bigint): Uint8Array;
/** Structural equality of two CLVM values. */
export declare function nodeEquals(a: Node, b: Node): boolean;
export declare function bytesEqual(a: Uint8Array, b: Uint8Array): boolean;
export declare function toHex(bytes: Uint8Array): string;
export declare function fromHex(hex: string): Uint8Array;
//# sourceMappingURL=clvm.d.ts.map