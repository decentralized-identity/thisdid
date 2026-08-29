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
  LOG_HASH_OPTIONS,
  type DidInfo,
  type LogEntry,
  type OydOptions,
} from "./basic.js";
import { MAX_LOG_ENTRIES, MAX_PREVIOUS_PER_ENTRY } from "./security.js";

/** Log operation codes (spec §4.1 #log_ops; DELEGATE is implementation-
 *  defined in the reference). The Ruby reference compares raw integers with
 *  a `# TERMINATE`-style comment on each — these named constants carry the
 *  same information in the code itself. */
export const Op = {
  TERMINATE: 0,
  REVOKE: 1,
  CREATE: 2,
  UPDATE: 3,
  CLONE: 4,
  DELEGATE: 5,
} as const;

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

/** The slice of a log entry that is hashed
 *  (⇔ `el.slice("ts","op","doc","sig","previous")`; spec §4.2.2). */
function logSlice(entry: LogEntry): Record<string, unknown> {
  const slice: Record<string, unknown> = {};
  for (const field of ["ts", "op", "doc", "sig", "previous"]) {
    if (field in entry) slice[field] = entry[field];
  }
  return slice;
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
  // work or hashing
  if (logs.length > MAX_LOG_ENTRIES) {
    return [null, null, null, "log entries exceed the maximum"];
  }
  for (const el of logs) {
    if ((el.previous ?? []).length > MAX_PREVIOUS_PER_ENTRY) {
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

  // create provisional edges between vertices
  for (let i = 0; i < logs.length; i++) {
    for (const p of logs[i].previous ?? []) {
      const position = logHash.indexOf(p);
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
  // entry in the returned log. OYDID defines no external references, so an
  // unknown hash is a defective (or manipulated) log, not a silent no-op —
  // the reference ignored these, this rejects them (REFERENCE-MAP hardening).
  const logHashSet = new Set(logHash);
  for (const el of logs) {
    for (const p of el.previous ?? []) {
      if (!logHashSet.has(p)) {
        return [null, null, null, "dangling back-reference in log"];
      }
    }
  }
  for (let i = 0; i < logs.length; i++) {
    for (const p of logs[i].previous ?? []) {
      const position = logHash.indexOf(p);
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

/** ⇔ dag2array (log.rb:222) — depth-first from the CREATE entry. A visited
 *  set bounds recursion to O(vertices) and makes a malicious cyclic graph
 *  terminate instead of overflowing the stack (finding 5); on an acyclic
 *  graph — which the hash-uniqueness check in dagDid enforces — it visits
 *  the same set of nodes as the reference. */
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
export const REVOKED_ERROR_CODE = 410;

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
        currentDID.doc_log_id = i;
        const docDid = el.doc;

        const docResult = await retrieveDocumentRaw(
          docDid,
          docLocation,
          options,
        );
        if (docResult[0] === null) {
          currentDID.error = 2;
          currentDID.message =
            docResult[1] !== "" ? docResult[1] : "cannot retrieve " + docDid;
          return currentDID;
        }
        const doc = docResult[0].doc;
        if (el.op === Op.CREATE) {
          // Tolerant of a missing CREATE signature unless strict: DIDs
          // created before Client-Managed-Secret-Mode gained its signature
          // collection phase carry none, and rejecting them would make
          // them unresolvable (⇔ the reference's comment, log.rb:314).
          if (el.sig == null) {
            if (options.strict_create_sig) {
              currentDID.error = 1;
              currentDID.message = "missing signature in CREATE log entry";
              return currentDID;
            }
          } else if (!(await matchLogDid(el, doc))) {
            currentDID.error = 1;
            currentDID.message = "Signatures in log don't match";
            return currentDID;
          }
        } else {
          // UPDATE authorization (finding 1): install an UPDATE only if its
          // signature was already verified against the prior version's
          // authorized keys in a preceding revocation branch. An UPDATE
          // reached without that proof — e.g. one spliced directly onto
          // CREATE — is rejected rather than trusted.
          const updateHash = (
            await multiHash(canonical(logSlice(el)), LOG_HASH_OPTIONS)
          )[0];
          if (updateHash === null || !verifiedUpdateHashes.has(updateHash)) {
            currentDID.error = 1;
            currentDID.message = "unauthorized UPDATE log entry";
            return currentDID;
          }
        }
        currentDID.did = docDid;
        currentDID.doc = doc;
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
          currentDID.error = 2;
          currentDID.message = docResult[1];
          return currentDID;
        }
        const doc = docResult[0].doc;

        if (!(await matchLogDid(el, doc))) {
          currentDID.error = 1;
          currentDID.message = "Signatures in log don't match";
          return currentDID;
        }

        // the document's `log` field must be the hash of this TERMINATE
        // entry (spec §4.2.2 #calculate_hash)
        let term = doc.log;
        let logLocation = term.includes("@")
          ? term.split("@").pop()!
          : term.includes("%40")
            ? term.split("%40").pop()!
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
          currentDID.error = 1;
          currentDID.message = "Log reference and record don't match";
          return currentDID;
        }

        // check if there is a revocation entry (spec §3.2.3 #deactivation).
        // The revocation lookup MUST fail closed (finding 3): a timeout,
        // HTTP error, oversized or malformed response must not be read as
        // "no revocation exists" and serve a possibly-revoked document.
        let revocationRecord: LogEntry | null = null;
        const revocTerm = stripLocation(el.doc);
        const [logArray] = await retrieveLog(didHash, logLocation, options);
        if (logArray === null) {
          // whatever the cause — timeout, HTTP error, malformed or oversized
          // response — the revocation check could not be completed, which is
          // an operational failure, never "no revocation exists"
          currentDID.error = 2;
          currentDID.message = "revocation log unavailable";
          return currentDID;
        }
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
          // the revocation is published — only an UPDATE building on it
          // keeps the DID alive
          let updateTermFound = false;
          const revocationHash = (
            await multiHash(canonical(revocationRecord), LOG_HASH_OPTIONS)
          )[0];
          for (const logEl of logArray) {
            if (logEl.op === Op.UPDATE) {
              if ((logEl.previous ?? []).includes(revocationHash ?? "")) {
                updateTermFound = true;
                const message = String(logEl.doc);
                const signature = String(logEl.sig ?? "");
                // The UPDATE must be signed by the current version's own
                // authorized document key. Delegation keys are NOT honored
                // (finding 1/2): the reference never authenticates DELEGATE
                // entries — it flags this `!!!OPEN` — so trusting a delegate
                // key (however DAG-connected) would trust an unauthenticated
                // key. Delegated-key updates therefore fail closed until an
                // authenticated-delegation rule + reference vector exist
                // (REFERENCE-MAP §"Security hardening", deviation 9).
                const authorizedKey = currentDID.doc.key.split(":")[0];
                if (!(await verify(message, signature, authorizedKey))[0]) {
                  currentDID.error = 1;
                  currentDID.message = "Signature does not match";
                  return currentDID;
                }
                // record the authorization so the UPDATE may be installed
                // when the walk reaches it (finding 1)
                const updateHash = (
                  await multiHash(canonical(logSlice(logEl)), LOG_HASH_OPTIONS)
                )[0];
                if (updateHash !== null) verifiedUpdateHashes.add(updateHash);
                break;
              }
            }
          }
          revoked = !updateTermFound;
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
        currentDID.error = 2;
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
