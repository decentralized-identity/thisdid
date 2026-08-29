/**
 * Transliteration of the document-composition half of
 * `ruby-gem/lib/oydid.rb` from the OYDID reference, pinned at
 * OwnYourData/oydid@48a62c9, against spec v0.6 §3.2.1 (#resolution_result):
 * w3c, expand_verification_methods, version_ids, version_metadata,
 * document_id. Delegation keys are taken from the already fetched log
 * (getDelegatedPubKeysFromFullDidDocument) instead of the gem's network
 * re-read — same input log, same output keys (REFERENCE-MAP §5).
 */
import {
  getLocation,
  multiDecode,
  percentEncode,
  stripLocation,
  MULTICODEC_ED25519_PUB,
  type DidInfo,
} from "./basic.js";

export const ED25519_SECURITY_SUITE =
  "https://w3id.org/security/suites/ed25519-2020/v1";

/** A composed (open-shape) W3C DID document. */
export type W3cDocument = Record<string, unknown>;

/** ⇔ expand_verification_methods (oydid.rb:1441) */
export function expandVerificationMethods(
  payload: Record<string, unknown>,
  wd: W3cDocument,
  did: string,
): W3cDocument {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload))
    return wd;

  for (const vm of [
    "authentication",
    "assertionMethod",
    "keyAgreement",
    "capabilityInvocation",
    "capabilityDelegation",
  ]) {
    if (String(payload[vm] ?? "") === "") continue;
    let entries = payload[vm];
    if (!Array.isArray(entries)) entries = [entries];

    const newEntries: unknown[] = [];
    for (const el of entries as unknown[]) {
      if (typeof el === "string") {
        newEntries.push(percentEncode(did) + el);
      } else {
        const newEl = { ...(el as Record<string, unknown>) };
        newEl["id"] = percentEncode(did) + String(newEl["id"] ?? "");
        if (String(newEl["controller"] ?? "") === "") {
          newEl["controller"] = percentEncode(did);
        }
        newEntries.push(newEl);
      }
    }

    wd[vm] = newEntries.length > 0 ? newEntries : payload[vm];
    delete payload[vm];
  }
  return wd;
}

/** ⇔ version_ids (oydid.rb:1508) — [canonicalId, equivalentIds], oldest
 *  first, location-free unless keepLocation (which only w3c uses, to keep
 *  alsoKnownAs listing the location-bound variant). */
export function versionIds(
  didInfo: DidInfo,
  keepLocation = false,
): [string, string[]] {
  const normalize = (id: string): string => {
    let out = keepLocation ? String(id) : stripLocation(String(id));
    out = percentEncode(out);
    if (!out.startsWith("did:oyd:")) out = "did:oyd:" + out;
    return out;
  };
  const canonicalId = normalize(didInfo.did);
  const own = documentId(didInfo);
  const equivalentIds: string[] = [];
  for (const log of didInfo.log ?? []) {
    if (log.op === 2 || log.op === 3) {
      // CREATE, UPDATE
      const eid = normalize(log.doc);
      if (eid !== own && !equivalentIds.includes(eid)) equivalentIds.push(eid);
    }
  }
  return [canonicalId, equivalentIds];
}

/** ⇔ version_metadata (oydid.rb:1544) — created / updated / versionId per
 *  DID Core 7.1.3; a property the log cannot answer is absent, not null. */
