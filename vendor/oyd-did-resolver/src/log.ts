/**
 * Transliteration of `ruby-gem/lib/oydid/log.rb` from the OYDID reference,
 * pinned at OwnYourData/oydid@48a62c9, against spec v0.6 §4 (#log,
 * #log_ops). The tiny Dag class stands in for the reference's `simple_dag`
 * gem with the same vertex/edge/successors/predecessors surface. Control
 * flow mirrors the Ruby 1:1; trace output is omitted (REFERENCE-MAP).
 */
import {
  canonical,
  getDigest,
  getEncoding,
  multiHash,
  retrieveDocumentRaw,
  retrieveLog,
  stripLocation,
  verify,
  DidError,
  LOG_HASH_OPTIONS,
  Op,
  type DidInfo,
  type LogEntry,
  type OydOptions,
} from "./basic.js";
import { MAX_LOG_ENTRIES, MAX_PREVIOUS_PER_ENTRY } from "./security.js";

// `Op` (the log operation codes) is owned by basic.ts alongside `LogEntry`;
// re-exported here so existing `log.js` importers keep working.
export { Op } from "./basic.js";
export type { OpCode } from "./basic.js";

/** ⇔ the `simple_dag` API surface dag_did/dag2array rely on */
export interface Vertex {
  id: number;
  successors: Vertex[];
  predecessors: Vertex[];
}

export class Dag {
  readonly vertices: Vertex[] = [];

  addVertex(id: number): Vertex {
    const vertex: Vertex = { id, successors: [], predecessors: [] };
    this.vertices.push(vertex);
    return vertex;
  }

  addEdge(from: Vertex, to: Vertex): void {
    from.successors.push(to);
    to.predecessors.push(from);
  }
}

/** The substring after the last `separator`, or "" when it is absent —
 *  the assertion-free form of `s.split(sep).pop()` when `sep` is present. */
function afterLast(value: string, separator: string): string {
  const index = value.lastIndexOf(separator);
  return index === -1 ? "" : value.slice(index + separator.length);
}

/** The slice of a log entry that is hashed
 *  (⇔ `el.slice("ts","op","doc","sig","previous")`; spec §4.2.2). */
