/**
 * Minimal CLVM utilities for the did:julia resolver.
 *
 * A CLVM value is an atom (`Uint8Array`) or a pair (`[left, right]`), the
 * same representation the Python reference resolver uses. This module
 * provides deserialization of the standard CLVM wire format, serialization,
 * the CLVM tree hash, uncurrying, and curried puzzle-hash computation.
 *
 * There is deliberately NO program evaluator here: the driver derives state
 * rather than executing it (see `docs/adr/0001-state-derivation-without-clvm.md`).
 *
 * Deserialization is iterative and bounded. It is the only place untrusted
 * bytes enter the resolver, so it caps both input size and tree depth; every
 * later traversal therefore operates on a tree of bounded depth.
 */
import { sha256 } from "@noble/hashes/sha256";

export type Atom = Uint8Array;
export type Pair = [Node, Node];
export type Node = Atom | Pair;

export const NIL: Atom = new Uint8Array(0);
export const ONE: Atom = Uint8Array.of(1);

/** Largest CLVM blob the resolver will parse (puzzle reveals and solutions). */
export const MAX_BLOB_BYTES = 512 * 1024;
/** Largest structural depth the resolver will build. */
export const MAX_DEPTH = 2048;

export class ClvmError extends Error {}

export function isPair(node: Node): node is Pair {
  return Array.isArray(node);
}

export function isAtom(node: Node): node is Atom {
  return !Array.isArray(node);
}

// ── serialization ───────────────────────────────────────────────────────────

const OP_READ = 0;
const OP_CONS = 1;

/** Deserialize the standard CLVM wire format. Rejects trailing bytes. */
export function deserialize(blob: Uint8Array): Node {
  if (blob.length > MAX_BLOB_BYTES) {
    throw new ClvmError(`CLVM blob exceeds ${MAX_BLOB_BYTES} bytes`);
  }
  let i = 0;
  const values: Node[] = [];
  const ops: number[] = [OP_READ];

  while (ops.length > 0) {
    if (ops.length > MAX_DEPTH * 2) {
      throw new ClvmError("CLVM object nested past the depth limit");
    }
    if (ops.pop() === OP_CONS) {
      const right = values.pop() as Node;
      const left = values.pop() as Node;
      values.push([left, right]);
      continue;
    }
    if (i >= blob.length) throw new ClvmError("truncated CLVM object");
    const op = blob[i];
    if (op === 0xff) {
      i += 1;
      ops.push(OP_CONS, OP_READ, OP_READ);
      continue;
    }
    if (op === 0x80) {
      i += 1;
      values.push(NIL);
      continue;
    }
    if (op <= 0x7f) {
      i += 1;
      values.push(Uint8Array.of(op));
      continue;
    }
    let size: number;
    let header: number;
    if (op <= 0xbf) {
      size = op & 0x3f;
      header = 1;
    } else if (op <= 0xdf) {
      size = ((op & 0x1f) << 8) | byteAt(blob, i + 1);
      header = 2;
    } else if (op <= 0xef) {
      size = readSize(blob, i, op & 0x0f, 2);
      header = 3;
    } else if (op <= 0xf7) {
      size = readSize(blob, i, op & 0x07, 3);
      header = 4;
    } else if (op <= 0xfb) {
      size = readSize(blob, i, op & 0x03, 4);
      header = 5;
    } else {
      throw new ClvmError(
        `invalid CLVM serialization byte 0x${op.toString(16).padStart(2, "0")}`,
      );
    }
    const start = i + header;
    if (size > MAX_BLOB_BYTES || start + size > blob.length) {
      throw new ClvmError("truncated CLVM atom");
    }
    values.push(blob.subarray(start, start + size));
    i = start + size;
  }

  if (i !== blob.length) {
    throw new ClvmError(`${blob.length - i} trailing bytes after CLVM object`);
  }
  return values[0];
}

function byteAt(blob: Uint8Array, index: number): number {
  if (index >= blob.length) throw new ClvmError("truncated CLVM atom header");
  return blob[index];
}

function readSize(
  blob: Uint8Array,
  start: number,
  high: number,
  extra: number,
): number {
  let size = high;
  for (let k = 1; k <= extra; k++) size = (size << 8) | byteAt(blob, start + k);
  return size >>> 0;
}

