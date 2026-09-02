/**
 * Transliteration of `ruby-gem/lib/oydid/log.rb` from the OYDID reference,
 * pinned at OwnYourData/oydid@48a62c9, against spec v0.6 §4 (#log,
 * #log_ops). The tiny Dag class stands in for the reference's `simple_dag`
 * gem with the same vertex/edge/successors/predecessors surface. Control
 * flow mirrors the Ruby 1:1; trace output is omitted (REFERENCE-MAP).
 */
import { type DidInfo, type LogEntry, type OydOptions } from "./basic.js";
export { Op } from "./basic.js";
export type { OpCode } from "./basic.js";
/** ⇔ the `simple_dag` API surface dag_did/dag2array rely on */
export interface Vertex {
    id: number;
    successors: Vertex[];
    predecessors: Vertex[];
}
export declare class Dag {
    readonly vertices: Vertex[];
    addVertex(id: number): Vertex;
    addEdge(from: Vertex, to: Vertex): void;
}
/** Collapse byte-identical replayed log entries, keeping the FIRST
 *  occurrence (D4 corollary). A duplicate-laden log from a source the
 *  resolver does not control — a custom `%40` repository, a hostile
 *  mirror — would otherwise deny resolution: a replayed CREATE or tangling
 *  TERMINATE trips the structural counts (as it does in the pinned
 *  reference's `dag_did`). The production repository's append endpoint
 *  already rejects byte-identical duplicates server-side (author-confirmed:
 *  `Log.stored?` + a UNIQUE index on the entry hash), and the author is
 *  adding this same collapse to the reference `dag_did` as defense-in-depth
 *  — so this guards the untrusted-source case, not the honest store. A
 *  byte-identical entry IS the same logical record — entries are
 *  content-addressed by the same full-entry hash that `previous` references
 *  resolve to — so collapsing repeats preserves every hash and signature
 *  property while removing the denial-of-service lever. Entries that differ
 *  anywhere (including `previous`) keep distinct hashes and are NOT
 *  collapsed, so a genuine fork (two distinct valid UPDATEs) still fails
 *  closed as ambiguous. */
export declare function dedupeLogEntries(logs: LogEntry[]): Promise<LogEntry[]>;
/** ⇔ match_log_did? (log.rb:18) · spec §4.2.3 #verify_signature */
export declare function matchLogDid(log: LogEntry, doc: {
    key?: string;
}): Promise<boolean | null>;
/** ⇔ dag_did (log.rb:98) · spec §4 #log — two passes exactly like the
 *  reference: provisional edges to find the tangling TERMINATE, then the
 *  actual edges with the DELEGATE restriction. */
export declare function dagDid(logs: LogEntry[], options: OydOptions): Promise<[Dag | null, number | null, number | null, string]>;
/** ⇔ dag2array (log.rb:222) — depth-first from the CREATE entry. The visited
 *  set is what guarantees termination: it bounds recursion to O(vertices) so a
 *  cyclic graph terminates instead of overflowing the stack (finding 5).
 *  (Hash-linked cycles are computationally infeasible to construct — each
 *  `previous` names an entry by hash, so a cycle needs a hash fixed point —
 *  but that infeasibility is not the code *proving* acyclicity; the visited
 *  set is.) On an acyclic graph it visits the same nodes as the reference. */
export declare function dag2array(dag: Dag, logArray: LogEntry[], index: number, result: LogEntry[], visited?: Set<number>): LogEntry[];
/** ⇔ dag2array_terminate (log.rb:246) — the TERMINATE entry last. */
export declare function dag2arrayTerminate(dag: Dag, logArray: LogEntry[], index: number, result: LogEntry[]): LogEntry[];
/** ⇔ REVOKED_ERROR_CODE (log.rb:268) · spec §3.2.3 #deactivation */
export declare const REVOKED_ERROR_CODE: 410;
/** ⇔ dag_update (log.rb:270) — walks the ordered log, verifying every hop:
 *  CREATE/UPDATE signatures, the document→TERMINATE log commitment, the
 *  revocation chain, and — when followAlsoKnownAs is set — the DID Rotation
 *  branch (spec §4.2 #verification, §3.2.3 #deactivation). Rotation is OFF
 *  by default so a DIF driver answers only for the requested DID; hosts
 *  that follow rotation (e.g. a local CLI) supply the option and a
 *  resolveRotationTarget — REFERENCE-MAP §2. */
export declare function dagUpdate(currentDID: DidInfo, options: OydOptions): Promise<DidInfo>;
//# sourceMappingURL=log.d.ts.map