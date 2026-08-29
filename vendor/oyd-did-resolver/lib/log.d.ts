/**
 * Transliteration of `ruby-gem/lib/oydid/log.rb` from the OYDID reference,
 * pinned at OwnYourData/oydid@48a62c9, against spec v0.6 §4 (#log,
 * #log_ops). The tiny Dag class stands in for the reference's `simple_dag`
 * gem with the same vertex/edge/successors/predecessors surface. Control
 * flow mirrors the Ruby 1:1; trace output is omitted (REFERENCE-MAP).
 */
import { type DidInfo, type LogEntry, type OydOptions } from "./basic.js";
/** Log operation codes (spec §4.1 #log_ops; DELEGATE is implementation-
 *  defined in the reference). The Ruby reference compares raw integers with
 *  a `# TERMINATE`-style comment on each — these named constants carry the
 *  same information in the code itself. */
export declare const Op: {
    readonly TERMINATE: 0;
    readonly REVOKE: 1;
    readonly CREATE: 2;
    readonly UPDATE: 3;
    readonly CLONE: 4;
    readonly DELEGATE: 5;
};
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
/** ⇔ match_log_did? (log.rb:18) · spec §4.2.3 #verify_signature */
export declare function matchLogDid(log: LogEntry, doc: {
    key?: string;
}): Promise<boolean | null>;
/** ⇔ dag_did (log.rb:98) · spec §4 #log — two passes exactly like the
 *  reference: provisional edges to find the tangling TERMINATE, then the
 *  actual edges with the DELEGATE restriction. */
export declare function dagDid(logs: LogEntry[], options: OydOptions): Promise<[Dag | null, number | null, number | null, string]>;
/** ⇔ dag2array (log.rb:222) — depth-first from the CREATE entry. A visited
 *  set bounds recursion to O(vertices) and makes a malicious cyclic graph
 *  terminate instead of overflowing the stack (finding 5); on an acyclic
 *  graph — which the hash-uniqueness check in dagDid enforces — it visits
 *  the same set of nodes as the reference. */
export declare function dag2array(dag: Dag, logArray: LogEntry[], index: number, result: LogEntry[], visited?: Set<number>): LogEntry[];
/** ⇔ dag2array_terminate (log.rb:246) — the TERMINATE entry last. */
export declare function dag2arrayTerminate(dag: Dag, logArray: LogEntry[], index: number, result: LogEntry[]): LogEntry[];
/** ⇔ REVOKED_ERROR_CODE (log.rb:268) · spec §3.2.3 #deactivation */
export declare const REVOKED_ERROR_CODE = 410;
/** ⇔ dag_update (log.rb:270) — walks the ordered log, verifying every hop:
 *  CREATE/UPDATE signatures, the document→TERMINATE log commitment, the
 *  revocation chain, and — when followAlsoKnownAs is set — the DID Rotation
 *  branch (spec §4.2 #verification, §3.2.3 #deactivation). Rotation is OFF
 *  by default so a DIF driver answers only for the requested DID; hosts
 *  that follow rotation (e.g. a local CLI) supply the option and a
 *  resolveRotationTarget — REFERENCE-MAP §2. */
export declare function dagUpdate(currentDID: DidInfo, options: OydOptions): Promise<DidInfo>;
//# sourceMappingURL=log.d.ts.map