/** Serialize a Node back to the standard CLVM wire format. */
export function serialize(node: Node): Uint8Array {
  const chunks: Uint8Array[] = [];
  const stack: Node[] = [node];
  let steps = 0;
  while (stack.length > 0) {
    if (++steps > 1_000_000) throw new ClvmError("CLVM object too large");
    const current = stack.pop() as Node;
    if (isPair(current)) {
      chunks.push(Uint8Array.of(0xff));
      stack.push(current[1], current[0]);
      continue;
    }
    chunks.push(...encodeAtom(current));
  }
  return concat(chunks);
}

function encodeAtom(atom: Atom): Uint8Array[] {
  if (atom.length === 0) return [Uint8Array.of(0x80)];
  if (atom.length === 1 && atom[0] <= 0x7f) return [atom];
  const size = atom.length;
  if (size <= 0x3f) return [Uint8Array.of(0x80 | size), atom];
  if (size <= 0x1fff) {
    return [Uint8Array.of(0xc0 | (size >> 8), size & 0xff), atom];
  }
  if (size <= 0xfffff) {
    return [
      Uint8Array.of(0xe0 | (size >> 16), (size >> 8) & 0xff, size & 0xff),
      atom,
    ];
  }
  throw new ClvmError("atom too large for this serializer");
}

function concat(chunks: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const chunk of chunks) total += chunk.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

// ── tree hashing ────────────────────────────────────────────────────────────

/** sha256(0x01 || atom) — the CLVM tree hash of an atom. */
export function atomHash(atom: Atom): Uint8Array {
  const buffer = new Uint8Array(atom.length + 1);
  buffer[0] = 0x01;
  buffer.set(atom, 1);
  return sha256(buffer);
}

/** sha256(0x02 || left || right) — the CLVM tree hash of a pair. */
export function pairHash(left: Uint8Array, right: Uint8Array): Uint8Array {
  const buffer = new Uint8Array(1 + left.length + right.length);
  buffer[0] = 0x02;
  buffer.set(left, 1);
  buffer.set(right, 1 + left.length);
  return sha256(buffer);
}

/** CLVM tree hash. Iterative: depth is bounded by the deserializer, but the
 * same routine also hashes trees this resolver builds itself. */
export function sha256tree(node: Node): Uint8Array {
  const stack: Array<{ node: Node; expanded: boolean }> = [
    { node, expanded: false },
  ];
  const out: Uint8Array[] = [];
  while (stack.length > 0) {
    const frame = stack.pop() as { node: Node; expanded: boolean };
    if (isAtom(frame.node)) {
      out.push(atomHash(frame.node));
      continue;
    }
    if (frame.expanded) {
      const right = out.pop() as Uint8Array;
      const left = out.pop() as Uint8Array;
      out.push(pairHash(left, right));
      continue;
    }
    if (stack.length > MAX_DEPTH * 2) {
      throw new ClvmError("CLVM tree nested past the depth limit");
    }
    stack.push({ node: frame.node, expanded: true });
    stack.push({ node: frame.node[1], expanded: false });
    stack.push({ node: frame.node[0], expanded: false });
  }
  return out[0];
}

const QUOTE_HASH = atomHash(Uint8Array.of(1)); // opcode `q`
const APPLY_HASH = atomHash(Uint8Array.of(2)); // opcode `a`
const CONS_HASH = atomHash(Uint8Array.of(4)); // opcode `c`
const NIL_HASH = atomHash(NIL);
const ONE_HASH = QUOTE_HASH; // the environment reference `1`

/**
 * Tree hash of `curry(mod, args)` from the mod's tree hash and each argument's
 * tree hash, without materializing the curried program. A curried puzzle is
 * `(a (q . mod) (c (q . arg1) (c (q . arg2) 1)))`.
 */
export function curriedPuzzleHash(
  modHash: Uint8Array,
  argHashes: Uint8Array[],
): Uint8Array {
  let env = ONE_HASH;
  for (let i = argHashes.length - 1; i >= 0; i--) {
    const quotedArg = pairHash(QUOTE_HASH, argHashes[i]);
    env = pairHash(CONS_HASH, pairHash(quotedArg, pairHash(env, NIL_HASH)));
  }
  const quotedMod = pairHash(QUOTE_HASH, modHash);
  return pairHash(APPLY_HASH, pairHash(quotedMod, pairHash(env, NIL_HASH)));
}

