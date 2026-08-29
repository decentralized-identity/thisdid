/**
 * Golden vectors — live captures from the reference deployment
 * (oydid.ownyourdata.eu repository + resolver.ownyourdata.eu resolver),
 * taken 2026-08-28. The DID is the long-stable OYDID canary (created
 * 2022-01-03), also used by ThisDID's probe worker.
 */

export const CANARY_DID =
  "did:oyd:zQmaBZTghndXTgxNwfbdpVLWdFf6faYE4oeuN2zzXdQt1kh";
export const CANARY_HASH = CANARY_DID.replace("did:oyd:", "");

/** GET https://oydid.ownyourdata.eu/doc/{hash} */
export const CANARY_DOC = {
  doc: { simple: "example" },
  key: "z6MusYB5iT5krCHYsZ76EzBaTdRwGKsaBhMcSbrXaPJgkuRQ:z6Mv7EYihbAat6Wq7GsjNsjcxt58dZT8fmsRjQGTkYamYrjB",
  log: "zQmVwMvovLy5KNYHHVHQ1wv8J7y9L6UPE8eyU4tzypFWtYe",
};

/** GET https://oydid.ownyourdata.eu/log/{hash} */
export const CANARY_LOG = [
  {
    ts: 1641224736,
    op: 2,
    doc: "zQmaBZTghndXTgxNwfbdpVLWdFf6faYE4oeuN2zzXdQt1kh",
    sig: "z3Kb5qeReCqr3ftxpf2i5UypUwrzrVkyspMtaDcb6e9YdHVSptcAFgvwbgk3qWqspTcGiKDYKXZZh8g6XyM2WPmNp",
    previous: [] as string[],
  },
  {
    ts: 1641224736,
    op: 0,
    doc: "zQmT8SG7a238bF7wdV7LdrEAQpimqhKGor7CQsjtCYdZdTS",
    sig: "z63hu8LseptBrvB2kEDwhPP35sBj7JDDJsEDW85cjRkrjjac9ZV3HxPW9NVKewHcQYwrVLVsnDCcm1RjbEARE5rJU",
    previous: [] as string[],
  },
];

/** didDocument from GET https://resolver.ownyourdata.eu/1.0/identifiers/{did} */
export const REFERENCE_DOCUMENT = {
  "@context": [
    "https://www.w3.org/ns/did/v1",
    "https://w3id.org/security/suites/ed25519-2020/v1",
  ],
  id: CANARY_DID,
  verificationMethod: [
    {
      id: CANARY_DID + "#key-doc",
      type: "Ed25519VerificationKey2020",
      controller: CANARY_DID,
      publicKeyMultibase: "z6MusYB5iT5krCHYsZ76EzBaTdRwGKsaBhMcSbrXaPJgkuRQ",
    },
    {
      id: CANARY_DID + "#key-rev",
      type: "Ed25519VerificationKey2020",
      controller: CANARY_DID,
      publicKeyMultibase: "z6Mv7EYihbAat6Wq7GsjNsjcxt58dZT8fmsRjQGTkYamYrjB",
    },
  ],
  service: [
    {
      id: CANARY_DID + "#payload",
      type: "Custom",
      serviceEndpoint: "https://oydid.ownyourdata.eu",
      payload: { simple: "example" },
    },
  ],
};

/** didDocumentMetadata from the same reference resolution */
export const REFERENCE_METADATA = {
  keys: [
    {
      kid: CANARY_DID + "#key-doc",
      kms: "local",
      type: "Ed25519",
      publicKeyHex:
        "ed200e5ecc2b637e229fc0a49cbef937ff8ce568d238f71c6c9e6391564cdb7d7e9f",
    },
    {
      kid: CANARY_DID + "#key-rev",
      kms: "local",
      type: "Ed25519",
      publicKeyHex:
        "ed20d9de6cfd4bb1c24442db33ac6aa17c4d80d40e1fc483279ef321ccffd57151ea",
    },
  ],
  registry: "https://oydid.ownyourdata.eu",
  log_hash: "zQmVwMvovLy5KNYHHVHQ1wv8J7y9L6UPE8eyU4tzypFWtYe",
  log: CANARY_LOG,
  document_log_id: 0,
  termination_log_id: 1,
  canonicalId: CANARY_DID,
  versionId: CANARY_HASH,
  created: "2022-01-03T15:45:36Z",
};

/** Serves the canary from a stubbed fetch, mirroring the repository API. */
export function canaryFetch(input: RequestInfo | URL): Promise<Response> {
  const url = String(input);
  if (url.endsWith("/doc/" + CANARY_HASH)) {
    return Promise.resolve(Response.json(CANARY_DOC));
  }
  if (url.endsWith("/doc_raw/" + CANARY_HASH)) {
    return Promise.resolve(Response.json({ doc: CANARY_DOC, log: CANARY_LOG }));
  }
  if (url.endsWith("/log/" + CANARY_HASH)) {
    return Promise.resolve(Response.json(CANARY_LOG));
  }
  return Promise.resolve(
    Response.json({ error: "not found" }, { status: 404 }),
  );
}
