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
/** Collapse PROTOCOL-IDENTICAL repeated log entries, keeping the FIRST
 *  occurrence (a corollary of the author's succession ruling: a duplicate-laden log must not deny
 *  resolution). Keyed by the canonical five-field log-entry hash
 *  (`ts`, `op`, `doc`, `sig`, `previous` — the same `logSlice` identity that
 *  `previous` references and the duplicate-hash invariant resolve on), so a
 *  repeat IS the same logical record and collapsing it preserves every hash
 *  and signature property.
 *
 *  Two consequences of keying on those five fields, both deliberate:
 *  entries differing WITHIN them stay distinct (a genuine fork — two valid
 *  UPDATEs — still fails closed as ambiguous), while entries differing only
 *  in extra properties DO collapse. The latter is the point: such a variant
 *  would collide with the original in every structural check anyway, so
 *  keying on anything narrower (e.g. raw bytes) would leave a
 *  variant-repeat gap open. Keep-first decides which representation
 *  survives.
 *
 *  This guards logs from sources the resolver does not control (a custom
 *  `%40` repository, a mirror); the production repository rejects duplicate
 *  entries server-side, and the same collapse is being adopted in the
 *  reference as defense-in-depth. */
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