function logSlice(entry: LogEntry): Record<string, unknown> {
  const slice: Record<string, unknown> = {};
  for (const field of ["ts", "op", "doc", "sig", "previous"]) {
    if (field in entry) slice[field] = entry[field];
  }
  return slice;
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
export async function dedupeLogEntries(logs: LogEntry[]): Promise<LogEntry[]> {
  const seen = new Set<string>();
  const unique: LogEntry[] = [];
  for (const el of logs) {
    const hash = (
      await multiHash(canonical(logSlice(el)), LOG_HASH_OPTIONS)
    )[0];
    const key = hash ?? JSON.stringify(logSlice(el));
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(el);
  }
  return unique;
}

/** ⇔ match_log_did? (log.rb:18) · spec §4.2.3 #verify_signature */
export async function matchLogDid(
  log: LogEntry,
  doc: { key?: string },
): Promise<boolean | null> {
  const message = String(log.doc ?? "");
  const signature = String(log.sig ?? "");
  const publicKeys = String(doc.key ?? "");
  const publicKey = publicKeys.split(":")[0] ?? "";
  return (await verify(message, signature, publicKey))[0];
}

/** ⇔ dag_did (log.rb:98) · spec §4 #log — two passes exactly like the
 *  reference: provisional edges to find the tangling TERMINATE, then the
 *  actual edges with the DELEGATE restriction. */
export async function dagDid(
  logs: LogEntry[],
  options: OydOptions,
): Promise<[Dag | null, number | null, number | null, string]> {
  // resource bounds (finding 5): reject pathological logs before any graph
  // work or hashing. The limits are deployment-configurable (defaults from
  // security.ts); exceeding one is reported as a service limit (internalError
  // via errorCodeFor), not a malformed document. An override is honored only
  // when it is a finite non-negative integer — otherwise the default stands,
  // so a bad value (NaN, ±Infinity, negative, fractional) can never silently
  // DISABLE the bound (`length > NaN` is always false).
  const boundOr = (value: number | undefined, fallback: number): number =>
    typeof value === "number" && Number.isInteger(value) && value >= 0
      ? value
      : fallback;
  const maxLogEntries = boundOr(options.maxLogEntries, MAX_LOG_ENTRIES);
  const maxPreviousRefs = boundOr(
    options.maxPreviousRefs,
    MAX_PREVIOUS_PER_ENTRY,
  );
  if (logs.length > maxLogEntries) {
    return [null, null, null, "log entries exceed the maximum"];
  }
  for (const el of logs) {
    if ((el.previous ?? []).length > maxPreviousRefs) {
      return [null, null, null, "too many back-references in a log entry"];
    }
  }

  let dag = new Dag();
  let dagLog: Vertex[] = [];
  let logHash: string[] = [];

  // calculate hash values for each entry and build vertices
  let createEntries = 0;
  let createIndex: number | null = null;
  for (let i = 0; i < logs.length; i++) {
    const el = logs[i];
    if (el.op === Op.CREATE) {
      createEntries += 1;
      createIndex = i;
    }
    logHash.push(
      (await multiHash(canonical(logSlice(el)), LOG_HASH_OPTIONS))[0] ?? "",
    );
    dagLog.push(dag.addVertex(i));
  }
  if (createEntries !== 1) {
    return [
      null,
      null,
      null,
      "wrong number of CREATE entries (" + createEntries + ") in log",
    ];
  }
  if (!logs.some((el) => el.op === Op.TERMINATE)) {
    return [null, null, null, "missing TERMINATE entries"];
  }

  // create provisional edges between vertices. A hash→first-index map makes
  // this O(V+E) rather than O(V×E) `indexOf` scans (first occurrence, exactly
  // as `indexOf` resolved before the duplicate-hash check below runs).
  const provisionalIndex = firstIndexByHash(logHash);
  for (let i = 0; i < logs.length; i++) {
    for (const p of logs[i].previous ?? []) {
      const position = provisionalIndex.get(p) ?? -1;
      if (position !== -1) dag.addEdge(dagLog[position], dagLog[i]);
    }
  }

  // identify tangling TERMINATE entry
  let terminateEntries = 0;
  let terminateIndex: number | null = null;
  let revokedTerminateFound = false;
  for (let i = 0; i < logs.length; i++) {
    const el = logs[i];
    if (el.op === Op.TERMINATE) {
      if (dag.vertices[i].successors.length === 0) {
        terminateEntries += 1;
        terminateIndex = i;
      }
    } else if (el.op === Op.REVOKE) {
      // get terminate_index for revoked DIDs
      if (dag.vertices[i].successors.length === 0) {
        for (const l of dag.vertices[i].predecessors) {
          if (logs[l.id].op === Op.TERMINATE) {
            terminateIndex = l.id;
            revokedTerminateFound = true;
          }
        }
      }
    }
  }

  // structural check on the log (⇔ the "cannot resolve DID" guard); a
  // revoked DID has no tangling TERMINATE entry — that is not a broken log
  if (
    terminateEntries !== 1 &&
    !options.log_complete &&
    !options.followAlsoKnownAs
  ) {
    if (!(terminateEntries === 0 && revokedTerminateFound)) {
      return [null, null, null, "cannot resolve DID"];
    }
  }

  // create actual edges (only delegates in the last terminate index count)
  dag = new Dag();
  dagLog = [];
  logHash = [];
  createEntries = 0;
  createIndex = null;
  for (let i = 0; i < logs.length; i++) {
    const el = logs[i];
    if (el.op === Op.CREATE) {
      createEntries += 1;
      createIndex = i;
    }
    logHash.push(
      (await multiHash(canonical(logSlice(el)), LOG_HASH_OPTIONS))[0] ?? "",
    );
    dagLog.push(dag.addVertex(i));
  }
  // reject ambiguous graphs: distinct entries must have distinct hashes, so
  // a `previous` reference resolves to exactly one entry (finding 4)
  if (new Set(logHash).size !== logHash.length) {
    return [null, null, null, "duplicate log entry hashes"];
  }
  // reject dangling back-references: every `previous` hash must resolve to an
  // entry in the returned log. Among the operations this driver resolves
  // (CREATE/UPDATE/REVOKE/TERMINATE/DELEGATE) there are no external
  // references; CLONE — the one op the spec defines with a cross-DID
  // predecessor — is not resolved here (nor by the reference's dag_update;
  // both reject it at the op level, the walk's default case), so within the
  // ops we walk an unknown hash is a defective (or manipulated) log, not a
  // silent no-op — the reference ignored these, this rejects them
  // (REFERENCE-MAP hardening).
  const logHashSet = new Set(logHash);
  for (const el of logs) {
    for (const p of el.previous ?? []) {
      if (!logHashSet.has(p)) {
        return [null, null, null, "dangling back-reference in log"];
      }
    }
  }
  const actualIndex = firstIndexByHash(logHash);
  for (let i = 0; i < logs.length; i++) {
    for (const p of logs[i].previous ?? []) {
      const position = actualIndex.get(p) ?? -1;
      if (position !== -1) {
        if (logs[position].op === Op.DELEGATE) {
          if (i === terminateIndex) {
            // only delegates in the last terminate index are relevant
            dag.addEdge(dagLog[position], dagLog[i]);
          }
        } else {
          dag.addEdge(dagLog[position], dagLog[i]);
        }
      }
    }
  }

  return [dag, createIndex, terminateIndex, ""];
}

/** hash → its FIRST index in the log (⇔ `logHash.indexOf`), built once so
 *  edge construction is O(V+E) instead of O(V×E). */
function firstIndexByHash(logHash: string[]): Map<string, number> {
  const index = new Map<string, number>();
  for (let i = 0; i < logHash.length; i++) {
    if (!index.has(logHash[i])) index.set(logHash[i], i);
  }
  return index;
}

/** ⇔ dag2array (log.rb:222) — depth-first from the CREATE entry. The visited
 *  set is what guarantees termination: it bounds recursion to O(vertices) so a
 *  cyclic graph terminates instead of overflowing the stack (finding 5).
 *  (Hash-linked cycles are computationally infeasible to construct — each
 *  `previous` names an entry by hash, so a cycle needs a hash fixed point —
 *  but that infeasibility is not the code *proving* acyclicity; the visited
 *  set is.) On an acyclic graph it visits the same nodes as the reference. */
export function dag2array(
  dag: Dag,
  logArray: LogEntry[],
  index: number,
  result: LogEntry[],
  visited: Set<number> = new Set(),
): LogEntry[] {
  if (visited.has(index)) return [...new Set(result)];
  visited.add(index);
  result.push(logArray[index]);
  for (const s of dag.vertices[index].successors) {
    // check if successor has predecessor that is not self (i.e. REVOKE with TERMINATE)
    if (s.predecessors.length >= 2) {
      for (const p of s.predecessors) {
        if (p.id !== index) result.push(logArray[p.id]);
      }
    }
    dag2array(dag, logArray, s.id, result, visited);
  }
  return [...new Set(result)];
}

/** ⇔ dag2array_terminate (log.rb:246) — the TERMINATE entry last. */
export function dag2arrayTerminate(
  dag: Dag,
  logArray: LogEntry[],
  index: number,
  result: LogEntry[],
): LogEntry[] {
  const vertex: Vertex | undefined = dag.vertices[index];
  if (vertex) {
    for (const p of vertex.predecessors) {
      if (p.id !== index) result.push(logArray[p.id]);
    }
  }
  result.push(logArray[index]);
  return [...new Set(result)];
}

/** ⇔ REVOKED_ERROR_CODE (log.rb:268) · spec §3.2.3 #deactivation */
export const REVOKED_ERROR_CODE = DidError.REVOKED;

/** ⇔ dag_update (log.rb:270) — walks the ordered log, verifying every hop:
 *  CREATE/UPDATE signatures, the document→TERMINATE log commitment, the
 *  revocation chain, and — when followAlsoKnownAs is set — the DID Rotation
 *  branch (spec §4.2 #verification, §3.2.3 #deactivation). Rotation is OFF
 *  by default so a DIF driver answers only for the requested DID; hosts
 *  that follow rotation (e.g. a local CLI) supply the option and a
 *  resolveRotationTarget — REFERENCE-MAP §2. */
export async function dagUpdate(
  currentDID: DidInfo,
  options: OydOptions,
): Promise<DidInfo> {
  let i = 0;
  let revoked = false;
  let rotationPerformed = false;
  // UPDATE entries whose signature was verified against the prior version's
  // authorized keys in a revocation branch (finding 1) — an UPDATE may only
  // be installed if its hash is recorded here.
  const verifiedUpdateHashes = new Set<string>();
  // UPDATE candidates that referenced a revocation but FAILED signature
  // verification (D4 ruling): attacker-appendable junk — the log endpoint is
  // unauthenticated — so the walk SKIPS them rather than erroring (a hard
  // rejection would be a denial-of-service lever). Distinct from an UPDATE
  // that was never any revocation's candidate, which stays a hard rejection.
  const junkUpdateHashes = new Set<string>();
  let docLocation = options.doc_location ?? "";
  let initialDid = String(currentDID.did).replace(/^did:oyd:/, "");
  if (initialDid.includes("@")) {
    const tmp = initialDid.split("@");
    initialDid = tmp[0];
    docLocation = tmp[1];
  }
  if (initialDid.includes("%40")) {
    const tmp = initialDid.split("%40");
    initialDid = tmp[0];
    docLocation = tmp[1];
  }
  docLocation = docLocation.replace("%3A", ":").replace("%2F%2F", "//");

  walk: for (const el of currentDID.log) {
    switch (el.op) {
      case Op.CREATE:
      case Op.UPDATE: {
        if (el.op === Op.UPDATE) {
          // UPDATE authorization (finding 1 + D4 ruling), checked BEFORE any
          // fetch so junk cannot cost a round-trip or a retrieval error:
          // - a hash recorded as a NON-surviving revocation candidate is
          //   attacker-appendable junk — SKIPPED, never an error;
          // - the verified valid successor is installed below;
          // - an UPDATE that was never any revocation's candidate — e.g.
          //   one spliced directly onto CREATE — is rejected, not trusted.
          const updateHash = (
            await multiHash(canonical(logSlice(el)), LOG_HASH_OPTIONS)
          )[0];
          if (updateHash !== null && junkUpdateHashes.has(updateHash)) {
            break;
          }
          if (updateHash === null || !verifiedUpdateHashes.has(updateHash)) {
            currentDID.error = DidError.INVALID;
            currentDID.message = "unauthorized UPDATE log entry";
            return currentDID;
          }
        }
        currentDID.doc_log_id = i;
        const docDid = el.doc;

        const docResult = await retrieveDocumentRaw(
          docDid,
          docLocation,
          options,
        );
        if (docResult[0] === null) {
          currentDID.error = DidError.RETRIEVAL;
          currentDID.message =
            docResult[1] !== "" ? docResult[1] : "cannot retrieve " + docDid;
          return currentDID;
        }
        const doc = docResult[0].doc;
        if (el.op === Op.CREATE) {
          // Tolerant of a missing CREATE signature unless strict — D1 ruling:
          // the tolerance is PERMANENT (1,643 production CREATEs predate the
          // Client-Managed-Secret-Mode signature collection phase and carry
          // none; ⇔ the reference's comment, log.rb:314). A signature that
          // IS present must verify; new CREATEs are always signed.
          if (el.sig == null) {
            if (options.strict_create_sig) {
              currentDID.error = DidError.INVALID;
              currentDID.message = "missing signature in CREATE log entry";
              return currentDID;
            }
          } else if (!(await matchLogDid(el, doc))) {
            currentDID.error = DidError.INVALID;
            currentDID.message = "Signatures in log don't match";
            return currentDID;
          }
        }
        currentDID.did = docDid;
        currentDID.doc = doc;
        // record this version's DOCUMENT key for pubkey-form identifier
        // binding (spec §3.2.4 #pubkey_identifier defines the form on the
        // document public key — NOT the revocation key, so the rev half of
        // `docKey:revKey` is deliberately excluded).
        if (typeof doc.key === "string") {
          const [documentKey] = doc.key.split(":");
          if (documentKey) {
            currentDID.version_document_keys = [
              ...(currentDID.version_document_keys ?? []),
              documentKey,
            ];
          }
        }
        break;
      }
      case Op.TERMINATE: {
        currentDID.termination_log_id = i;

        const docDid = currentDID.did;
        const didHash = stripLocation(docDid.replace(/^did:oyd:/, ""));
        const docResult = await retrieveDocumentRaw(
          docDid,
          docLocation,
          options,
        );
        if (docResult[0] === null) {
          currentDID.error = DidError.RETRIEVAL;
          currentDID.message = docResult[1];
          return currentDID;
        }
        const doc = docResult[0].doc;

        if (!(await matchLogDid(el, doc))) {
          currentDID.error = DidError.INVALID;
          currentDID.message = "Signatures in log don't match";
          return currentDID;
        }

        // the document's `log` field must be the hash of this TERMINATE
        // entry (spec §4.2.2 #calculate_hash)
        let term = doc.log;
        let logLocation = term.includes("@")
          ? afterLast(term, "@")
          : term.includes("%40")
            ? afterLast(term, "%40")
            : "";
        if (logLocation === "" || logLocation === term) {
          logLocation = "";
        }
        term = stripLocation(term);
        const elHash = stripLocation(el.doc);
        const logOptions: OydOptions = { ...options };
        logOptions.digest = getDigest(elHash)[0] ?? undefined;
        logOptions.encode = getEncoding(elHash)[0] ?? undefined;
        if (
          (await multiHash(canonical(logSlice(el)), logOptions))[0] !== term
        ) {
          currentDID.error = DidError.INVALID;
          currentDID.message = "Log reference and record don't match";
          return currentDID;
        }

        // check if there is a revocation entry (spec §3.2.3 #deactivation).
        // The revocation lookup MUST fail closed (finding 3): a timeout,
        // HTTP error, oversized or malformed response must not be read as
        // "no revocation exists" and serve a possibly-revoked document.
        let revocationRecord: LogEntry | null = null;
        const revocTerm = stripLocation(el.doc);
        const [rawRevocationLog] = await retrieveLog(
          didHash,
          logLocation,
          options,
        );
        if (rawRevocationLog === null) {
          // whatever the cause — timeout, HTTP error, malformed or oversized
          // response — the revocation check could not be completed, which is
          // an operational failure, never "no revocation exists"
          currentDID.error = DidError.RETRIEVAL;
          currentDID.message = "revocation log unavailable";
          return currentDID;
        }
        // replay guard: collapse byte-identical appended copies before the
        // candidate scan (a replayed valid UPDATE must count once, not twice)
        const logArray = await dedupeLogEntries(rawRevocationLog);
        for (const logEl of logArray) {
          const structure: LogEntry = { ...logEl };
          if (logEl.op === Op.REVOKE) {
            // REVOKE records are hashed without their `previous` attribute
            delete (structure as Record<string, unknown>)["previous"];
          }
          if (
            (await multiHash(canonical(logSlice(structure)), logOptions))[0] ===
            revocTerm
          ) {
            revocationRecord = logEl;
            break;
          }
        }

        if (revocationRecord !== null) {
          // MANDATORY BY DEFAULT (author rulings D2/D3, adopted by the
          // reference as of gem 0.9.4): prove the revocation was AUTHORIZED
          // by the version's revocation key and COMMITS to the version it
          // revokes, not merely that it was precommitted. The check runs
          // unless the caller EXPLICITLY opts out (`!== false`, never a
          // truthy gate) so the ruling is universal — direct `read()` /
          // `dagUpdate()` callers passing `{}` get it too, and only
          // `strict_revocation_sig: false` restores legacy pre-0.9.4 parity.
          // The TERMINATE→REVOKE hash commitment alone stops a
          // repository/MITM from substituting a revocation, but proves
          // neither revocation-key authorization nor the revoked version
          // (§4.2.3 / §4.1). Fails closed.
          if (options.strict_revocation_sig !== false) {
            const revocationKey = currentDID.doc.key.split(":")[1] ?? "";
            const authorized = (
              await verify(
                String(revocationRecord.doc),
                String(revocationRecord.sig ?? ""),
                revocationKey,
              )
            )[0];
            if (authorized !== true) {
              currentDID.error = DidError.INVALID;
              currentDID.message =
                "revocation signature does not match revocation key";
              return currentDID;
            }
            // …and the REVOKE must COMMIT to the version it revokes: spec
            // §4.1 defines op=1 `doc` as the hash of the version's document
            // and key. Preimage CONFIRMED by the method author (D3 ruling —
            // all 1,117 production revocations match, zero exceptions):
            // multi_hash(canonical({doc, key})) of the revoked version's
            // record, with the digest and encoding derived FROM THE STORED
            // VALUE ITSELF (per the author's request, so non-default
            // multiformats don't false-negative). Without this check, a
            // correctly rev-key-signed REVOKE naming arbitrary content would
            // still be honored.
            const revokeDocValue = String(revocationRecord.doc);
            const [expectedRevokeDoc, expectedError] = await multiHash(
              canonical({
                doc: currentDID.doc.doc,
                key: currentDID.doc.key,
              }),
              {
                digest: getDigest(revokeDocValue)[0] ?? undefined,
                encode: getEncoding(revokeDocValue)[0] ?? undefined,
              },
            );
            if (expectedRevokeDoc === null) {
              currentDID.error = DidError.INVALID;
              currentDID.message =
                expectedError !== ""
                  ? expectedError
                  : "revocation commitment could not be computed";
              return currentDID;
            }
            if (revokeDocValue !== expectedRevokeDoc) {
              currentDID.error = DidError.INVALID;
              currentDID.message =
                "revocation does not commit to the revoked version";
              return currentDID;
            }
          }
          // the revocation is published — only a VALID UPDATE building on
          // it keeps the DID alive. D4 ruling: collect EVERY op=3 whose
          // `previous` references this revocation, verify each signature
          // against the superseded version's OWN document key (delegation is
          // not honored — and per D7, the reference itself adopted exactly
          // this rule in gem 0.9.4 after the takeover it permitted was
          // demonstrated), then require EXACTLY ONE valid survivor. An
          // invalid candidate is junk anyone could append to the
          // unauthenticated log endpoint — ignored, never an error
          // (first-match or naive more-than-one ⇒ error would both hand
          // attackers a denial-of-service). Two VALID survivors are a
          // genuine fork: ambiguous, fail closed.
          const revocationHash = (
            await multiHash(canonical(revocationRecord), LOG_HASH_OPTIONS)
          )[0];
          const authorizedKey = currentDID.doc.key.split(":")[0];
          // a Set, not an array: even if a replayed copy slipped past the
          // ingestion dedup, the same hash must count as ONE survivor
          const survivors = new Set<string>();
          for (const logEl of logArray) {
            if (logEl.op !== Op.UPDATE) continue;
            if (!(logEl.previous ?? []).includes(revocationHash ?? "")) {
              continue;
            }
            const updateHash = (
              await multiHash(canonical(logSlice(logEl)), LOG_HASH_OPTIONS)
            )[0];
            if (updateHash === null) continue;
            const valid =
              (
                await verify(
                  String(logEl.doc),
                  String(logEl.sig ?? ""),
                  authorizedKey,
                )
              )[0] === true;
            if (valid) survivors.add(updateHash);
            else junkUpdateHashes.add(updateHash);
          }
          if (survivors.size > 1) {
            currentDID.error = DidError.INVALID;
            currentDID.message = "ambiguous UPDATE successors after revocation";
            return currentDID;
          }
          for (const survivor of survivors) {
            verifiedUpdateHashes.add(survivor);
          }
          revoked = survivors.size === 0;
        } else {
          // ⇔ the reference's `else … break`: with no published revocation
          // record the walk ends at this TERMINATE entry
          break walk;
        }
        break;
      }
      case Op.REVOKE: {
        // handle DID Rotation (⇔ log.rb:557) — only on the log's last
        // entry, only when the host opted in
        if (i === currentDID.log.length - 1 && options.followAlsoKnownAs) {
          const payload = currentDID.doc?.doc;
          const rotateDID =
            typeof payload === "object" &&
            payload !== null &&
            !Array.isArray(payload)
              ? String(
                  (payload as Record<string, unknown>)["alsoKnownAs"] ?? "",
                )
              : "";
          if (rotateDID.startsWith("did:")) {
            const rotateMethod = rotateDID.split(":").slice(0, 2).join(":");
            if (rotateMethod === "did:ebsi" || rotateMethod === "did:cheqd") {
              // ⇔ the reference GETs DEFAULT_PUBLIC_RESOLVER and strips the
              // resolution-metadata keys; the host's injected resolver
              // stands in for that HTTP call (REFERENCE-MAP §2)
              const rotated = await options.resolveRotationTarget?.(rotateDID);
              if (rotated) {
                const document = { ...rotated };
                delete document["didDocumentMetadata"];
                delete document["didResolutionMetadata"];
                currentDID.did = rotateDID;
                currentDID.doc = { ...currentDID.doc, doc: document };
                currentDID.rotated = true;
                rotationPerformed = true;
              }
            }
            // ⇔ did:oyd rotation is unimplemented in the reference; other
            // methods: "do nothing: DID Rotation is not supported yet"
          }
        }
        break;
      }
      case Op.DELEGATE:
        // do nothing
        break;
      default:
        currentDID.error = DidError.RETRIEVAL;
        currentDID.message =
          "FATAL ERROR: op code '" + el.op + "' not implemented";
        return currentDID;
    }
    i += 1;
  }

  // fail closed: a revoked DID has no resolvable DID Document unless the
  // controller rotated it to another DID via alsoKnownAs (⇔ log.rb:609)
  if (revoked && !rotationPerformed) {
    currentDID.error = REVOKED_ERROR_CODE;
    currentDID.message = "revoked";
  }
  return currentDID;
}
