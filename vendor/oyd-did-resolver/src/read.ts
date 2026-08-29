/**
 * Transliteration of `Oydid.read` (ruby-gem/lib/oydid.rb:65) from the OYDID
 * reference, pinned at OwnYourData/oydid@48a62c9, against spec v0.6 §3.2
 * (#read). Same walk: retrieve the DID document, retrieve and DAG-order the
 * provenance log, then dag_update to the current version.
 */
import {
  retrieveDocument,
  retrieveLog,
  DEFAULT_LOCATION,
  LOCATION_PREFIX,
  LOCATION_PREFIX_ESCAPED,
  type DidInfo,
  type DocRecord,
  type OydOptions,
  type Tuple,
} from "./basic.js";
import { dagDid, dag2array, dag2arrayTerminate, dagUpdate } from "./log.js";

/** ⇔ read (oydid.rb:65) · spec §3.2 #read */
export async function read(
  did: string,
  options: OydOptions,
): Promise<Tuple<DidInfo>> {
  if (String(did) === "") return [null, "missing DID"];

  // did_requested is the identifier the caller asked for; dag_update
  // overwrites "did" with every version it walks through (⇔ the
  // reference's currentDID setup comment, oydid.rb:71)
  const currentDID: DidInfo = {
    did,
    did_requested: did,
    doc: undefined as unknown as DocRecord,
    log: [],
    doc_log_id: null,
    termination_log_id: null,
    error: 0,
    message: "",
  };

  // get did location
  let didLocation = options.doc_location ?? "";
  if (didLocation === "" && options.location) didLocation = options.location;
  if (didLocation === "") {
    if (did.includes(LOCATION_PREFIX)) {
      const tmp = did.split(LOCATION_PREFIX);
      did = tmp[0];
      didLocation = tmp[1];
    }
    if (did.includes(LOCATION_PREFIX_ESCAPED)) {
      const tmp = did.split(LOCATION_PREFIX_ESCAPED);
      did = tmp[0];
      didLocation = tmp[1];
    }
  }
  if (didLocation === "") didLocation = DEFAULT_LOCATION;
  const didHash = did.replace(/^did:oyd:/, "");

  // retrieve DID document
  const documentResult = await retrieveDocument(didHash, didLocation, options);
  if (documentResult[0] === null) return [null, documentResult[1]];
  currentDID.doc = documentResult[0];

  // get log location. Spec-conformance note (REFERENCE-MAP §7): the spec
  // defines %40 as the W3C-conform representation of "@", so both forms are
  // recognized here — the reference splits the log reference on "@" only
  // (its dag_update handles both).
  let logHash = documentResult[0].log;
  let logLocation = options.log_location ?? "";
  if (logLocation === "" && options.location) logLocation = options.location;
  if (logLocation === "") {
    if (logHash.includes(LOCATION_PREFIX)) {
      const hashSplit = logHash.split(LOCATION_PREFIX);
      logHash = hashSplit[0];
      logLocation = hashSplit[1];
    } else if (logHash.includes(LOCATION_PREFIX_ESCAPED)) {
      const hashSplit = logHash.split(LOCATION_PREFIX_ESCAPED);
      logHash = hashSplit[0];
      logLocation = hashSplit[1];
    }
  }
  if (logLocation === "") logLocation = DEFAULT_LOCATION;

  // retrieve and traverse log to get current DID state
  const [logArray, logMessage] = await retrieveLog(
    didHash,
    logLocation,
    options,
  );
  if (logArray === null) return [null, logMessage];

  const [dag, createIndex, terminateIndex, dagMessage] = await dagDid(
    logArray,
    options,
  );
  if (dag === null || createIndex === null || terminateIndex === null) {
    return [null, dagMessage];
  }

  const result = dag2array(dag, logArray, createIndex, []);
  const orderedLogArray = dag2arrayTerminate(dag, logArray, terminateIndex, [
    ...result,
  ]);
  currentDID.log = orderedLogArray;

  // identify if DID Rotation was performed: the stored payload is itself a
  // W3C DID document of another method (⇔ rotated_DID, oydid.rb:180)
  let rotatedDID = false;
  try {
    const payload = currentDID.doc.doc as Record<string, unknown>;
    rotatedDID =
      typeof payload === "object" &&
      payload !== null &&
      "@context" in payload &&
      "id" in payload &&
      String(payload.id).split(":")[0] === "did";
  } catch {
    // ⇔ `rescue false`
    rotatedDID = false;
  }

  let updated: DidInfo;
  if (rotatedDID) {
    const doc = currentDID.doc;
    updated = await dagUpdate(currentDID, options);
    updated.doc = doc;
  } else {
    updated = await dagUpdate(currentDID, options);
  }
  if (options.log_complete) updated.log = logArray;
  return [updated, ""];
}