export function versionMetadata(didInfo: DidInfo): Record<string, string> {
  const asDatetime = (ts: unknown): string | null => {
    const seconds = Number(ts);
    if (!Number.isFinite(seconds)) return null;
    // XML Datetime normalised to UTC, no sub-second precision
    return new Date(seconds * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
  };
  const versionOf = (id: string): string =>
    stripLocation(String(id)).replace(/^did:oyd:/, "");

  const meta: Record<string, string> = {};
  const resolved = versionOf(didInfo.did);
  if (resolved !== "") meta["versionId"] = resolved;
  if (!didInfo.log) return meta;

  const createdEntry = didInfo.log.find((el) => el.op === 2);
  if (createdEntry?.ts != null) {
    const created = asDatetime(createdEntry.ts);
    if (created !== null) meta["created"] = created;
  }

  const updatedEntry = didInfo.log.find(
    (el) => el.op === 3 && versionOf(el.doc) === resolved,
  );
  if (updatedEntry?.ts != null) {
    const updated = asDatetime(updatedEntry.ts);
    if (updated !== null) meta["updated"] = updated;
  }

  return meta;
}

/** ⇔ document_id (oydid.rb:1587) — the requested identifier goes into the
 *  document; which version it is stays readable from canonicalId. */
export function documentId(didInfo: DidInfo): string {
  let did = String(didInfo.did_requested ?? "");
  if (did === "") did = String(didInfo.did);
  did = percentEncode(did);
  if (!did.startsWith("did:oyd:")) did = "did:oyd:" + did;
  return did;
}

/** ⇔ w3c (oydid.rb:1597, ed25519 branch) · spec §3.2.1 #resolution_result.
 *  p256-pub returns the reference's error object (REFERENCE-MAP §4). */
export function w3c(
  didInfo: DidInfo,
  options: { location?: string },
): W3cDocument {
  // check if doc is already a W3C DID (DID Rotation payload)
  const payloadDoc = didInfo.doc?.doc as Record<string, unknown> | undefined;
  const isAlreadyW3cDid =
    typeof payloadDoc === "object" &&
    payloadDoc !== null &&
    !Array.isArray(payloadDoc) &&
    "@context" in payloadDoc &&
    "id" in payloadDoc &&
    String(payloadDoc.id).split(":")[0] === "did";
  if (isAlreadyW3cDid) return payloadDoc as W3cDocument;

  const did = documentId(didInfo);
  const didDoc = { ...didInfo.doc };
  const [pubDocKey = "", pubRevKey = ""] = (didDoc.key ?? "").split(":");

  // Delegation keys are intentionally NOT composed into the document
  // (finding 1/2): the reference never authenticates DELEGATE entries, so a
  // `capabilityDelegation` derived from them would advertise unauthenticated
  // keys. Delegation support is deferred pending an authenticated-delegation
  // rule + reference vector (REFERENCE-MAP §"Security hardening").

  const oydContext: unknown[] = ["https://www.w3.org/ns/did/v1"];
  const [pubkey] = multiDecode(pubDocKey);
  if (pubkey === null) return { error: "unsupported key codec" };
  const code = pubkey.length === 34 ? pubkey[0] : (pubkey[0] << 8) | pubkey[1];
  if (code !== MULTICODEC_ED25519_PUB) {
    return { error: "unsupported key codec" };
  }
  oydContext.push(ED25519_SECURITY_SUITE);

  const wd: W3cDocument = {};
  const innerDoc: unknown = didDoc.doc;
  const innerIsHash =
    typeof innerDoc === "object" &&
    innerDoc !== null &&
    !Array.isArray(innerDoc);
  if (innerIsHash) {
    const inner = innerDoc as Record<string, unknown>;
    if (inner["@context"] == null) {
      wd["@context"] = oydContext;
    } else {
      wd["@context"] = Array.isArray(inner["@context"])
        ? [...new Set([...oydContext, ...(inner["@context"] as unknown[])])]
        : [...new Set([...oydContext, inner["@context"]])];
      delete inner["@context"];
    }
  } else {
    wd["@context"] = oydContext;
  }
  wd["id"] = percentEncode(did);
  wd["verificationMethod"] = [
    {
      id: did + "#key-doc",
      type: "Ed25519VerificationKey2020",
      controller: did,
      publicKeyMultibase: pubDocKey,
    },
    {
      id: did + "#key-rev",
      type: "Ed25519VerificationKey2020",
      controller: did,
      publicKeyMultibase: pubRevKey,
    },
  ];

  // alsoKnownAs: other versions of the DID, location-bound variant kept
  // (⇔ the reference's alsoKnownAs comment block, oydid.rb:1740)
  const equivalentIds = versionIds(didInfo, true)[1];
  if (equivalentIds.length > 0) wd["alsoKnownAs"] = equivalentIds;

  if (innerIsHash && (innerDoc as Record<string, unknown>)["service"] != null) {
    const inner = innerDoc as Record<string, unknown>;
    const location = options.location ?? getLocation(String(didInfo.did));
    let merged = expandVerificationMethods(inner, wd, did);
    merged = { ...merged, ...inner };
    const service = merged["service"];
    if (!(Array.isArray(service) && service.length === 0)) {
      const serviceArray = Array.isArray(service) ? service : [service];
      let first = {
        id: did + "#payload",
        type: "Custom",
        serviceEndpoint: location,
        ...(serviceArray[0] as Record<string, unknown>),
      } as Record<string, unknown>;
      if (String(first["id"] ?? "").startsWith("#")) {
        first = { ...first, id: did + String(first["id"]) };
      }
      merged["service"] = [first, ...serviceArray.slice(1)];
    }
    return merged;
  }

  let payload: unknown = null;
  if (innerIsHash) {
    const inner = innerDoc as Record<string, unknown>;
    if (Object.keys(inner).length > 0) {
      expandVerificationMethods(inner, wd, did);
      if (String(inner["alsoKnownAs"] ?? "") !== "") {
        const dda = Array.isArray(inner["alsoKnownAs"])
          ? (inner["alsoKnownAs"] as unknown[])
          : [inner["alsoKnownAs"]];
        wd["alsoKnownAs"] =
          wd["alsoKnownAs"] == null
            ? dda
            : [...(wd["alsoKnownAs"] as unknown[]), ...dda];
        delete inner["alsoKnownAs"];
      }
      payload = Object.keys(inner).length > 0 ? inner : null;
    }
  } else {
    payload = innerDoc;
  }
  if (payload != null) {
    const location = options.location ?? getLocation(String(didInfo.did));
    const isSingleService =
      Array.isArray(payload) &&
      payload.length === 1 &&
      typeof payload[0] === "object" &&
      payload[0] !== null &&
      (payload[0] as Record<string, unknown>)["id"] != null &&
      (payload[0] as Record<string, unknown>)["type"] != null &&
      (payload[0] as Record<string, unknown>)["serviceEndpoint"] != null;
    wd["service"] = isSingleService
      ? payload
      : [
          {
            id: did + "#payload",
            type: "Custom",
            serviceEndpoint: location,
            payload,
          },
        ];
  }
  return wd;
}