// ── structure ───────────────────────────────────────────────────────────────

/** If `node` is a curried program `(a (q . mod) env)`, return `[mod, args]`. */
export function uncurry(node: Node): [Node, Node[]] | null {
  try {
    if (!isPair(node)) return null;
    const [op, rest] = node;
    if (!isAtom(op) || op.length !== 1 || op[0] !== 0x02) return null;
    if (!isPair(rest)) return null;
    const quotedMod = rest[0];
    if (!isPair(quotedMod)) return null;
    const [quote1, mod] = quotedMod;
    if (!isAtom(quote1) || quote1.length !== 1 || quote1[0] !== 0x01) {
      return null;
    }
    if (!isPair(rest[1])) return null;
    let env = rest[1][0];
    if (!isAtom(rest[1][1]) || rest[1][1].length !== 0) return null;

    const args: Node[] = [];
    while (!(isAtom(env) && env.length === 1 && env[0] === 0x01)) {
      if (!isPair(env) || args.length > MAX_DEPTH) return null;
      const [consOp, consRest] = env;
      if (!isAtom(consOp) || consOp.length !== 1 || consOp[0] !== 0x04) {
        return null;
      }
      if (!isPair(consRest)) return null;
      const quotedArg = consRest[0];
      if (!isPair(quotedArg)) return null;
      const [quote2, arg] = quotedArg;
      if (!isAtom(quote2) || quote2.length !== 1 || quote2[0] !== 0x01) {
        return null;
      }
      args.push(arg);
      const tail = consRest[1];
      if (!isPair(tail)) return null;
      if (!isAtom(tail[1]) || tail[1].length !== 0) return null;
      env = tail[0];
    }
    return [mod, args];
  } catch {
    return null;
  }
}

/** Materialize a proper CLVM list. Throws on an improper tail. */
export function toList(node: Node): Node[] {
  const items: Node[] = [];
  let current = node;
  while (!(isAtom(current) && current.length === 0)) {
    if (!isPair(current)) throw new ClvmError("improper CLVM list");
    if (items.length > MAX_DEPTH) throw new ClvmError("CLVM list too long");
    items.push(current[0]);
    current = current[1];
  }
  return items;
}

/** Build a proper CLVM list from items. */
export function fromList(items: Node[]): Node {
  let node: Node = NIL;
  for (let i = items.length - 1; i >= 0; i--) node = [items[i], node];
  return node;
}

/** CLVM atom to integer (big-endian, two's complement). */
export function asInt(atom: Node): number {
  if (!isAtom(atom)) throw new ClvmError("expected atom");
  if (atom.length === 0) return 0;
  if (atom.length > 6) throw new ClvmError("CLVM integer out of safe range");
  let value = 0;
  for (const byte of atom) value = value * 256 + byte;
  if (atom[0] & 0x80) value -= Math.pow(2, atom.length * 8);
  return value;
}

/** Integer to the minimal CLVM atom encoding. */
export function intToAtom(value: number | bigint): Uint8Array {
  let big = BigInt(value);
  if (big === 0n) return NIL;
  const bytes: number[] = [];
  const negative = big < 0n;
  while (negative ? big !== -1n : big !== 0n) {
    bytes.unshift(Number(big & 0xffn));
    big >>= 8n;
  }
  if (negative && (bytes[0] & 0x80) === 0) bytes.unshift(0xff);
  if (!negative && (bytes[0] & 0x80) !== 0) bytes.unshift(0x00);
  return Uint8Array.from(bytes);
}

/** Structural equality of two CLVM values. */
export function nodeEquals(a: Node, b: Node): boolean {
  if (isAtom(a) && isAtom(b)) return bytesEqual(a, b);
  if (isPair(a) && isPair(b)) {
    return nodeEquals(a[0], b[0]) && nodeEquals(a[1], b[1]);
  }
  return false;
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out;
}

export function fromHex(hex: string): Uint8Array {
  const body = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (body.length % 2 !== 0) throw new ClvmError("odd-length hex string");
  const out = new Uint8Array(body.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = Number.parseInt(body.substr(i * 2, 2), 16);
    if (Number.isNaN(byte)) throw new ClvmError("invalid hex string");
    out[i] = byte;
  }
  return out;
}
